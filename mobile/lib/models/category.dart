class StoreCategory {
  final String id;
  final String kind; // 'giftcard' | 'smm'
  final String name;
  final String? image;

  StoreCategory({required this.id, required this.kind, required this.name, this.image});

  factory StoreCategory.fromJson(Map<String, dynamic> json) => StoreCategory(
        id: json['id'] as String,
        kind: json['kind'] as String,
        name: json['name'] as String,
        image: json['image'] as String?,
      );

  bool get isGiftcard => kind == 'giftcard';
}
