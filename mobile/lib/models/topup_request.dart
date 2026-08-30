class TopupRequest {
  final String id;
  final String senderPhone;
  /// Null when the customer skipped declaring an amount — any transfer from their phone
  /// gets credited as-is. See sms.repository.ts `findMatchCandidates` on the backend.
  final String? requestedAmount;
  final String status;
  final DateTime expiresAt;
  final DateTime createdAt;

  TopupRequest({
    required this.id,
    required this.senderPhone,
    required this.requestedAmount,
    required this.status,
    required this.expiresAt,
    required this.createdAt,
  });

  factory TopupRequest.fromJson(Map<String, dynamic> json) => TopupRequest(
        id: json['id'] as String,
        senderPhone: json['sender_phone'] as String,
        requestedAmount: json['requested_amount'] as String?,
        status: json['status'] as String,
        expiresAt: DateTime.parse(json['expires_at'] as String),
        createdAt: DateTime.parse(json['created_at'] as String),
      );

  bool get isPending => status == 'pending';
}
