class StoreProduct {
  final String id;
  final String name;
  final String? description;
  final String? image;
  final String price;
  final String currency;
  final bool pricePer1000;
  final int? minQuantity;
  final int? maxQuantity;

  StoreProduct({
    required this.id,
    required this.name,
    required this.description,
    required this.image,
    required this.price,
    required this.currency,
    required this.pricePer1000,
    required this.minQuantity,
    required this.maxQuantity,
  });

  factory StoreProduct.fromJson(Map<String, dynamic> json) => StoreProduct(
        id: json['id'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        image: json['image'] as String?,
        price: json['price'] as String,
        currency: json['currency'] as String,
        pricePer1000: json['price_per_1000'] as bool? ?? false,
        minQuantity: (json['min_quantity'] as num?)?.toInt(),
        maxQuantity: (json['max_quantity'] as num?)?.toInt(),
      );

  double get priceValue => double.tryParse(price) ?? 0;

  /// Postgres returns NUMERIC(14,4) padded to four decimals ("9.2900"), which reads like
  /// a rounding artifact on a price tag. Sync stores prices rounded to two decimals, so
  /// trimming to two here shows exactly what the customer will be charged.
  String get formattedPrice => priceValue.toStringAsFixed(2);
}
