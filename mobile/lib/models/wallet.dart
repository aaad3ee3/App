class WalletBalance {
  final String balance;
  final String currency;

  WalletBalance({required this.balance, required this.currency});

  factory WalletBalance.fromJson(Map<String, dynamic> json) => WalletBalance(
        balance: json['balance'] as String,
        currency: json['currency'] as String,
      );

  double get amount => double.tryParse(balance) ?? 0;
}

class WalletTransaction {
  final String id;
  final String type;
  final String amount;
  final String balanceAfter;
  final String? note;
  final DateTime createdAt;

  WalletTransaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.balanceAfter,
    required this.note,
    required this.createdAt,
  });

  factory WalletTransaction.fromJson(Map<String, dynamic> json) => WalletTransaction(
        id: json['id'] as String,
        type: json['type'] as String,
        amount: json['amount'] as String,
        balanceAfter: json['balance_after'] as String,
        note: json['note'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
      );

  double get amountValue => double.tryParse(amount) ?? 0;
  bool get isCredit => amountValue >= 0;
}
