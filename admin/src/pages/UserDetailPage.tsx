import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";

interface UserDetail {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  status: string;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  balance: string | null;
  currency: string | null;
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .get<UserDetail>(`/admin/users/${id}`)
      .then((res) => !cancelled && setUser(res))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div>
      <Link to="/users">&rarr; رجوع للمستخدمين</Link>
      <h1 className="page-title" style={{ marginTop: 12 }}>
        تفاصيل المستخدم
      </h1>
      {loading && <div className="loading-text">جارٍ التحميل...</div>}
      {error && <div className="error-text">{error}</div>}
      {user && (
        <div className="card">
          <table className="data-table">
            <tbody>
              <tr>
                <th>البريد الإلكتروني</th>
                <td>{user.email}</td>
              </tr>
              <tr>
                <th>الاسم</th>
                <td>{user.full_name ?? "—"}</td>
              </tr>
              <tr>
                <th>الرصيد</th>
                <td>
                  {user.balance ? `${Number(user.balance).toFixed(3)} ${user.currency ?? "LYD"}` : "—"}
                </td>
              </tr>
              <tr>
                <th>الحالة</th>
                <td>
                  <StatusBadge status={user.status} />
                </td>
              </tr>
              <tr>
                <th>صلاحية أدمن</th>
                <td>{user.is_admin ? "نعم" : "لا"}</td>
              </tr>
              <tr>
                <th>محاولات الدخول الفاشلة</th>
                <td>{user.failed_login_attempts}</td>
              </tr>
              <tr>
                <th>مقفل حتى</th>
                <td>{user.locked_until ? new Date(user.locked_until).toLocaleString("ar-LY") : "—"}</td>
              </tr>
              <tr>
                <th>تاريخ التسجيل</th>
                <td>{new Date(user.created_at).toLocaleString("ar-LY")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
