import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

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

  bool get _isSvg {
    final uri = Uri.tryParse(url);
    if (uri == null) return false;
    return uri.path.toLowerCase().endsWith('.svg') || uri.host == 'cdn.simpleicons.org';
  }

  @override
  Widget build(BuildContext context) {
    if (_isSvg) {
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
