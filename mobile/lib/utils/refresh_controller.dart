import 'package:flutter/foundation.dart';

/// home_shell.dart keeps every bottom-nav tab alive in an [IndexedStack] rather than
/// rebuilding it on selection — necessary so e.g. المتجر's scroll position and في-progress
/// search survive switching tabs and back. The cost is that a screen's own `initState`-only
/// fetch runs exactly once and never again: buy something from المتجر, then switch to
/// طلباتي or المحفظة, and both are still showing whatever they loaded before the purchase —
/// the order looks like it never happened and the balance looks like it was never charged,
/// even though the backend processed both correctly. A [RefreshController] lets home_shell
/// tell an already-built tab "your data may be stale now" without rebuilding it — home_shell
/// owns the instance and calls [refresh] when that tab is reselected; the tab attaches its
/// own reload function to it in `initState` and detaches in `dispose`.
class RefreshController {
  VoidCallback? _onRefresh;

  void attach(VoidCallback onRefresh) => _onRefresh = onRefresh;

  /// Only clears the callback if it's still the same one that attached — guards against a
  /// stale detach if a screen were ever rebuilt with a fresh State before disposing the old.
  void detach(VoidCallback onRefresh) {
    if (_onRefresh == onRefresh) _onRefresh = null;
  }

  void refresh() => _onRefresh?.call();
}
