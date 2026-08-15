import 'package:flutter/material.dart';

class AppTheme {
  static const Color primary = Color(0xFF0F766E); // teal — store/finance-appropriate, not tied to any supplier brand
  static const Color danger = Color(0xFFDC2626);

  static const String _fontFamily = 'Cairo';
  static const List<String> _fontFallback = ['Roboto']; // covers Latin letters/digits Cairo's arabic subset omits

  static ThemeData get light {
    final colorScheme = ColorScheme.fromSeed(seedColor: primary, brightness: Brightness.light);
    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      fontFamily: _fontFamily,
      textTheme: Typography.material2021(platform: TargetPlatform.android)
          .black
          .apply(fontFamily: _fontFamily, fontFamilyFallback: _fontFallback),
      scaffoldBackgroundColor: const Color(0xFFF8FAFA),
      appBarTheme: AppBarTheme(
        backgroundColor: colorScheme.surface,
        foregroundColor: colorScheme.onSurface,
        elevation: 0,
        centerTitle: true,
      ),
      cardTheme: const CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16))),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            fontFamily: _fontFamily,
            fontFamilyFallback: _fontFallback,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
    );
  }
}
