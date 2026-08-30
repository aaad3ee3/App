import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// True when [url] is a brand-icon SVG (the Simple Icons CDN — see catalog/brand-icons.ts
/// and catalog/plus-categorization.ts on the backend) rather than a real supplier photo.
/// These need different framing (see [BrandIconBadge]): a flat, single-color glyph reads
/// as washed-out — and several brands' Simple Icons color is literal black — when
/// stretched full-bleed over a dark gradient tile the way a real product photo is.
bool isBrandIconUrl(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null) return false;
  return uri.path.toLowerCase().endsWith('.svg') || uri.host == 'cdn.simpleicons.org';
}

/// The real, confirmed brand color the backend already resolved for this icon — see
/// BRAND_HINTS in catalog/brand-icons.ts and PLATFORMS in catalog/plus-categorization.ts,
/// both of which only ever use a color looked up against the brand's own published palette,
/// never guessed. It's baked into the URL itself
/// (`cdn.simpleicons.org/<slug>/<hex>`), so this just parses it back out instead of the
/// backend having to send it as a separate field.
({String slug, Color color})? _parseBrandIconUrl(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.pathSegments.length < 2) return null;
  final hex = uri.pathSegments[1];
  if (!RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(hex)) return null;
  return (slug: uri.pathSegments[0], color: Color(int.parse('FF$hex', radix: 16)));
}

/// Libya Play's own gift-card/subscription tiles (PlayStation, Xbox, Razer Gold, iTunes,
/// OSN+, ...) are a bold color block in the platform's real brand color with its logo large
/// on top, filling the whole tile — not a small icon floating in a lot of empty space.
/// Simple Icons is the only source we have for these (Libya Play's own API only ships real
/// photos for a handful of categories — see catalog-sync.service.ts) and only gives a flat
/// vector glyph, but the backend already resolves a real brand color for every one of them;
/// this reconstructs that same bold-tile treatment from it — a full-bleed gradient in the
/// brand's own color with the logo re-requested in plain white or black (whichever contrasts)
/// and sized to actually read from a shelf, replacing the small "logo on a white circle"
/// badge this used to be, which is what looked cramped and washed-out next to a reference
/// app's much bigger, more colorful cards.
class BrandIconBadge extends StatelessWidget {
  const BrandIconBadge(this.url, {super.key});

  final String url;

  @override
  Widget build(BuildContext context) {
    final brand = _parseBrandIconUrl(url);
    if (brand == null) {
      // Unrecognized URL shape — fall back to the original safe, small-badge treatment
      // rather than guessing at a background color that isn't actually in the URL.
      return Center(
        child: Container(
          width: 64,
          height: 64,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 8, offset: const Offset(0, 3))],
          ),
          child: SvgPicture.network(
            url,
            fit: BoxFit.contain,
            placeholderBuilder: (_) => const SizedBox.shrink(),
            errorBuilder: (_, _, _) => const Icon(Icons.bolt_rounded, color: Colors.black26),
          ),
        ),
      );
    }

    final isDark = brand.color.computeLuminance() < 0.45;
    final iconUrl = 'https://cdn.simpleicons.org/${brand.slug}/${isDark ? 'ffffff' : '000000'}';

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [brand.color, Color.lerp(brand.color, Colors.black, 0.4)!],
        ),
      ),
      child: Center(
        child: FractionallySizedBox(
          widthFactor: 0.45,
          heightFactor: 0.45,
          child: SvgPicture.network(
            iconUrl,
            fit: BoxFit.contain,
            placeholderBuilder: (_) => const SizedBox.shrink(),
            errorBuilder: (_, _, _) =>
                Icon(Icons.bolt_rounded, color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.7)),
          ),
        ),
      ),
    );
  }
}

/// Renders a catalog image whether it's a raster photo (Libya Play's own product/category
/// art) or an SVG brand icon (cdn.simpleicons.org — see catalog/brand-icons.ts and
/// catalog/plus-categorization.ts on the backend). `Image.network` cannot decode SVG at
/// all: it just fails and falls through to [errorBuilder], which is why every category
/// that only ever gets a Simple Icons logo (most of "الرشق", most gift-card platforms with
/// no supplier art) was silently showing its fallback icon instead of the real brand logo.
class SmartNetworkImage extends StatelessWidget {
  const SmartNetworkImage(
    this.url, {
    super.key,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    required this.errorBuilder,
    this.loadingBuilder,
  });

  final String url;
  final BoxFit fit;
  final double? width;
  final double? height;
  final Widget Function(BuildContext, Object, StackTrace?) errorBuilder;
  final Widget Function(BuildContext, Widget, ImageChunkEvent?)? loadingBuilder;

  @override
  Widget build(BuildContext context) {
    if (isBrandIconUrl(url)) {
      return SvgPicture.network(
        url,
        fit: fit,
        width: width,
        height: height,
        placeholderBuilder: loadingBuilder == null
            ? null
            : (context) => loadingBuilder!(context, const SizedBox.shrink(), null),
        errorBuilder: (context, error, stackTrace) => errorBuilder(context, error, stackTrace),
      );
    }
    return Image.network(
      url,
      fit: fit,
      width: width,
      height: height,
      errorBuilder: errorBuilder,
      loadingBuilder: loadingBuilder,
    );
  }
}
