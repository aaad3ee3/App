import 'package:flutter/material.dart';
import '../utils/home_sections.dart';
import 'tap_scale.dart';

/// Introduces one Home Dashboard section — deliberately a gradient + icon identity, not a
/// stock photo: the catalog has no real per-section banner art, and a fabricated image
/// would be exactly the kind of made-up data the store must not show. The whole banner is
/// tappable, mirroring the trailing "عرض الكل" chip, so a tap anywhere on it opens the
/// section's full category list.
class SectionBanner extends StatelessWidget {
  const SectionBanner({super.key, required this.section, required this.onViewAll});

  final HomeSection section;
  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context) {
    return TapScale(
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onViewAll,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
                colors: section.gradient,
              ),
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(color: section.gradient.last.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 6)),
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), shape: BoxShape.circle),
                  child: Icon(section.icon, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        section.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        section.subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11.5, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(12)),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('عرض الكل', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 11.5)),
                      SizedBox(width: 2),
                      Icon(Icons.chevron_left_rounded, color: Colors.white, size: 16),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
