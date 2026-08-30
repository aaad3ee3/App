import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_store.dart';
import '../theme/app_theme.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';

/// Shown in place of a screen a visitor cannot use yet — the wallet, their orders, their
/// profile.
///
/// Deliberately not a dead end: it says what the screen is for and offers the two ways
/// forward. A guest who hits this has already browsed the catalog and seen the prices,
/// which is the moment an account is worth creating to them.
class SignInGate extends StatelessWidget {
  const SignInGate({super.key, required this.icon, required this.title, required this.message});

  final IconData icon;
  final String title;
  final String message;

  static void _go(BuildContext context, Widget screen) {
    // pushReplacement, not push: this widget lives inside a bottom-tab shell, so a plain
    // push would leave the shell underneath and a back gesture would drop the customer
    // into a store they still cannot buy from.
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: AppColors.gold.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 44, color: AppColors.gold),
            ),
            const SizedBox(height: 24),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14.5,
                height: 1.7,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 28),
            SizedBox(
              width: 260,
              child: FilledButton.icon(
                onPressed: () => _go(context, const RegisterScreen()),
                icon: const Icon(Icons.person_add_alt_rounded, size: 20),
                label: const Text('إنشاء حساب'),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: 260,
              child: OutlinedButton(
                onPressed: () => _go(context, const LoginScreen()),
                child: const Text('عندي حساب — تسجيل الدخول'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Asks a guest to sign in at the moment they try to buy something.
///
/// Returns true only if the caller should carry on with the purchase — i.e. the customer
/// was already signed in. Choosing to create an account navigates away, so there is no
/// purchase left to resume.
///
/// The guard is a courtesy, not the control: the orders endpoint rejects an unauthenticated
/// caller regardless. This exists so a guest gets an explanation instead of a 401.
Future<bool> ensureSignedInToBuy(BuildContext context) async {
  if (!context.read<AuthStore>().isGuest) return true;

  final choice = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('محتاج حساب عشان تشتري'),
      content: const Text(
        'التصفّح مفتوح للجميع، لكن الشراء يحتاج حساب — عشان نحفظ أكوادك ورصيدك وطلباتك.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: const Text('لاحقاً'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: const Text('إنشاء حساب'),
        ),
      ],
    ),
  );

  if (choice == true && context.mounted) {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const RegisterScreen()),
    );
  }
  return false;
}

/// Wraps a screen so guests see [gate] instead of it. Keeps the "am I signed in?" check in
/// one place rather than repeating the same conditional at the top of every tab.
class RequiresAccount extends StatelessWidget {
  const RequiresAccount({super.key, required this.gate, required this.child});

  final SignInGate gate;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isGuest = context.watch<AuthStore>().isGuest;
    return isGuest ? gate : child;
  }
}
