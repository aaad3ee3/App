import { useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { ConfirmModal } from "../components/ConfirmModal";
import { Modal } from "../components/Modal";
import { formatMoney } from "../utils/format";

interface TopupRow {
  id: string;
  user_id: string;
  sender_phone: string;
  requested_amount: string | null;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const status = searchParams.get("status") ?? "";
  const setPage = (updater: (p: number) => number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(updater(page)));
      return next;
    });
  };
  const setStatus = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("status", value);
      else next.delete("status");
      next.set("page", "1");
      return next;
    });
  };
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
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="card">
        {loading && <div className="loading-text">جارٍ التحميل…</div>}
        {error && (
          <div className="error-text" aria-live="polite">
            {error}
          </div>
        )}
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
                  <td>{t.requested_amount ? `${formatMoney(t.requested_amount)} LYD` : "أي مبلغ"}</td>
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
            هترفض طلب شحن{" "}
            {modal.row.requested_amount ? (
              <>
                بمبلغ <b>{formatMoney(modal.row.requested_amount)} LYD</b>{" "}
              </>
            ) : (
              "بأي مبلغ "
            )}
            من الرقم <b>{modal.row.sender_phone}</b>.
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
  const [amount, setAmount] = useState(row.requested_amount ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountId = useId();
  const noteId = useId();

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
    <Modal onClose={onClose}>
      <h3>إيداع يدوي</h3>
      <p className="hint-text">
        هيتم إيداع المبلغ في محفظة المستخدم مباشرة وتحديد الطلب كمكتمل.
      </p>
      <div className="field">
        <label htmlFor={amountId}>المبلغ (LYD)</label>
        <input
          id={amountId}
          type="number"
          step="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={noteId}>ملاحظة</label>
        <textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && (
        <div className="error-text" aria-live="polite">
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>
          إلغاء
        </button>
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? "جارٍ الإيداع…" : "تأكيد الإيداع"}
        </button>
      </div>
    </Modal>
  );
}
