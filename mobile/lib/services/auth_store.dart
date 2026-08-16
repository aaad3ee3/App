import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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

  ApiClient get api => _api;
  PushService get push => _push;
  AppUser? get user => _user;
  bool get isAuthenticated => status == AuthStatus.authenticated;

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

  Future<bool> register({required String email, required String password, String? fullName}) {
    return _authenticate(
      () => _api.post(
        '/auth/register',
        body: {
          'email': email,
          'password': password,
          if (fullName != null && fullName.trim().isNotEmpty) 'full_name': fullName.trim(),
        },
      ),
    );
  }

  Future<bool> login({required String email, required String password}) {
    return _authenticate(() => _api.post('/auth/login', body: {'email': email, 'password': password}));
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
    await _storage.delete(key: _tokenKey);
  }
}
