class StoreProduct {
  final String id;
  /// 'giftcard' | 'smm' | 'social_topup'. Nullable because some older call sites (search
  /// results before this field existed) may not carry it — falls back to empty, which
  /// simply fails the `is*` checks below rather than crashing.
  final String kind;
  final String name;
  final String? description;
  final String? image;
  final String price;
  final String currency;
  final bool pricePer1000;
  final int? minQuantity;
  final int? maxQuantity;

  /// social_topup only — field labels (Arabic, as Libya Play names them) the customer
  /// must fill in at checkout, e.g. `["معرف المستخدم"]`.
  final List<String> requiredParams;

  /// True for a top-3 (by completed order count) product within its category — shown to
  /// the customer as a "most ordered" badge. Defaults to false so an older backend
  /// response with no such field simply shows no badge instead of crashing.
  final bool popular;

  StoreProduct({
    required this.id,
    this.kind = '',
    required this.name,
    required this.description,
    required this.image,
    required this.price,
    required this.currency,
    required this.pricePer1000,
    required this.minQuantity,
    required this.maxQuantity,
    this.requiredParams = const [],
    this.popular = false,
  });

  factory StoreProduct.fromJson(Map<String, dynamic> json) => StoreProduct(
        id: json['id'] as String,
        kind: json['kind'] as String? ?? '',
        name: json['name'] as String,
        description: json['description'] as String?,
        image: json['image'] as String?,
        price: json['price'] as String,
        currency: json['currency'] as String,
        pricePer1000: json['price_per_1000'] as bool? ?? false,
        minQuantity: (json['min_quantity'] as num?)?.toInt(),
        maxQuantity: (json['max_quantity'] as num?)?.toInt(),
        requiredParams: (json['required_params'] as List?)?.cast<String>() ?? const [],
        popular: json['popular'] as bool? ?? false,
      );

  bool get isSocialTopup => kind == 'social_topup';

  double get priceValue => double.tryParse(price) ?? 0;

  /// Postgres returns NUMERIC(14,4) padded to four decimals ("9.2900"), which reads like
  /// a rounding artifact on a price tag. Sync stores prices rounded to two decimals, so
  /// trimming to two here shows exactly what the customer will be charged.
  String get formattedPrice => priceValue.toStringAsFixed(2);
}
