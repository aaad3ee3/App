import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { formatMoney } from "../utils/format";

interface CouponRow {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: string;
  min_order_amount: string;
  max_uses: number | null;
  used_count: number;
  max_uses_per_user: number;
  enabled: boolean;
  expires_at: string | null;
  created_at: string;
}

const emptyForm = {
  code: "",
  discount_type: "percent" as "percent" | "fixed",
  discount_value: "",
  min_order_amount: "0",
  max_uses: "",
  max_uses_per_user: "1",
  expires_at: "",
};

export function CouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: CouponRow[] }>("/admin/coupons")
      .then((res) => {
        if (cancelled) return;
        setCoupons(res.items);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "حدث خطأ"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const createCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await api.post("/admin/coupons", {
        code: form.code.trim(),
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        min_order_amount: Number(form.min_order_amount || 0),
        max_uses: form.max_uses.trim() ? Number(form.max_uses) : null,
        max_uses_per_user: Number(form.max_uses_per_user || 1),
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      });
      setForm(emptyForm);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "تعذر إنشاء الكوبون");
    } finally {
      setCreating(false);
    }
  };

  const toggleEnabled = async (coupon: CouponRow) => {
    await api.post(`/admin/coupons/${coupon.id}`, { enabled: !coupon.enabled });
    setRefreshKey((k) => k + 1);
  };

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          كوبونات الخصم
        </h1>
      </div>

      <form className="card" onSubmit={createCoupon} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div>
          <label style={{ display: "block", fontSize: 12 }}>الكود</label>
          <input
            type="text"
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            style={{ width: 130 }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12 }}>النوع</label>
          <select
            value={form.discount_type}
            onChange={(e) => setForm({ ...form, discount_type: e.target.value as "percent" | "fixed" })}
          >
            <option value="percent">نسبة %</option>
            <option value="fixed">مبلغ ثابت</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12 }}>
            القيمة {form.discount_type === "percent" ? "(1-100)" : "(د.ل)"}
          </label>
          <input
            type="number"
            required
            min={0}
            step="0.01"
            value={form.discount_value}
            onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
            style={{ width: 90 }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12 }}>أقل قيمة طلب</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.min_order_amount}
            onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })}
            style={{ width: 90 }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12 }}>الحد الأقصى للاستخدام</label>
          <input
            type="number"
            min={1}
            placeholder="بلا حد"
            value={form.max_uses}
            onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
            style={{ width: 100 }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12 }}>مرات لكل مستخدم</label>
          <input
            type="number"
            min={1}
            value={form.max_uses_per_user}
            onChange={(e) => setForm({ ...form, max_uses_per_user: e.target.value })}
            style={{ width: 80 }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12 }}>تاريخ الانتهاء</label>
          <input
            type="date"
            value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
          />
        </div>
        <button className="btn btn-accent" type="submit" disabled={creating}>
          {creating ? "جارٍ الإنشاء…" : "إنشاء كوبون"}
        </button>
        {createError && (
          <div className="error-text" aria-live="polite" style={{ width: "100%" }}>
            {createError}
          </div>
        )}
      </form>

      {loading && <div className="loading-text">جارٍ التحميل…</div>}
      {error && (
        <div className="error-text" aria-live="polite">
          {error}
        </div>
      )}

      {!loading && (
        <div className="card">
          {coupons.length === 0 ? (
            <div className="empty-state">لا توجد كوبونات بعد — أنشئ واحداً من الأعلى</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>الخصم</th>
                  <th>أقل قيمة طلب</th>
                  <th>الاستخدام</th>
                  <th>لكل مستخدم</th>
                  <th>ينتهي</th>
                  <th>مفعّل</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: "monospace", direction: "ltr", textAlign: "start" }}>{c.code}</td>
                    <td>{c.discount_type === "percent" ? `${formatMoney(c.discount_value)}%` : `${formatMoney(c.discount_value)} د.ل`}</td>
                    <td>{formatMoney(c.min_order_amount)} د.ل</td>
                    <td>
                      {c.used_count} / {c.max_uses ?? "∞"}
                    </td>
                    <td>{c.max_uses_per_user}</td>
                    <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString("ar-LY") : "—"}</td>
                    <td>{c.enabled ? "نعم" : "لا"}</td>
                    <td>
                      <button className={`btn btn-sm ${c.enabled ? "btn-outline" : ""}`} onClick={() => toggleEnabled(c)}>
                        {c.enabled ? "تعطيل" : "تفعيل"}
                      </button>
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
