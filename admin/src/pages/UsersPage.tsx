import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { formatMoney } from "../utils/format";

interface UserListItem {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  is_admin: boolean;
  status: string;
  created_at: string;
  balance: string | null;
}

const PAGE_SIZE = 20;

export function UsersPage() {
  const [items, setItems] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const setPage = (updater: (p: number) => number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(updater(page)));
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: UserListItem[]; total: number }>(`/admin/users?page=${page}&page_size=${PAGE_SIZE}`)
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
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="page-title">المستخدمون</h1>
      <div className="card">
        {loading && <div className="loading-text">جارٍ التحميل…</div>}
        {error && (
          <div className="error-text" aria-live="polite">
            {error}
          </div>
        )}
        {!loading && !error && items.length === 0 && <div className="empty-state">لا يوجد مستخدمون</div>}
        {!loading && items.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>البريد الإلكتروني</th>
                <th>الهاتف</th>
                <th>الاسم</th>
                <th>الرصيد</th>
                <th>الحالة</th>
                <th>أدمن</th>
                <th>تاريخ التسجيل</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to={`/users/${u.id}`}>{u.email ?? "—"}</Link>
                  </td>
                  <td style={{ direction: "ltr", textAlign: "start" }}>{u.phone ?? "—"}</td>
                  <td>{u.full_name ?? "—"}</td>
                  <td>{u.balance ? `${formatMoney(u.balance)} LYD` : "—"}</td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td>{u.is_admin ? "نعم" : "—"}</td>
                  <td>{new Date(u.created_at).toLocaleDateString("ar-LY")}</td>
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
    </div>
  );
}
