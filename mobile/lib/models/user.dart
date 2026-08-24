class AppUser {
  final String id;

  /// Set only once the customer links and verifies a Libyana number — see
  /// LinkPhoneScreen. Required to top up; not required to use the rest of the app.
  final String? phone;

  /// The account's identity and sign-in credential.
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
