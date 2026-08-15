import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { ConfirmModal } from "../components/ConfirmModal";

interface TopupRow {
  id: string;
  user_id: string;
  sender_phone: string;
  requested_amount: string;
  status: string;
  expires_at: string;
  created_at: string;
}

const STATUSES = ["", "pending", "matched", "credited", "expired", "cancelled", "manual_review"];
const STATUS_LABELS: Record<string, string> = {
  "": "الكل",
  pending: "قيد الانتظار",
  matched: "مطابق",
  credited: "تم الإيداع",
  expired: "منتهي",
  cancelled: "ملغى",
  manual_review: "مراجعة يدوية",
};

const PAGE_SIZE = 20;

export function TopupsPage() {
  const [items, setItems] = useState<TopupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ type: "reject" | "credit"; row: TopupRow } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (status) qs.set("status", status);
    api
      .get<{ items: TopupRow[]; total: number }>(`/admin/topup-requests?${qs}`)
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
  }, [page, status, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const REJECTABLE = ["pending", "manual_review"];
  const CREDITABLE = ["pending", "matched", "expired", "manual_review"];

  return (
    <div>
      <h1 className="page-title">طلبات الشحن (Libyana)</h1>
      <div className="toolbar">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
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
        {!loading && !error && items.length === 0 && <div className="empty-state">لا توجد طلبات</div>}
        {!loading && items.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>المستخدم</th>
                <th>رقم الهاتف</th>
                <th>المبلغ المطلوب</th>
                <th>الحالة</th>
                <th>ينتهي في</th>
                <th>تاريخ الطلب</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/users/${t.user_id}`}>{t.user_id.slice(0, 8)}…</Link>
                  </td>
                  <td>{t.sender_phone}</td>
                  <td>{Number(t.requested_amount).toFixed(3)} LYD</td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td>{new Date(t.expires_at).toLocaleString("ar-LY")}</td>
                  <td>{new Date(t.created_at).toLocaleString("ar-LY")}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {REJECTABLE.includes(t.status) && (
                        <button className="btn btn-danger btn-sm" onClick={() => setModal({ type: "reject", row: t })}>
                          رفض
                        </button>
                      )}
                      {CREDITABLE.includes(t.status) && (
                        <button className="btn btn-sm" onClick={() => setModal({ type: "credit", row: t })}>
                          إيداع يدوي
                        </button>
                      )}
                    </div>
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

      {modal?.type === "reject" && (
        <ConfirmModal
          title="رفض طلب الشحن"
          confirmLabel="تأكيد الرفض"
          danger
          requireNote
          onClose={() => setModal(null)}
          onConfirm={async (note) => {
            await api.post(`/admin/topup-requests/${modal.row.id}/reject`, { note });
            setRefreshKey((k) => k + 1);
          }}
        >
          <p>
            هترفض طلب شحن بمبلغ <b>{Number(modal.row.requested_amount).toFixed(3)} LYD</b> من الرقم{" "}
            <b>{modal.row.sender_phone}</b>.
          </p>
        </ConfirmModal>
      )}

      {modal?.type === "credit" && (
        <CreditModal row={modal.row} onClose={() => setModal(null)} onDone={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  );
}

function CreditModal({ row, onClose, onDone }: { row: TopupRow; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(row.requested_amount);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!note.trim()) {
      setError("لازم تكتب ملاحظة");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/topup-requests/${row.id}/credit-manually`, { amount: Number(amount), note: note.trim() });
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
        <h3>إيداع يدوي</h3>
        <p className="hint-text">
          هيتم إيداع المبلغ في محفظة المستخدم مباشرة وتحديد الطلب كمكتمل.
        </p>
        <div className="field">
          <label>المبلغ (LYD)</label>
          <input type="number" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>ملاحظة</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? "..." : "تأكيد الإيداع"}
          </button>
        </div>
      </div>
    </div>
  );
}
