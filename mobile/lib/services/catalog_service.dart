import '../models/category.dart';
import '../models/product.dart';
import '../models/search_result.dart';
import 'api_client.dart';

class CatalogService {
  CatalogService(this._api);
  final ApiClient _api;

  Future<List<StoreCategory>> getCategories({String? kind}) async {
    final json = await _api.get('/catalog/categories', query: kind != null ? {'kind': kind} : null);
    final items = (json['items'] as List).cast<Map<String, dynamic>>();
    return items.map(StoreCategory.fromJson).toList();
  }

  Future<List<StoreProduct>> getProducts(String categoryId) async {
    final json = await _api.get('/catalog/categories/$categoryId/products');
    final items = (json['items'] as List).cast<Map<String, dynamic>>();
    return items.map(StoreProduct.fromJson).toList();
  }

  /// Used by "order again" on a past order — throws [ApiException] (404) if the product
  /// is no longer available, which the caller shows as "هذا المنتج لم يعد متاحاً".
  Future<StoreProduct> getProduct(String productId) async {
    final json = await _api.get('/catalog/products/$productId');
    return StoreProduct.fromJson(json);
  }

  /// Searches every category at once. [kind] scopes the search to the store tab the
  /// customer is currently looking at.
  Future<List<CatalogSearchResult>> search(String query, {String? kind}) async {
    final json = await _api.get('/catalog/search', query: {
      'q': query,
      'kind': ?kind,
    });
    final items = (json['items'] as List).cast<Map<String, dynamic>>();
    return items.map(CatalogSearchResult.fromJson).toList();
  }
}
