import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { ConfirmModal } from "../components/ConfirmModal";

interface OrderRow {
  id: string;
  user_id: string;
  product_id: string;
  kind: "giftcard" | "smm";
  quantity: number;
  target_link: string | null;
  unit_price: string;
  total_price: string;
  status: string;
  supplier_order_ref: string | null;
  error_message: string | null;
  created_at: string;
}

const STATUSES = ["ambiguous_error", "pending", "processing", "completed", "failed", "refunded"];
const STATUS_LABELS: Record<string, string> = {
  ambiguous_error: "يحتاج مراجعة",
  pending: "قيد الانتظار",
  processing: "قيد التنفيذ",
  completed: "مكتمل",
  failed: "فشل",
  refunded: "تم الاسترجاع",
};

const PAGE_SIZE = 20;

export function OrdersPage() {
  const [items, setItems] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("ambiguous_error");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ type: "complete" | "refund"; row: OrderRow } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: OrderRow[]; total: number }>(
        `/admin/orders?status=${status}&page=${page}&page_size=${PAGE_SIZE}`
      )
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
  }, [status, page, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="page-title">الطلبات</h1>
      <p className="hint-text" style={{ marginTop: -14, marginBottom: 14 }}>
        طلبات "يحتاج مراجعة" هي طلبات صار فيها خطأ غامض مع المورد (شبكة/تايم آوت) — المبلغ مخصوم من
        المستخدم لكن ما اتأكدناش من نجاح أو فشل التنفيذ الفعلي. راجعها يدوياً مع لوحة المورد قبل ما تقرر.
      </p>
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
                <th>النوع</th>
                <th>الكمية</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
                <th>خطأ المورد</th>
                <th>التاريخ</th>
                {status === "ambiguous_error" && <th>إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/users/${o.user_id}`}>{o.user_id.slice(0, 8)}…</Link>
                  </td>
                  <td>{o.kind === "giftcard" ? "بطاقة" : "خدمة سوشيال"}</td>
                  <td>{o.quantity}</td>
                  <td>{Number(o.total_price).toFixed(3)} LYD</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td style={{ maxWidth: 200, whiteSpace: "normal" }}>{o.error_message ?? "—"}</td>
                  <td>{new Date(o.created_at).toLocaleString("ar-LY")}</td>
                  {status === "ambiguous_error" && (
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-sm" onClick={() => setModal({ type: "complete", row: o })}>
                          إكمال (نُفّذ)
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setModal({ type: "refund", row: o })}
                        >
                          استرجاع المبلغ
                        </button>
                      </div>
                    </td>
                  )}
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

      {modal?.type === "complete" && (
        <ConfirmModal
          title="تأكيد إكمال الطلب"
          confirmLabel="تأكيد الإكمال"
          requireNote
          onClose={() => setModal(null)}
          onConfirm={async (note) => {
            await api.post(`/admin/orders/${modal.row.id}/mark-completed`, { note });
            setRefreshKey((k) => k + 1);
          }}
        >
          <p>
            استخدم هذا لو تأكدت (من لوحة المورد مثلاً) إن الطلب اتنفذ فعلاً. لن يتم استرجاع أي مبلغ.
          </p>
        </ConfirmModal>
      )}

      {modal?.type === "refund" && (
        <ConfirmModal
          title="استرجاع المبلغ"
          confirmLabel="تأكيد الاسترجاع"
          danger
          requireNote
          onClose={() => setModal(null)}
          onConfirm={async (note) => {
            await api.post(`/admin/orders/${modal.row.id}/refund`, { note });
            setRefreshKey((k) => k + 1);
          }}
        >
          <p>
            هيتم إرجاع <b>{Number(modal.row.total_price).toFixed(3)} LYD</b> لمحفظة المستخدم. استخدم هذا لو
            تأكدت إن الطلب ما اتنفذش.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
