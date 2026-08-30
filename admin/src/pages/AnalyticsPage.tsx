import { useEffect, useState } from "react";
import { api } from "../api/client";
import { formatMoney } from "../utils/format";

interface PeriodTotals {
  today: number;
  month: number;
  year: number;
}

interface StoreTotals {
  revenue: PeriodTotals;
  profit: PeriodTotals;
  orders: PeriodTotals;
}

interface TopProduct {
  id: string;
  name: string;
  kind: string;
  order_count: number;
  revenue: number;
}

interface AnalyticsSummary {
  generated_at: string;
  pricing: { usd_to_lyd_rate: number; markup_percent: number };
  users: PeriodTotals;
  stores: { cards: StoreTotals; rasheq: StoreTotals; combined: StoreTotals };
  top_products: TopProduct[];
}

const PERIODS: { key: keyof PeriodTotals; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "month", label: "هذا الشهر" },
  { key: "year", label: "هذه السنة" },
];

const STORE_ROWS: { key: "cards" | "rasheq" | "combined"; label: string }[] = [
  { key: "cards", label: "كروت (بطاقات وشحن تطبيقات)" },
  { key: "rasheq", label: "الرشق" },
  { key: "combined", label: "الإجمالي" },
];

const KIND_LABELS: Record<string, string> = { giftcard: "بطاقة", smm: "رشق", social_topup: "شحن تطبيق" };

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AnalyticsSummary>("/admin/analytics/summary")
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "حدث خطأ"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          التحليلات
        </h1>
      </div>

      {loading && <div className="loading-text">جارٍ التحميل…</div>}
      {error && (
        <div className="error-text" aria-live="polite">
          {error}
        </div>
      )}

      {data && (
        <>
          <p className="hint-text" style={{ marginTop: -10, marginBottom: 16 }}>
            الأرباح محسوبة على أساس السعر الفعلي المسجّل مع كل طلب وقت الشراء (١ دولار ={" "}
            {data.pricing.usd_to_lyd_rate} د.ل، هامش ربح {(data.pricing.markup_percent * 100).toFixed(0)}٪ — القيم الحالية
            المضبوطة في الخادم الآن) — وليس على سعر اليوم، حتى لا تتغير أرباح طلب قديم كلما غيّرت الإعدادات.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
            {PERIODS.map((p) => (
              <div className="card" key={p.key} style={{ margin: 0, textAlign: "center" }}>
                <div className="hint-text">مستخدمون جدد — {p.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{data.users[p.key]}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            {PERIODS.map((p) => (
              <div className="card" key={p.key}>
                <h3 style={{ marginTop: 0 }}>{p.label}</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>المتجر</th>
                      <th>الإيراد</th>
                      <th>صافي الربح</th>
                      <th>الطلبات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STORE_ROWS.map((row) => {
                      const totals = data.stores[row.key];
                      const isTotal = row.key === "combined";
                      return (
                        <tr key={row.key} style={isTotal ? { fontWeight: 700 } : undefined}>
                          <td>{row.label}</td>
                          <td>{formatMoney(totals.revenue[p.key])} د.ل</td>
                          <td>{formatMoney(totals.profit[p.key])} د.ل</td>
                          <td>{totals.orders[p.key]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>الأكثر طلباً</h3>
            {data.top_products.length === 0 ? (
              <div className="empty-state">لا توجد طلبات كافية بعد</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>النوع</th>
                    <th>عدد الطلبات</th>
                    <th>الإيراد</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{KIND_LABELS[p.kind] ?? p.kind}</td>
                      <td>{p.order_count}</td>
                      <td>{formatMoney(p.revenue)} د.ل</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
