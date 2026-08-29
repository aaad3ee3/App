import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_theme.dart';
import 'tap_scale.dart';

class NavItem {
  const NavItem({required this.icon, required this.selectedIcon, required this.label});
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

/// The bottom nav's active state, redesigned from Material's default label-and-icon
/// color swap: the selected tab's icon sits inside a small glowing gold circle instead —
/// closer to what a Stitch-generated mockup for this app produced (and closer to the
/// "floating pill nav with a lit-up active icon" competitor reference the user pointed
/// at earlier), so this replaces NavigationBar entirely rather than reskinning it.
class FloatingNavBar extends StatelessWidget {
  const FloatingNavBar({super.key, required this.items, required this.selectedIndex, required this.onSelect});

  final List<NavItem> items;
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 68,
      child: Row(
        children: [
          for (int i = 0; i < items.length; i++)
            Expanded(child: _NavItemButton(item: items[i], selected: i == selectedIndex, onTap: () => onSelect(i))),
        ],
      ),
    );
  }
}

class _NavItemButton extends StatelessWidget {
  const _NavItemButton({required this.item, required this.selected, required this.onTap});

  final NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final inactiveColor = isDark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    return TapScale(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOut,
              width: 44,
              height: 32,
              decoration: BoxDecoration(
                color: selected ? AppColors.gold : Colors.transparent,
                borderRadius: BorderRadius.circular(16),
                boxShadow: selected
                    ? [BoxShadow(color: AppColors.gold.withValues(alpha: 0.45), blurRadius: 14, spreadRadius: 1)]
                    : null,
              ),
              child: Icon(
                selected ? item.selectedIcon : item.icon,
                size: 22,
                color: selected ? AppColors.navyDark : inactiveColor,
              ),
            ).animate(target: selected ? 1 : 0).scaleXY(begin: 1, end: 1.08, curve: Curves.easeOutBack, duration: 220.ms),
            const SizedBox(height: 4),
            Text(
              item.label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? (isDark ? AppColors.darkTextPrimary : AppColors.textPrimary) : inactiveColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
