import '../models/search_result.dart';
import 'api_client.dart';

class FavoritesService {
  FavoritesService(this._api);
  final ApiClient _api;

  Future<List<CatalogSearchResult>> list() async {
    final json = await _api.get('/favorites');
    final items = (json['items'] as List).cast<Map<String, dynamic>>();
    return items.map(CatalogSearchResult.fromJson).toList();
  }

  Future<Set<String>> listIds() async {
    final json = await _api.get('/favorites/ids');
    return (json['items'] as List).cast<String>().toSet();
  }

  Future<void> add(String productId) => _api.post('/favorites/$productId');

  Future<void> remove(String productId) => _api.delete('/favorites/$productId');
}
