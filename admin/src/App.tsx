import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { DashboardLayout } from "./pages/DashboardLayout";
import { UsersPage } from "./pages/UsersPage";
import { UserDetailPage } from "./pages/UserDetailPage";
import { TopupsPage } from "./pages/TopupsPage";
import { SmsEventsPage } from "./pages/SmsEventsPage";
import { CatalogPage } from "./pages/CatalogPage";
import { OrdersPage } from "./pages/OrdersPage";

function ProtectedArea() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-text" style={{ padding: 40 }}>جارٍ التحميل…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <DashboardLayout />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedArea />}>
            <Route path="/" element={<Navigate to="/users" replace />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:id" element={<UserDetailPage />} />
            <Route path="/topups" element={<TopupsPage />} />
            <Route path="/sms-events" element={<SmsEventsPage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/orders" element={<OrdersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
