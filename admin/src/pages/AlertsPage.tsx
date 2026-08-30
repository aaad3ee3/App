import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface AlertItem {
  id: string;
  type: "order_failure" | "security_finding";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  occurred_at: string;
  resolved: boolean;
  order_id?: string;
  finding_id?: string;
}

const SEVERITY_TONE: Record<AlertItem["severity"], string> = {
  info: "badge-info",
  warning: "badge-warning",
  critical: "badge-danger",
};

const SEVERITY_LABEL: Record<AlertItem["severity"], string> = {
  info: "معلومة",
  warning: "تنبيه",
  critical: "حرج",
};

export function AlertsPage() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: AlertItem[] }>("/admin/alerts")
      .then((res) => !cancelled && setItems(res.items))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "حدث خطأ"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const resolve = async (item: AlertItem) => {
    if (!item.finding_id) return;
    setResolvingId(item.id);
    try {
      await api.post(`/admin/alerts/findings/${item.finding_id}/resolve`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر إغلاق التنبيه");
    } finally {
      setResolvingId(null);
    }
  };

  const openCount = items.filter((i) => !i.resolved).length;

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          الإشعارات {openCount > 0 && <span className="badge badge-danger">{openCount}</span>}
        </h1>
      </div>
      <p className="hint-text" style={{ marginTop: -10, marginBottom: 16 }}>
        طلبات لم تُنفَّذ أو تحتاج مراجعة، بالإضافة إلى نتائج فحص سلامة دوري يعمل كل 24 ساعة على بيانات
        حساسة فعلاً (أرصدة سالبة، طلبات معلّقة طويلاً، تشفير كلمات المرور، حدود الجلسات) — وليس فحص
        ثغرات شامل من طرف ثالث.
      </p>

      {loading && <div className="loading-text">جارٍ التحميل…</div>}
      {error && (
        <div className="error-text" aria-live="polite">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="card">
          {items.length === 0 ? (
            <div className="empty-state">لا توجد إشعارات حالياً — كل شيء طبيعي</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>الخطورة</th>
                  <th>العنوان</th>
                  <th>التفاصيل</th>
                  <th>الوقت</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className={`badge ${SEVERITY_TONE[item.severity]}`}>{SEVERITY_LABEL[item.severity]}</span>
                    </td>
                    <td>{item.title}</td>
                    <td style={{ maxWidth: 360, whiteSpace: "normal" }}>{item.description}</td>
                    <td>{new Date(item.occurred_at).toLocaleString("ar-LY")}</td>
                    <td>{item.resolved ? "تم الحل" : "مفتوح"}</td>
                    <td>
                      {!item.resolved && item.type === "security_finding" && (
                        <button className="btn btn-sm" disabled={resolvingId === item.id} onClick={() => resolve(item)}>
                          {resolvingId === item.id ? "جارٍ الإغلاق…" : "إغلاق"}
                        </button>
                      )}
                      {!item.resolved && item.type === "order_failure" && (
                        <a className="btn btn-outline btn-sm" href={`/orders?status=ambiguous_error`}>
                          مراجعة الطلب
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
