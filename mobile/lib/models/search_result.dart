import 'category.dart';
import 'product.dart';

/// One catalog search hit: the product, plus the category it belongs to.
///
/// The category is not decoration — a gift card and an SMM service are bought through
/// completely different screens, so without it the app cannot act on a result.
class CatalogSearchResult {
  CatalogSearchResult({required this.product, required this.category});

  final StoreProduct product;
  final StoreCategory category;

  factory CatalogSearchResult.fromJson(Map<String, dynamic> json) => CatalogSearchResult(
        product: StoreProduct.fromJson(json),
        category: StoreCategory.fromJson(json['category'] as Map<String, dynamic>),
      );
}
