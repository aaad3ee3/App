class AppUser {
  final String id;

  /// The account's identity and sign-in credential. Nullable only for accounts created
  /// before phone auth shipped, which sign in by email until they add a number.
  final String? phone;

  /// Optional since phone became the identity — many customers have no email at all.
  final String? email;

  final String? fullName;
  final bool isAdmin;

  AppUser({
    required this.id,
    this.phone,
    this.email,
    this.fullName,
    this.isAdmin = false,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        phone: json['phone'] as String?,
        email: json['email'] as String?,
        fullName: json['full_name'] as String?,
        isAdmin: json['is_admin'] as bool? ?? false,
      );
}
