import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, clearToken, getToken, setToken } from "../api/client";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
}

interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<AdminUser>("/auth/me");
      if (!me.is_admin) {
        clearToken();
        setUser(null);
        setError("هذا الحساب ليس لديه صلاحيات أدمن");
      } else {
        setUser(me);
      }
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const result = await api.post<{ token: string }>("/admin/auth/login", { email, password });
      setToken(result.token);
      const me = await api.get<AdminUser>("/auth/me");
      if (!me.is_admin) {
        clearToken();
        setUser(null);
        setError("هذا الحساب ليس لديه صلاحيات أدمن");
        return;
      }
      setUser(me);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "تعذر تسجيل الدخول";
      setError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
