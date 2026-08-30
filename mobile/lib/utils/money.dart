/// Formats a Libyan dinar amount for display.
///
/// The API returns NUMERIC(14,4) values padded to four decimals ("9.2900"), which reads
/// like a rounding artifact rather than a price. The dinar divides into 1000 dirham, so
/// three decimals is the most that can carry meaning — SMM totals (a per-1000 rate times
/// a quantity) genuinely land there, while a gift card never does.
///
/// Trailing zeros are trimmed down to two decimals: "9.29", not "9.290".
String formatLyd(double amount) {
  final withDirham = amount.toStringAsFixed(3);
  return withDirham.endsWith('0') ? withDirham.substring(0, withDirham.length - 1) : withDirham;
}

/// Same, for the raw decimal strings the API sends. Falls back to the original text if it
/// is not a number, so a display bug can never swallow an amount.
String formatLydString(String amount) {
  final parsed = double.tryParse(amount);
  return parsed == null ? amount : formatLyd(parsed);
}
