import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/app_config.dart';
import '../services/auth_store.dart';
import '../theme/app_theme.dart';
import '../widgets/sayeh_logo.dart';
import 'auth/login_screen.dart';
import 'home_shell.dart';
import 'update_required_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 650),
  )..forward();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final auth = context.read<AuthStore>();
    final appConfig = context.read<AppConfigStore>();
    // Restoring the session is usually instant, which makes the logo flash by. Hold the
    // splash for a beat so the brand registers instead of stuttering. appConfig.load()
    // is awaited here too (not just fired at app start) so the update check is settled
    // before routing — it no-ops immediately if the app-start call already finished.
    await Future.wait([
      auth.bootstrap(),
      appConfig.load(),
      Future<void>.delayed(const Duration(milliseconds: 900)),
    ]);
    if (!mounted) return;

    // Checked before authentication, and wins regardless of it — a customer on a
    // retired build should not reach a signed-in screen just because they were already
    // logged in.
    final next = appConfig.updateRequired
        ? const UpdateRequiredScreen()
        : (auth.isAuthenticated ? const HomeShell() : const LoginScreen());

    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (_, _, _) => next,
        transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
        transitionDuration: const Duration(milliseconds: 350),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: isDark
                ? [AppColors.darkBackground, AppColors.navyDark]
                : [AppColors.creamLight, AppColors.cream],
          ),
        ),
        child: Center(
          child: FadeTransition(
            opacity: _controller,
            child: ScaleTransition(
              scale: Tween<double>(begin: 0.88, end: 1).animate(
                CurvedAnimation(parent: _controller, curve: Curves.easeOutBack),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SayehLogo(size: 104, showWordmark: true),
                  const SizedBox(height: 40),
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: isDark ? AppColors.goldLight : AppColors.gold,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
