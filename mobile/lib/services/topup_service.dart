import '../models/topup_request.dart';
import 'api_client.dart';

class TopupService {
  TopupService(this._api);
  final ApiClient _api;

  Future<TopupRequest> create({required String senderPhone, required double amount}) async {
    final json = await _api.post(
      '/topups',
      body: {'sender_phone': senderPhone, 'requested_amount': amount},
    );
    return TopupRequest.fromJson(json);
  }

  Future<List<TopupRequest>> list() async {
    final json = await _api.get('/topups');
    final items = (json['items'] as List).cast<Map<String, dynamic>>();
    return items.map(TopupRequest.fromJson).toList();
  }

  Future<void> cancel(String id) => _api.post('/topups/$id/cancel');
}
