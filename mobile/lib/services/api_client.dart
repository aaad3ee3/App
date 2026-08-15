import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

class ApiException implements Exception {
  final int statusCode;
  final String code;
  final String message;

  ApiException(this.statusCode, this.code, this.message);

  @override
  String toString() => message;
}

/// Thin wrapper around `http` for the backend's `/api/v1/*` surface — attaches the
/// bearer token via [tokenProvider], and unwraps the `{ error: { code, message } }`
/// shape every non-2xx response uses (see backend/src/plugins/error-handler.plugin.ts)
/// into an [ApiException].
class ApiClient {
  ApiClient({required this.tokenProvider});

  final String? Function() tokenProvider;

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query}) =>
      _request('GET', path, query: query);

  Future<Map<String, dynamic>> post(String path, {Object? body}) => _request('POST', path, body: body);

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
  }) async {
    final uri = Uri.parse('${ApiConfig.apiV1}$path').replace(queryParameters: query);
    final headers = {'Content-Type': 'application/json'};
    final token = tokenProvider();
    if (token != null) headers['Authorization'] = 'Bearer $token';

    http.Response response;
    try {
      switch (method) {
        case 'GET':
          response = await http.get(uri, headers: headers);
          break;
        case 'POST':
          response = await http.post(uri, headers: headers, body: body != null ? jsonEncode(body) : null);
          break;
        default:
          throw UnsupportedError('Unsupported HTTP method: $method');
      }
    } on http.ClientException {
      throw ApiException(0, 'network_error', 'تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت');
    }

    Map<String, dynamic> decoded = {};
    if (response.body.isNotEmpty) {
      final parsed = jsonDecode(response.body);
      if (parsed is Map<String, dynamic>) decoded = parsed;
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded;
    }

    final errorObj = decoded['error'] as Map<String, dynamic>?;
    throw ApiException(
      response.statusCode,
      errorObj?['code']?.toString() ?? 'unknown_error',
      errorObj?['message']?.toString() ?? 'حدث خطأ غير متوقع، حاول مرة أخرى',
    );
  }
}
