import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'tap_scale.dart';

class NavItem {
  const NavItem({required this.icon, required this.selectedIcon, required this.label});
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

/// The bottom nav's active state: a single gold pill that *slides* between tabs
/// (an [AnimatedPositioned] in a shared [Stack]) rather than each tab independently
/// popping its own highlight in and out — the fluid, continuous motion of a reference
/// nav bar the user pointed to, where the indicator visibly travels from the old tab to
/// the new one instead of jumping.
class FloatingNavBar extends StatelessWidget {
  const FloatingNavBar({super.key, required this.items, required this.selectedIndex, required this.onSelect});

  final List<NavItem> items;
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final isRtl = Directionality.of(context) == TextDirection.rtl;

    return SizedBox(
      height: 68,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final itemWidth = constraints.maxWidth / items.length;
          // Row already lays its children out right-to-left under RTL, so tab 0 sits at
          // the physical right edge — the indicator's left offset has to account for that
          // or it slides to the mirror-opposite tab from the one actually selected.
          final indicatorLeft =
              isRtl ? constraints.maxWidth - (selectedIndex + 1) * itemWidth : selectedIndex * itemWidth;

          return Stack(
            children: [
              AnimatedPositioned(
                duration: const Duration(milliseconds: 280),
                curve: Curves.easeOutCubic,
                left: indicatorLeft,
                top: 10,
                width: itemWidth,
                height: 48,
                child: Center(
                  child: Container(
                    width: 44,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AppColors.gold,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(color: AppColors.gold.withValues(alpha: 0.45), blurRadius: 14, spreadRadius: 1),
                      ],
                    ),
                  ),
                ),
              ),
              Row(
                children: [
                  for (int i = 0; i < items.length; i++)
                    Expanded(
                      child: _NavItemButton(item: items[i], selected: i == selectedIndex, onTap: () => onSelect(i)),
                    ),
                ],
              ),
            ],
          );
        },
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
            SizedBox(
              width: 44,
              height: 32,
              child: Center(
                // Its own quick crossfade — decoupled from the slower sliding pill
                // underneath — so the icon's color/shape settles well before the pill
                // finishes traveling, instead of both racing on the same clock.
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 180),
                  child: Icon(
                    selected ? item.selectedIcon : item.icon,
                    key: ValueKey(selected),
                    size: 22,
                    color: selected ? AppColors.navyDark : inactiveColor,
                  ),
                ),
              ),
            ),
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
