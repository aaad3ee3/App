/// The number customers are told to transfer their top-up to.
///
/// It must be a Libyana number (092 or 094). An Al-Madar number (091 or 093) cannot
/// receive a Libyana balance transfer at all, so the whole top-up flow would silently
/// fail for every customer.
class StoreConfig {
  static const String libyanaTopupPhoneNumber = '0924373759';
}
