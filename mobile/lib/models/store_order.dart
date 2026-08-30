class StoreOrder {
  final String id;
  final String productId;
  final String kind; // 'giftcard' | 'smm'
  final int quantity;
  final String? targetLink;
  final String unitPrice;
  final String totalPrice;
  final String status; // pending | processing | completed | failed | ambiguous_error | refunded
  final Map<String, dynamic>? supplierResponse;
  final String? errorMessage;
  final DateTime createdAt;

  StoreOrder({
    required this.id,
    required this.productId,
    required this.kind,
    required this.quantity,
    required this.targetLink,
    required this.unitPrice,
    required this.totalPrice,
    required this.status,
    required this.supplierResponse,
    required this.errorMessage,
    required this.createdAt,
  });

  factory StoreOrder.fromJson(Map<String, dynamic> json) => StoreOrder(
        id: json['id'] as String,
        productId: json['product_id'] as String,
        kind: json['kind'] as String,
        quantity: (json['quantity'] as num).toInt(),
        targetLink: json['target_link'] as String?,
        unitPrice: json['unit_price'] as String,
        totalPrice: json['total_price'] as String,
        status: json['status'] as String,
        supplierResponse: json['supplier_response'] as Map<String, dynamic>?,
        errorMessage: json['error_message'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
      );

  String? get cardCode => supplierResponse?['cardCode'] as String?;
}
