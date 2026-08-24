import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'screens/splash_screen.dart';
import 'services/app_config.dart';
import 'services/auth_store.dart';
import 'services/push_service.dart';
import 'services/settings_store.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialises Firebase if it is configured for this build. Awaited so that a session
  // restored on the splash screen can register its device token immediately; the call
  // swallows its own failures, so an app built without Firebase still starts normally.
  await PushService.initializeFirebase();

  runApp(const SayehApp());
}

class SayehApp extends StatelessWidget {
  const SayehApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthStore()),
        // Loaded here rather than on the splash screen so the very first frame is already
        // painted in the customer's chosen theme — reading it later makes the app flash
        // light before flipping to dark.
        ChangeNotifierProvider(create: (_) => SettingsStore()..load()),
        // Depends on the auth store's API client, and loads immediately: the support
        // contact and policy links are needed on the sign-up screen, before login.
        ChangeNotifierProxyProvider<AuthStore, AppConfigStore>(
          create: (context) => AppConfigStore(context.read<AuthStore>().api)..load(),
          update: (_, _, previous) => previous!,
        ),
      ],
      child: Consumer<SettingsStore>(
        builder: (context, settings, _) => _buildApp(settings.themeMode),
      ),
    );
  }

  Widget _buildApp(ThemeMode themeMode) {
    return MaterialApp(
      title: 'سايح',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        // Clamp text scaling: the OS accessibility slider goes high enough to break
        // price rows and button labels, and this app's layouts are dense.
        child: MediaQuery.withClampedTextScaling(
          minScaleFactor: 0.9,
          maxScaleFactor: 1.3,
          child: child!,
        ),
      ),
      home: const SplashScreen(),
    );
  }
}
