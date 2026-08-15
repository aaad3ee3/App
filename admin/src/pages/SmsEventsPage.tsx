import { useEffect, useState } from "react";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { ConfirmModal } from "../components/ConfirmModal";

interface SmsEventRow {
  id: string;
  raw_text: string;
  reported_sender: string | null;
  sender_trusted: boolean;
  parsed_ok: boolean;
  parsed_amount: string | null;
  parsed_sender_phone: string | null;
  match_status: string;
  received_at: string;
}

interface TopupOption {
  id: string;
  user_id: string;
  sender_phone: string;
  requested_amount: string;
  status: string;
  created_at: string;
}

const STATUSES = ["", "unmatched", "ambiguous", "matched", "manually_resolved", "ignored_no_match", "ignored_untrusted_sender"];
const STATUS_LABELS: Record<string, string> = {
  "": "الكل",
  unmatched: "غير مطابق",
  ambiguous: "غامض",
  matched: "مطابق",
  manually_resolved: "تم الحل يدوياً",
  ignored_no_match: "تم التجاهل",
  ignored_untrusted_sender: "مرسل غير موثوق",
};

const PAGE_SIZE = 20;

export function SmsEventsPage() {
  const [items, setItems] = useState<SmsEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [matchStatus, setMatchStatus] = useState("unmatched");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ type: "resolve" | "ignore"; row: SmsEventRow } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (matchStatus) qs.set("match_status", matchStatus);
    api
      .get<{ items: SmsEventRow[]; total: number }>(`/admin/sms-events?${qs}`)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, matchStatus, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const RESOLVABLE = ["unmatched", "ambiguous"];

  return (
    <div>
      <h1 className="page-title">رسائل الشحن (SMS)</h1>
      <p className="hint-text" style={{ marginTop: -14, marginBottom: 14 }}>
        رسائل ما قدر النظام يطابقها تلقائياً مع طلب شحن — راجعها وثبّت المطابقة الصحيحة يدوياً.
      </p>
      <div className="toolbar">
        <select
          value={matchStatus}
          onChange={(e) => {
            setMatchStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="card">
        {loading && <div className="loading-text">جارٍ التحميل...</div>}
        {error && <div className="error-text">{error}</div>}
        {!loading && !error && items.length === 0 && <div className="empty-state">لا توجد رسائل</div>}
        {!loading && items.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>النص</th>
                <th>المرسل</th>
                <th>المبلغ المستخرج</th>
                <th>الهاتف المستخرج</th>
                <th>الحالة</th>
                <th>الوقت</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ev) => (
                <tr key={ev.id}>
                  <td style={{ maxWidth: 240, whiteSpace: "normal" }}>{ev.raw_text}</td>
                  <td>
                    {ev.reported_sender ?? "—"}
                    {!ev.sender_trusted && <div className="hint-text">غير موثوق</div>}
                  </td>
                  <td>{ev.parsed_amount ? `${Number(ev.parsed_amount).toFixed(3)} LYD` : "—"}</td>
                  <td>{ev.parsed_sender_phone ?? "—"}</td>
                  <td>
                    <StatusBadge status={ev.match_status} />
                  </td>
                  <td>{new Date(ev.received_at).toLocaleString("ar-LY")}</td>
                  <td>
                    {RESOLVABLE.includes(ev.match_status) && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-sm" onClick={() => setModal({ type: "resolve", row: ev })}>
                          ربط بطلب
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setModal({ type: "ignore", row: ev })}
                        >
                          تجاهل
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              السابق
            </button>
            <span>
              صفحة {page} من {totalPages}
            </span>
            <button
              className="btn btn-outline btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              التالي
            </button>
          </div>
        )}
      </div>

      {modal?.type === "ignore" && (
        <ConfirmModal
          title="تجاهل الرسالة"
          confirmLabel="تأكيد التجاهل"
          requireNote
          onClose={() => setModal(null)}
          onConfirm={async (note) => {
            await api.post(`/admin/sms-events/${modal.row.id}/ignore`, { note });
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {modal?.type === "resolve" && (
        <ResolveModal event={modal.row} onClose={() => setModal(null)} onDone={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  );
}

function ResolveModal({
  event,
  onClose,
  onDone,
}: {
  event: SmsEventRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [options, setOptions] = useState<TopupOption[]>([]);
  const [selected, setSelected] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ items: TopupOption[] }>("/admin/topup-requests?status=pending&page_size=100"),
      api.get<{ items: TopupOption[] }>("/admin/topup-requests?status=manual_review&page_size=100"),
    ])
      .then(([pending, manual]) => setOptions([...pending.items, ...manual.items]))
      .catch((err) => setError(err instanceof Error ? err.message : "تعذر تحميل طلبات الشحن"))
      .finally(() => setLoadingOptions(false));
  }, []);

  const submit = async () => {
    if (!selected) {
      setError("اختر طلب الشحن المطابق");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/sms-events/${event.id}/resolve`, { topup_request_id: selected });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>ربط الرسالة بطلب شحن</h3>
        <p className="hint-text">
          الرسالة: {event.parsed_amount ? `${Number(event.parsed_amount).toFixed(3)} LYD` : "—"} من{" "}
          {event.parsed_sender_phone ?? "رقم غير معروف"}
        </p>
        {loadingOptions ? (
          <div className="loading-text">جارٍ تحميل الطلبات...</div>
        ) : options.length === 0 ? (
          <div className="hint-text">لا توجد طلبات شحن معلقة حالياً</div>
        ) : (
          <div className="field">
            <label>طلب الشحن</label>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ width: "100%" }}>
              <option value="">اختر...</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.sender_phone} — {Number(o.requested_amount).toFixed(3)} LYD —{" "}
                  {new Date(o.created_at).toLocaleString("ar-LY")}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button className="btn" onClick={submit} disabled={busy || loadingOptions}>
            {busy ? "..." : "تأكيد الربط"}
          </button>
        </div>
      </div>
    </div>
  );
}
