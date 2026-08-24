class ReferralInfo {
  final String code;
  final String shareText;
  final int referredCount;
  final String totalEarned;
  final String bonusAmount;

  ReferralInfo({
    required this.code,
    required this.shareText,
    required this.referredCount,
    required this.totalEarned,
    required this.bonusAmount,
  });

  factory ReferralInfo.fromJson(Map<String, dynamic> json) => ReferralInfo(
        code: json['code'] as String,
        shareText: json['share_text'] as String,
        referredCount: (json['referred_count'] as num).toInt(),
        totalEarned: json['total_earned'] as String,
        bonusAmount: json['bonus_amount'] as String,
      );
}
