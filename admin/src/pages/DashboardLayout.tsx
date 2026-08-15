import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NAV_ITEMS = [
  { to: "/users", label: "المستخدمون" },
  { to: "/topups", label: "طلبات الشحن" },
  { to: "/sms-events", label: "رسائل الشحن" },
  { to: "/catalog", label: "الكتالوج" },
  { to: "/orders", label: "الطلبات" },
];

export function DashboardLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-title">لوحة تحكم المتجر</div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>{user?.full_name ?? user?.email}</div>
          <button className="logout-btn" onClick={logout}>
            تسجيل الخروج
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
