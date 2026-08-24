import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { formatMoney } from "../utils/format";

interface CategoryRow {
  id: string;
  kind: "giftcard" | "smm";
  supplier: string;
  name: string;
  image: string | null;
  sort_order: number;
  enabled: boolean;
}

interface ProductRow {
  id: string;
  category_id: string;
  kind: "giftcard" | "smm";
  supplier: string;
  name: string;
  image: string | null;
  cost_price: string;
  sell_price: string;
  currency: string;
  price_per_1000: boolean;
  min_quantity: number | null;
  max_quantity: number | null;
  available: boolean;
}

interface SyncResult {
  libya_play: { categories: number; products: number };
  plus: { categories: number; products: number };
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "products" ? "products" : "categories";
  const categoryFilter = searchParams.get("category_id") ?? "";
  const setTab = (value: "categories" | "products") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", value);
      return next;
    });
  };
  const setCategoryFilter = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("category_id", value);
      else next.delete("category_id");
      return next;
    });
  };
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<{ items: CategoryRow[] }>("/admin/catalog/categories"),
      api.get<{ items: ProductRow[] }>(
        `/admin/catalog/products${categoryFilter ? `?category_id=${categoryFilter}` : ""}`
      ),
    ])
      .then(([cats, prods]) => {
        if (cancelled) return;
        setCategories(cats.items);
        setProducts(prods.items);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [categoryFilter, refreshKey]);

  const runSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const result = await api.post<SyncResult>("/admin/catalog/sync");
      setSyncResult(result);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setSyncError(err instanceof ApiError ? err.message : "تعذرت مزامنة الكتالوج");
    } finally {
      setSyncing(false);
    }
  };

  const toggleCategory = async (cat: CategoryRow) => {
    await api.post(`/admin/catalog/categories/${cat.id}/enabled`, { enabled: !cat.enabled });
    setRefreshKey((k) => k + 1);
  };

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          الكتالوج
        </h1>
        <button className="btn btn-accent" onClick={runSync} disabled={syncing}>
          {syncing ? "جارٍ المزامنة…" : "مزامنة من الموردين"}
        </button>
      </div>

      {syncError && (
        <div className="error-text" aria-live="polite">
          {syncError}
        </div>
      )}
      {syncResult && (
        <div className="card" style={{ background: "#eef6f4" }}>
          تمت المزامنة — Libya Play: {syncResult.libya_play.categories} تصنيف / {syncResult.libya_play.products} منتج
          &nbsp;|&nbsp; Plus: {syncResult.plus.categories} تصنيف / {syncResult.plus.products} منتج
        </div>
      )}

      <div className="tabs">
        <button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")}>
          التصنيفات ({categories.length})
        </button>
        <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>
          المنتجات ({products.length})
        </button>
      </div>

      {loading && <div className="loading-text">جارٍ التحميل…</div>}
      {error && (
        <div className="error-text" aria-live="polite">
          {error}
        </div>
      )}

      {!loading && tab === "categories" && (
        <div className="card">
          {categories.length === 0 ? (
            <div className="empty-state">لا توجد تصنيفات — اضغط «مزامنة من الموردين» أولاً</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>الصورة</th>
                  <th>الاسم</th>
                  <th>النوع</th>
                  <th>المورد</th>
                  <th>مفعّل</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <CategoryRowView
                    key={c.id}
                    category={c}
                    onToggle={() => toggleCategory(c)}
                    onShowProducts={() => {
                      setCategoryFilter(c.id);
                      setTab("products");
                    }}
                    onChanged={() => setRefreshKey((k) => k + 1)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === "products" && (
        <div>
          <div className="toolbar">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">كل التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="card">
            {products.length === 0 ? (
              <div className="empty-state">لا توجد منتجات</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>التكلفة</th>
                    <th>سعر البيع</th>
                    <th>متاح</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <ProductRowView key={p.id} product={p} onChanged={() => setRefreshKey((k) => k + 1)} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRowView({
  category,
  onToggle,
  onShowProducts,
  onChanged,
}: {
  category: CategoryRow;
  onToggle: () => void;
  onShowProducts: () => void;
  onChanged: () => void;
}) {
  const [editingImage, setEditingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState(category.image ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveImage = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/catalog/categories/${category.id}/image`, { image: imageUrl.trim() });
      setEditingImage(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td>
        {category.image ? (
          <img
            src={category.image}
            alt=""
            width={32}
            height={32}
            style={{ borderRadius: 6, objectFit: "cover" }}
            onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
          />
        ) : (
          "—"
        )}
      </td>
      <td>{category.name}</td>
      <td>{category.kind === "giftcard" ? "بطاقة" : "متابعين/خدمة"}</td>
      <td>{category.supplier}</td>
      <td>{category.enabled ? "نعم" : "لا"}</td>
      <td>
        {editingImage ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
            <input
              type="text"
              placeholder="رابط الصورة"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              style={{ width: "100%" }}
            />
            <div>
              <button className="btn btn-sm" onClick={saveImage} disabled={busy}>
                حفظ
              </button>
              <button
                className="btn btn-outline btn-sm"
                style={{ marginInlineStart: 6 }}
                onClick={() => {
                  setEditingImage(false);
                  setImageUrl(category.image ?? "");
                  setError(null);
                }}
              >
                إلغاء
              </button>
            </div>
            {error && (
              <div className="error-text" aria-live="polite">
                {error}
              </div>
            )}
          </div>
        ) : (
          <>
            <button className={`btn btn-sm ${category.enabled ? "btn-outline" : ""}`} onClick={onToggle}>
              {category.enabled ? "تعطيل" : "تفعيل"}
            </button>
            <button className="btn btn-outline btn-sm" style={{ marginInlineStart: 6 }} onClick={onShowProducts}>
              عرض المنتجات
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ marginInlineStart: 6 }}
              onClick={() => setEditingImage(true)}
            >
              {category.image ? "تعديل الصورة" : "إضافة صورة"}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function ProductRowView({ product, onChanged }: { product: ProductRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(product.sell_price);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savePrice = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/catalog/products/${product.id}`, { sell_price: Number(price) });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  };

  const toggleAvailable = async () => {
    await api.post(`/admin/catalog/products/${product.id}`, { available: !product.available });
    onChanged();
  };

  return (
    <tr>
      <td>{product.name}</td>
      <td>
        {formatMoney(product.cost_price)} {product.currency}
      </td>
      <td>
        {editing ? (
          <input
            type="number"
            step="0.001"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={{ width: 90 }}
          />
        ) : (
          `${formatMoney(product.sell_price)} ${product.currency}`
        )}
        {error && (
          <div className="error-text" aria-live="polite">
            {error}
          </div>
        )}
      </td>
      <td>{product.available ? "نعم" : "لا"}</td>
      <td>
        {editing ? (
          <>
            <button className="btn btn-sm" onClick={savePrice} disabled={busy}>
              حفظ
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ marginInlineStart: 6 }}
              onClick={() => {
                setEditing(false);
                setPrice(product.sell_price);
              }}
            >
              إلغاء
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
              تعديل السعر
            </button>
            <button className="btn btn-outline btn-sm" style={{ marginInlineStart: 6 }} onClick={toggleAvailable}>
              {product.available ? "إخفاء" : "إظهار"}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
