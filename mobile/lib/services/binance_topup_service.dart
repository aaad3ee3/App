import 'api_client.dart';

class BinanceTopupResult {
  final double amountUsdt;
  final String currency;
  final double amountLyd;

  BinanceTopupResult({required this.amountUsdt, required this.currency, required this.amountLyd});

  factory BinanceTopupResult.fromJson(Map<String, dynamic> json) => BinanceTopupResult(
        amountUsdt: (json['amount_usdt'] as num).toDouble(),
        currency: json['currency'] as String,
        amountLyd: (json['amount_lyd'] as num).toDouble(),
      );
}

class BinanceTopupService {
  BinanceTopupService(this._api);
  final ApiClient _api;

  /// Verifies a customer-supplied Binance Pay Order ID and credits the wallet on success.
  /// Throws [ApiException] with a ready-to-show Arabic message on any failure (already
  /// used, not found yet, unsupported currency, or Binance temporarily unreachable).
  Future<BinanceTopupResult> verify(String orderId) async {
    final json = await _api.post('/topups/binance/verify', body: {'order_id': orderId});
    return BinanceTopupResult.fromJson(json);
  }
}
