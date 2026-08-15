class AppUser {
  final String id;
  final String email;
  final String? fullName;
  final bool isAdmin;

  AppUser({required this.id, required this.email, this.fullName, this.isAdmin = false});

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        email: json['email'] as String,
        fullName: json['full_name'] as String?,
        isAdmin: json['is_admin'] as bool? ?? false,
      );
}
