import 'package:flutter/material.dart';

/// Plus's flat SMM service list has no per-type field of its own (see
/// plus-categorization.ts on the backend, which only splits services by *platform* —
/// TikTok, Instagram, ...). Everything below the platform level — "متابعين تيك توك
/// حقيقيين", "لايكات بث مباشر تيك توك" — is encoded only in the Arabic name. Once a
/// platform has more than a handful of services, sorting that flat list by price alone
/// reads as random: a followers package can land next to a comments package next to a
/// live-likes package with no visual grouping at all. This classifies a service name into
/// the section a customer actually thinks in, so the category screen can group by type
/// instead of dumping everything into one undifferentiated grid.
enum SmmServiceKind { followers, views, liveLikes, videoLikes, comments, favorites, other }

class SmmServiceType {
  const SmmServiceType({required this.kind, required this.label, required this.icon});
  final SmmServiceKind kind;
  final String label;
  final IconData icon;
}

/// Display order for grouped sections. "خدمات أخرى" is last on purpose — it is the
/// catch-all for anything the keyword lists below don't recognize, not a real category a
/// customer asked for.
const List<SmmServiceType> kSmmServiceTypes = [
  SmmServiceType(kind: SmmServiceKind.followers, label: 'متابعين', icon: Icons.person_add_alt_1_rounded),
  SmmServiceType(kind: SmmServiceKind.views, label: 'مشاهدات', icon: Icons.visibility_rounded),
  SmmServiceType(kind: SmmServiceKind.videoLikes, label: 'لايكات فيديو', icon: Icons.favorite_rounded),
  SmmServiceType(kind: SmmServiceKind.liveLikes, label: 'لايكات بث مباشر', icon: Icons.live_tv_rounded),
  SmmServiceType(kind: SmmServiceKind.comments, label: 'تعليقات', icon: Icons.mode_comment_rounded),
  SmmServiceType(kind: SmmServiceKind.favorites, label: 'مفضلة', icon: Icons.bookmark_rounded),
  SmmServiceType(kind: SmmServiceKind.other, label: 'خدمات أخرى', icon: Icons.trending_up_rounded),
];

final Map<SmmServiceKind, SmmServiceType> _smmServiceTypeByKind = {
  for (final type in kSmmServiceTypes) type.kind: type,
};

SmmServiceType smmServiceTypeOf(SmmServiceKind kind) => _smmServiceTypeByKind[kind]!;

const List<String> _commentKeywords = ['تعليق', 'comment'];
const List<String> _favoriteKeywords = ['مفضل', 'حفظ', 'save', 'bookmark'];
const List<String> _liveKeywords = ['بث مباشر', 'بث', 'لايف', 'live'];
const List<String> _likeKeywords = ['لايك', 'like'];
const List<String> _viewKeywords = ['مشاهد', 'view'];
const List<String> _followerKeywords = ['متابع', 'فولو', 'follow'];

/// Order matters: checked most-specific-first so e.g. "لايكات بث مباشر" (a like service
/// that also mentions live) lands in [SmmServiceKind.liveLikes] rather than the generic
/// [SmmServiceKind.videoLikes] bucket a bare "لايك" check would give it.
SmmServiceKind classifySmmServiceKind(String serviceName) {
  final normalized = serviceName.toLowerCase();
  bool has(List<String> keywords) => keywords.any((kw) => normalized.contains(kw.toLowerCase()));

  if (has(_commentKeywords)) return SmmServiceKind.comments;
  if (has(_favoriteKeywords)) return SmmServiceKind.favorites;
  final isLike = has(_likeKeywords);
  if (isLike && has(_liveKeywords)) return SmmServiceKind.liveLikes;
  if (isLike) return SmmServiceKind.videoLikes;
  if (has(_viewKeywords)) return SmmServiceKind.views;
  if (has(_followerKeywords)) return SmmServiceKind.followers;
  return SmmServiceKind.other;
}
