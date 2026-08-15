import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'screens/splash_screen.dart';
import 'services/auth_store.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const SayehApp());
}

class SayehApp extends StatelessWidget {
  const SayehApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AuthStore(),
      child: MaterialApp(
        title: 'سايح',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.system,
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
      ),
    );
  }
}
