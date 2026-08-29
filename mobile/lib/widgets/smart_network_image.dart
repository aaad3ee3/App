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

/// A brand's SVG logo centered on a fixed near-white disc — guarantees contrast (several
/// brands' Simple Icons color is literally black, invisible against a dark card) and reads
/// as a proper app-icon badge instead of a flat glyph smeared across a gradient tile.
class BrandIconBadge extends StatelessWidget {
  const BrandIconBadge(this.url, {super.key, this.size = 64, this.padding = 14});

  final String url;
  final double size;
  final double padding;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: size,
        height: size,
        padding: EdgeInsets.all(padding),
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
