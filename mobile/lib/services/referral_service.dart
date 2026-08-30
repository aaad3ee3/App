import '../models/referral_info.dart';
import 'api_client.dart';

class ReferralService {
  ReferralService(this._api);
  final ApiClient _api;

  Future<ReferralInfo> getMyReferralInfo() async {
    final json = await _api.get('/referral/me');
    return ReferralInfo.fromJson(json);
  }
}
