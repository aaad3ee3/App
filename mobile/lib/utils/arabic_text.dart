/// Arabic search-text normalization, mirroring `normalizeSearchText` in
/// backend/src/lib/search.ts (and the `sayeh_search_normalize` SQL function behind it).
///
/// Used for filtering an already-loaded list on the device. Server search and on-device
/// filtering have to agree, or a customer would see a product in search results and then
/// fail to find it again by typing the same words on the category screen.
///
/// The diacritics are built from character codes rather than typed literally: they are
/// combining marks, so in an editor they attach to whatever precedes them, which makes
/// the source unreadable and easy to corrupt.
const String _alefVariants = 'أإآٱ';
final String _diacritics = String.fromCharCodes([
  0x064B, 0x064C, 0x064D, 0x064E, 0x064F, 0x0650, 0x0651, 0x0652, // tashkeel
  0x0640, // tatweel
]);

final RegExp _alefPattern = RegExp('[$_alefVariants]');
final RegExp _diacriticsPattern = RegExp('[$_diacritics]');

/// Folds the spellings Arabic speakers use interchangeably — "ألعاب"/"العاب",
/// "بطاقة"/"بطاقه" — onto one form, and lowercases Latin so "PUBG" matches "pubg".
String normalizeForSearch(String input) => input
    .toLowerCase()
    .replaceAll(_alefPattern, 'ا')
    .replaceAll('ى', 'ي')
    .replaceAll('ة', 'ه')
    .replaceAll(_diacriticsPattern, '');

/// True when every word of [query] appears somewhere in [haystack].
///
/// Words are ANDed rather than ORed so that typing more narrows the list — the opposite
/// would make a longer, more specific query return more results.
bool matchesSearch(String haystack, String query) {
  final terms = normalizeForSearch(query.trim()).split(RegExp(r'\s+')).where((t) => t.isNotEmpty);
  if (terms.isEmpty) return true;

  final normalized = normalizeForSearch(haystack);
  return terms.every(normalized.contains);
}
