import '../models/wallet.dart';
import 'api_client.dart';

class WalletService {
  WalletService(this._api);
  final ApiClient _api;

  Future<WalletBalance> getBalance() async {
    final json = await _api.get('/wallet');
    return WalletBalance.fromJson(json);
  }

  /// Returns one page of the wallet ledger plus whether more pages exist, so the wallet
  /// screen can offer "تحميل المزيد" instead of ever loading a customer's entire history
  /// (which, for an active account, only grows) in one request.
  Future<({List<WalletTransaction> items, bool hasMore})> getTransactions({int page = 1, int pageSize = 20}) async {
    final json = await _api.get('/wallet/transactions', query: {'page': '$page', 'page_size': '$pageSize'});
    final items = (json['items'] as List).cast<Map<String, dynamic>>().map(WalletTransaction.fromJson).toList();
    final total = (json['total'] as num).toInt();
    return (items: items, hasMore: page * pageSize < total);
  }
}
