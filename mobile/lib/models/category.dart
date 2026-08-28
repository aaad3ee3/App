class StoreCategory {
  final String id;
  final String kind; // 'giftcard' | 'smm' | 'social_topup'
  final String name;
  final String? image;

  /// Available products in this category. Defaults to 0 rather than null so the card can
  /// render a count unconditionally — an older backend that does not send the field yet
  /// simply shows nothing instead of crashing on a null.
  final int productCount;

  StoreCategory({
    required this.id,
    required this.kind,
    required this.name,
    this.image,
    this.productCount = 0,
  });

  factory StoreCategory.fromJson(Map<String, dynamic> json) => StoreCategory(
        id: json['id'] as String,
        kind: json['kind'] as String,
        name: json['name'] as String,
        image: json['image'] as String?,
        productCount: (json['product_count'] as num?)?.toInt() ?? 0,
      );

  bool get isGiftcard => kind == 'giftcard';
  bool get isSocialTopup => kind == 'social_topup';
}
