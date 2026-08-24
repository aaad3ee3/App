import '../models/store_order.dart';
import 'api_client.dart';

class OrdersService {
  OrdersService(this._api);
  final ApiClient _api;

  Future<StoreOrder> createOrder({
    required String productId,
    int? quantity,
    String? targetLink,
    String? couponCode,
  }) async {
    final json = await _api.post(
      '/orders',
      body: {
        'product_id': productId,
        'quantity': ?quantity,
        if (targetLink != null && targetLink.isNotEmpty) 'target_link': targetLink,
        if (couponCode != null && couponCode.isNotEmpty) 'coupon_code': couponCode,
      },
    );
    return StoreOrder.fromJson(json);
  }

  Future<List<StoreOrder>> listOrders() async {
    final json = await _api.get('/orders');
    final items = (json['items'] as List).cast<Map<String, dynamic>>();
    return items.map(StoreOrder.fromJson).toList();
  }

  Future<StoreOrder> getOrder(String id) async {
    final json = await _api.get('/orders/$id');
    return StoreOrder.fromJson(json);
  }
}
