import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Sayeh's design system.
///
/// Colours are taken from the app mark: a deep navy `S` over a gold ribbon on a warm
/// cream field. Navy carries structure and trust (this app holds people's money), gold
/// is reserved for value — prices, balances, the primary call to action — so it stays
/// meaningful instead of decorative, and cream keeps long Arabic product lists softer to
/// read than plain white.
class AppColors {
  // --- Brand ---------------------------------------------------------------------
  /// The `S` mark. Primary surface for headers, buttons and body text.
  static const Color navy = Color(0xFF2B3A55);
  static const Color navyDark = Color(0xFF1E2A3F);
  static const Color navyLight = Color(0xFF3D5075);

  /// The ribbon under the `S`. Accent only — never a large fill, so it keeps its weight.
  ///
  /// Pushed more saturated than the logo's own muted tan: a mark reads fine printed small
  /// and static, but the same low-chroma tone spread across buttons, balances and prices
  /// on a phone screen is exactly what read as "faded" — a real, verifiable complaint, not
  /// just taste. Kept in the same warm gold family, just with the chroma turned up.
  static const Color gold = Color(0xFFD9A53B);
  static const Color goldDark = Color(0xFFB8822A);
  static const Color goldLight = Color(0xFFF0C468);

  /// The mark's background field.
  static const Color cream = Color(0xFFF7E8CF);
  static const Color creamLight = Color(0xFFFDF6EC);

  // --- Neutrals ------------------------------------------------------------------
  static const Color surface = Color(0xFFFFFFFF);
  static const Color background = Color(0xFFFBF7F1);
  static const Color border = Color(0xFFE8DFD2);
  static const Color textPrimary = Color(0xFF1E2A3F);
  static const Color textSecondary = Color(0xFF6B7280);
  static const Color textMuted = Color(0xFF9CA3AF);

  // --- Status --------------------------------------------------------------------
  // Warm-shifted so they sit against cream rather than fighting it.
  static const Color success = Color(0xFF1F9254);
  static const Color successBg = Color(0xFFE6F4EC);
  static const Color warning = Color(0xFFC98A1E);
  static const Color warningBg = Color(0xFFFCF2E0);
  static const Color danger = Color(0xFFD64545);
  static const Color dangerBg = Color(0xFFFBEAEA);
  static const Color info = Color(0xFF4A6FA5);
  static const Color infoBg = Color(0xFFEAF0F9);

  // --- Dark mode -----------------------------------------------------------------
  static const Color darkBackground = Color(0xFF141C2B);
  static const Color darkSurface = Color(0xFF1E2A3F);
  static const Color darkBorder = Color(0xFF2F3D57);
  static const Color darkTextPrimary = Color(0xFFF3EFE8);
  static const Color darkTextSecondary = Color(0xFFA8B2C4);
}

class AppTheme {
  static const String fontFamily = 'Cairo';

  /// Cairo's Arabic subset has no Latin glyphs; without this fallback, prices and Latin
  /// product names render as tofu boxes.
  static const List<String> fontFallback = ['Roboto'];

  static const double radiusSm = 10;
  static const double radiusMd = 14;
  static const double radiusLg = 20;

  /// Kept subtle and warm — a neutral grey shadow reads as dirt against cream.
  static List<BoxShadow> get cardShadow => [
        BoxShadow(
          color: AppColors.navy.withValues(alpha: 0.06),
          blurRadius: 16,
          offset: const Offset(0, 4),
        ),
      ];

  static ThemeData get light {
    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.navy,
      onPrimary: Colors.white,
      primaryContainer: AppColors.cream,
      onPrimaryContainer: AppColors.navyDark,
      secondary: AppColors.gold,
      onSecondary: Colors.white,
      secondaryContainer: AppColors.creamLight,
      onSecondaryContainer: AppColors.goldDark,
      surface: AppColors.surface,
      onSurface: AppColors.textPrimary,
      surfaceContainerHighest: AppColors.creamLight,
      onSurfaceVariant: AppColors.textSecondary,
      outline: AppColors.border,
      error: AppColors.danger,
      onError: Colors.white,
    );

    return _base(colorScheme).copyWith(
      scaffoldBackgroundColor: AppColors.background,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.navy,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        titleTextStyle: TextStyle(
          fontFamily: fontFamily,
          fontFamilyFallback: fontFallback,
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.navy,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.cream,
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontFamily: fontFamily,
            fontFamilyFallback: fontFallback,
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? AppColors.navy : AppColors.textSecondary,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? AppColors.navy : AppColors.textSecondary,
            size: 24,
          ),
        ),
      ),
      inputDecorationTheme: _inputTheme(
        fill: AppColors.creamLight,
        border: AppColors.border,
        focused: AppColors.navy,
      ),
    );
  }

  static ThemeData get dark {
    const colorScheme = ColorScheme(
      brightness: Brightness.dark,
      primary: AppColors.goldLight,
      onPrimary: AppColors.navyDark,
      primaryContainer: AppColors.navyLight,
      onPrimaryContainer: AppColors.cream,
      secondary: AppColors.gold,
      onSecondary: AppColors.navyDark,
      secondaryContainer: AppColors.navyLight,
      onSecondaryContainer: AppColors.cream,
      surface: AppColors.darkSurface,
      onSurface: AppColors.darkTextPrimary,
      surfaceContainerHighest: Color(0xFF26344C),
      onSurfaceVariant: AppColors.darkTextSecondary,
      outline: AppColors.darkBorder,
      error: Color(0xFFEF7A7A),
      onError: AppColors.navyDark,
    );

    return _base(colorScheme).copyWith(
      scaffoldBackgroundColor: AppColors.darkBackground,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.darkBackground,
        foregroundColor: AppColors.cream,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        titleTextStyle: TextStyle(
          fontFamily: fontFamily,
          fontFamilyFallback: fontFallback,
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.cream,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.darkSurface,
        indicatorColor: AppColors.navyLight,
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontFamily: fontFamily,
            fontFamilyFallback: fontFallback,
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? AppColors.cream : AppColors.darkTextSecondary,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? AppColors.cream : AppColors.darkTextSecondary,
            size: 24,
          ),
        ),
      ),
      inputDecorationTheme: _inputTheme(
        fill: const Color(0xFF26344C),
        border: AppColors.darkBorder,
        focused: AppColors.goldLight,
      ),
    );
  }

  static ThemeData _base(ColorScheme colorScheme) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      fontFamily: fontFamily,
      textTheme: Typography.material2021(platform: TargetPlatform.android)
          .black
          .apply(
            fontFamily: fontFamily,
            fontFamilyFallback: fontFallback,
            bodyColor: colorScheme.onSurface,
            displayColor: colorScheme.onSurface,
          ),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        color: colorScheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          side: BorderSide(color: colorScheme.outline),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm)),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            fontFamily: fontFamily,
            fontFamilyFallback: fontFallback,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 15),
          side: BorderSide(color: colorScheme.outline),
          foregroundColor: colorScheme.onSurface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm)),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: fontFamily,
            fontFamilyFallback: fontFallback,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: colorScheme.primary,
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: fontFamily,
            fontFamilyFallback: fontFallback,
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm)),
        contentTextStyle: const TextStyle(
          fontFamily: fontFamily,
          fontFamilyFallback: fontFallback,
          fontSize: 14,
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: colorScheme.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusLg)),
      ),
      dividerTheme: DividerThemeData(color: colorScheme.outline, thickness: 1, space: 1),
    );
  }

  static InputDecorationTheme _inputTheme({
    required Color fill,
    required Color border,
    required Color focused,
  }) {
    return InputDecorationTheme(
      filled: true,
      fillColor: fill,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusSm),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusSm),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusSm),
        borderSide: BorderSide(color: focused, width: 1.6),
      ),
    );
  }
}
