import 'api_client.dart';

class CouponQuote {
  final double orderAmount;
  final double discountAmount;
  final double totalAfterDiscount;

  CouponQuote({required this.orderAmount, required this.discountAmount, required this.totalAfterDiscount});

  factory CouponQuote.fromJson(Map<String, dynamic> json) => CouponQuote(
        orderAmount: (json['order_amount'] as num).toDouble(),
        discountAmount: (json['discount_amount'] as num).toDouble(),
        totalAfterDiscount: (json['total_after_discount'] as num).toDouble(),
      );
}

class CouponsService {
  CouponsService(this._api);
  final ApiClient _api;

  Future<CouponQuote> preview({required String code, required String productId, int quantity = 1}) async {
    final json = await _api.post(
      '/coupons/preview',
      body: {'code': code, 'product_id': productId, 'quantity': quantity},
    );
    return CouponQuote.fromJson(json);
  }
}
