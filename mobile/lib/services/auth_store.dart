import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../models/user.dart';
import 'api_client.dart';
import 'push_service.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

/// Holds the current session (token + user) for the whole app, persists the bearer
/// token in secure storage, and restores it on startup by validating against
/// `GET /auth/me` — see `bootstrap()`, called once from the splash screen.
class AuthStore extends ChangeNotifier {
  AuthStore() {
    _api = ApiClient(tokenProvider: () => _token);
    _push = PushService(_api);
  }

  static const _tokenKey = 'auth_token';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  late final ApiClient _api;
  late final PushService _push;

  String? _token;
  AppUser? _user;
  AuthStatus status = AuthStatus.unknown;
  String? lastError;
  bool _isGuest = false;

  ApiClient get api => _api;
  PushService get push => _push;
  AppUser? get user => _user;
  bool get isAuthenticated => status == AuthStatus.authenticated;

  /// True when the customer chose "browse without an account". Deliberately kept in
  /// memory only — a guest is a visitor for this run of the app, not a persisted identity,
  /// and reopening the app should put them back at the sign-in screen rather than silently
  /// dropping them into a store they cannot buy from.
  ///
  /// Guest mode never affects what the API allows. Browsing is public server-side and
  /// buying is not, so this flag only decides what the UI offers — it grants nothing.
  bool get isGuest => _isGuest && !isAuthenticated;

  void continueAsGuest() {
    _isGuest = true;
    notifyListeners();
  }

  Future<void> bootstrap() async {
    _token = await _storage.read(key: _tokenKey);
    if (_token == null) {
      status = AuthStatus.unauthenticated;
      notifyListeners();
      return;
    }
    try {
      final me = await _api.get('/auth/me');
      _user = AppUser.fromJson(me);
      status = AuthStatus.authenticated;
      // Re-register on every launch: FCM rotates tokens, and a stale one silently stops
      // delivering.
      unawaited(_push.registerDevice());
    } catch (_) {
      await _clearSession();
      status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  /// Sign-up: email + password, account created and signed in immediately. No SMS round
  /// trip — a phone number only enters the picture later, when the customer links one to
  /// fund a top-up (see [requestLinkPhone] / [verifyLinkPhone]).
  Future<bool> register({
    required String email,
    required String password,
    required String confirmPassword,
    String? fullName,
  }) {
    return _authenticate(
      () => _api.post(
        '/auth/register',
        body: {
          'email': email,
          'password': password,
          'confirm_password': confirmPassword,
          if (fullName != null && fullName.trim().isNotEmpty) 'full_name': fullName.trim(),
        },
      ),
    );
  }

  Future<bool> login({required String email, required String password}) {
    return _authenticate(() => _api.post('/auth/login', body: {'email': email, 'password': password}));
  }

  /// Sign in with Google. Opens the account picker, then hands the resulting ID token to
  /// the backend, which verifies it against Google's certificates and issues our own
  /// session — the Google token itself is never used as a credential for our API.
  ///
  /// Returns false if the customer backs out of the picker, with no error shown: dismissing
  /// a sheet you opened by mistake is not a failure worth reporting.
  Future<bool> loginWithGoogle({required String? serverClientId}) async {
    lastError = null;
    if (serverClientId == null || serverClientId.isEmpty) {
      lastError = 'الدخول عبر جوجل غير مفعّل حالياً.';
      notifyListeners();
      return false;
    }
    try {
      // serverClientId is what makes Android hand back an idToken — without it the token
      // is silently null and there is nothing to send the backend. It comes from /config
      // so it is always the same value the server will accept as the audience.
      final signIn = GoogleSignIn(scopes: const ['email'], serverClientId: serverClientId);
      // Clears any account cached from a previous run, so the picker actually appears and
      // a customer can switch accounts instead of being silently signed back into the old one.
      await signIn.signOut();

      final account = await signIn.signIn();
      if (account == null) return false;

      final auth = await account.authentication;
      final idToken = auth.idToken;
      if (idToken == null) {
        // Almost always a configuration problem rather than anything the customer did —
        // the OAuth client ID is missing or the app's signing fingerprint is not registered.
        lastError = 'تعذّر إكمال الدخول عبر جوجل. حاول بطريقة أخرى أو تواصل مع الدعم.';
        notifyListeners();
        return false;
      }

      return _authenticate(() => _api.post('/auth/google', body: {'id_token': idToken}));
    } catch (e) {
      debugPrint('[auth] google sign-in failed: $e');
      lastError = 'تعذّر الدخول عبر جوجل. تأكد من اتصالك وحاول مرة أخرى.';
      notifyListeners();
      return false;
    }
  }

  /// Step 1 of linking a Libyana number to the signed-in account: asks the server to
  /// text a verification code. Requires being signed in already — unlike the old
  /// phone-registration flow, this proves the number belongs to an existing customer,
  /// not that it is free to sign up with.
  Future<bool> requestLinkPhone(String phone) async {
    lastError = null;
    try {
      await _api.post('/auth/phone/link/request', body: {'phone': phone});
      return true;
    } on ApiException catch (e) {
      lastError = e.message;
      notifyListeners();
      return false;
    }
  }

  /// Step 2: verify the code. On success the number is attached and verified — it stays
  /// linked to the account from then on, so a customer never has to re-verify it for a
  /// later top-up.
  Future<bool> verifyLinkPhone({required String phone, required String code}) async {
    lastError = null;
    try {
      final result = await _api.post('/auth/phone/link/verify', body: {'phone': phone, 'code': code});
      _user = AppUser.fromJson(result['user'] as Map<String, dynamic>);
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      lastError = e.message;
      notifyListeners();
      return false;
    }
  }

  Future<bool> requestPasswordResetCode(String phone) async {
    lastError = null;
    try {
      await _api.post('/auth/password-reset/request', body: {'phone': phone});
      return true;
    } on ApiException catch (e) {
      lastError = e.message;
      notifyListeners();
      return false;
    }
  }

  Future<bool> completePasswordReset({
    required String phone,
    required String code,
    required String password,
  }) async {
    lastError = null;
    try {
      await _api.post(
        '/auth/password-reset/complete',
        body: {'phone': phone, 'code': code, 'password': password},
      );
      return true;
    } on ApiException catch (e) {
      lastError = e.message;
      notifyListeners();
      return false;
    }
  }

  /// Deletes the account after re-authenticating. Returns null on success, or the
  /// server's reason for refusing — the wallet still holds money, or an order is
  /// unsettled, both of which the customer needs to see spelled out.
  Future<String?> deleteAccount(String password) async {
    try {
      await _api.post('/auth/delete-account', body: {'password': password});
      await _clearSession();
      status = AuthStatus.unauthenticated;
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<bool> _authenticate(Future<Map<String, dynamic>> Function() call) async {
    lastError = null;
    try {
      final result = await call();
      _token = result['token'] as String;
      await _storage.write(key: _tokenKey, value: _token);
      _user = AppUser.fromJson(result['user'] as Map<String, dynamic>);
      status = AuthStatus.authenticated;
      notifyListeners();
      // Asked for here rather than at startup: prompting before the user has anything to
      // be notified about is the reliable way to get it permanently denied. Not awaited —
      // sign-in should not wait on a permission dialog.
      unawaited(_push.registerDevice());
      return true;
    } on ApiException catch (e) {
      lastError = e.message;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    // Before revoking the session — the unregister call needs a valid bearer token.
    await _push.unregisterDevice();
    try {
      await _api.post('/auth/logout');
    } catch (_) {
      // Best-effort server-side revocation — clear the local session regardless.
    }
    await _clearSession();
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<void> _clearSession() async {
    _token = null;
    _user = null;
    // Signing out returns you to the sign-in screen, not to a half-usable guest store.
    _isGuest = false;
    await _storage.delete(key: _tokenKey);
  }
}
