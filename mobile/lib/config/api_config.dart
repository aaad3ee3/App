/// Backend base URL. Override at build/run time with:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
/// (10.0.2.2 is how the Android emulator reaches the host machine's localhost;
/// a physical device needs the host's real LAN IP instead.)
class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  static const String apiV1 = '$baseUrl/api/v1';
}
