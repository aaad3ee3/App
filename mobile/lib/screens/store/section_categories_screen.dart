import 'package:flutter/material.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';
import '../../models/category.dart';
import '../../utils/home_sections.dart';
import '../../widgets/category_card.dart';

/// The "عرض الكل" destination for one Home Dashboard section — the full category list the
/// section's top-3 preview grid only shows a slice of.
class SectionCategoriesScreen extends StatelessWidget {
  const SectionCategoriesScreen({super.key, required this.section, required this.categories});

  final HomeSection section;
  final List<StoreCategory> categories;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(section.title)),
      body: AnimationLimiter(
        child: GridView.builder(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 0.62,
          ),
          itemCount: categories.length,
          itemBuilder: (context, index) => AnimationConfiguration.staggeredGrid(
            position: index,
            duration: const Duration(milliseconds: 380),
            columnCount: 3,
            child: SlideAnimation(
              verticalOffset: 30,
              curve: Curves.easeOutCubic,
              child: FadeInAnimation(
                child: CategoryCard(category: categories[index]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
