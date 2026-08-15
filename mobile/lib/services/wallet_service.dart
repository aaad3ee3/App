import '../models/wallet.dart';
import 'api_client.dart';

class WalletService {
  WalletService(this._api);
  final ApiClient _api;

  Future<WalletBalance> getBalance() async {
    final json = await _api.get('/wallet');
    return WalletBalance.fromJson(json);
  }

  Future<List<WalletTransaction>> getTransactions() async {
    final json = await _api.get('/wallet/transactions');
    final items = (json['items'] as List).cast<Map<String, dynamic>>();
    return items.map(WalletTransaction.fromJson).toList();
  }
}
