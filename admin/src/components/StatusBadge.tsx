const STATUS_MAP: Record<string, { label: string; tone: string }> = {
  // orders
  pending: { label: "قيد الانتظار", tone: "badge-muted" },
  processing: { label: "قيد التنفيذ", tone: "badge-info" },
  completed: { label: "مكتمل", tone: "badge-success" },
  failed: { label: "فشل واسترجع", tone: "badge-danger" },
  ambiguous_error: { label: "يحتاج مراجعة", tone: "badge-warning" },
  refunded: { label: "تم الاسترجاع", tone: "badge-muted" },
  // topups
  matched: { label: "مطابق", tone: "badge-info" },
  credited: { label: "تم الإيداع", tone: "badge-success" },
  expired: { label: "منتهي", tone: "badge-muted" },
  cancelled: { label: "ملغى", tone: "badge-danger" },
  manual_review: { label: "مراجعة يدوية", tone: "badge-warning" },
  // sms
  unmatched: { label: "غير مطابق", tone: "badge-warning" },
  ambiguous: { label: "غامض", tone: "badge-warning" },
  ignored_untrusted_sender: { label: "مرسل غير موثوق", tone: "badge-muted" },
  ignored_no_match: { label: "تم التجاهل", tone: "badge-muted" },
  manually_resolved: { label: "تم الحل يدوياً", tone: "badge-success" },
  // users
  active: { label: "نشط", tone: "badge-success" },
  disabled: { label: "معطل", tone: "badge-danger" },
};

export function StatusBadge({ status }: { status: string }) {
  const info = STATUS_MAP[status] ?? { label: status, tone: "badge-muted" };
  return <span className={`badge ${info.tone}`}>{info.label}</span>;
}
