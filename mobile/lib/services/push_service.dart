import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'api_client.dart';

/// Push notifications via Firebase Cloud Messaging.
///
/// Every method here is best-effort. A device with no Google Play Services, a user who
/// declines the permission prompt, or a project with no Firebase configuration must all
/// leave the app fully usable — notifications are a convenience layered on top of the
/// wallet and store, never a precondition for them.
class PushService {
  PushService(this._api);

  final ApiClient _api;

  String? _token;

  /// Firebase is initialised once per process, so availability is process-wide.
  static bool _available = false;

  /// Whether push is usable in this build/device at all.
  static bool get isAvailable => _available;

  /// The token currently registered with the backend, if any. Needed at sign-out so the
  /// device can be unregistered.
  String? get token => _token;

  /// How long startup will wait for Firebase before giving up on push for this launch.
  ///
  /// `Firebase.initializeApp()` does not reliably fail fast: on a device where the
  /// platform channel never answers it hangs indefinitely rather than throwing. Since
  /// `main()` awaits this before `runApp`, an unbounded wait means a permanently blank
  /// screen — the app would appear completely broken because of an optional feature.
  static const Duration _initTimeout = Duration(seconds: 5);

  /// Initialises Firebase once, at startup. Safe to call when Firebase is not configured
  /// or unreachable — it records that push is unavailable and returns without throwing.
  static Future<void> initializeFirebase() async {
    try {
      await Firebase.initializeApp().timeout(_initTimeout);
      _available = true;
    } catch (e) {
      // Most often: no google-services.json / GoogleService-Info.plist in the build, a
      // device without Play Services, or the timeout above. None is something the user
      // can act on, and none should stop the app from opening.
      debugPrint('[push] Firebase unavailable, notifications disabled: $e');
      _available = false;
    }
  }

  /// Asks for notification permission and registers this device with the backend.
  ///
  /// Call after sign-in, not at startup: asking before the user has any orders to be
  /// notified about is the reliable way to get the prompt permanently denied.
  Future<void> registerDevice() async {
    if (!_available) return;

    try {
      final messaging = FirebaseMessaging.instance;

      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('[push] notification permission denied');
        return;
      }

      final token = await messaging.getToken();
      if (token == null) return;

      await _sendTokenToBackend(token);

      // FCM rotates tokens (app reinstall, restore from backup, periodic refresh). Without
      // this the device silently stops receiving notifications after a rotation.
      messaging.onTokenRefresh.listen((newToken) {
        _sendTokenToBackend(newToken).catchError((Object e) {
          debugPrint('[push] token refresh registration failed: $e');
        });
      });
    } catch (e) {
      debugPrint('[push] registration failed: $e');
    }
  }

  Future<void> _sendTokenToBackend(String token) async {
    await _api.post('/notifications/devices', body: {
      'token': token,
      'platform': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
    });
    _token = token;
  }

  /// Unregisters this device. Called on sign-out so that a shared or resold phone stops
  /// receiving the previous account's notifications, which name order amounts and codes.
  Future<void> unregisterDevice() async {
    final token = _token;
    if (token == null) return;
    try {
      await _api.post('/notifications/devices/unregister', body: {'token': token});
    } catch (e) {
      // Sign-out must never be blocked by this. The backend also reassigns a token when
      // another account registers it, so a missed unregister self-corrects.
      debugPrint('[push] unregister failed: $e');
    } finally {
      _token = null;
    }
  }

  /// Fires when a notification arrives while the app is open. Android does not display a
  /// system notification in that case, so the UI has to surface it (see HomeShell).
  Stream<RemoteMessage> get onForegroundMessage =>
      _available ? FirebaseMessaging.onMessage : const Stream<RemoteMessage>.empty();
}
