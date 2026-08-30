import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { SayehLogo } from "../components/SayehLogo";

export function LoginPage() {
  const { user, login, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (user) return <Navigate to="/users" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      await login(email, password);
    } catch {
      // error surfaced via auth context
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-box" onSubmit={handleSubmit}>
        <div className="login-brand">
          <SayehLogo size={56} />
          <span className="wordmark">sayeh</span>
        </div>
        <h1>لوحة التحكم</h1>
        <div className="field">
          <label>البريد الإلكتروني</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label>كلمة المرور</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {(error || localError) && (
          <div className="error-text" aria-live="polite">
            {error ?? localError}
          </div>
        )}
        <button className="btn" type="submit" disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "جارٍ الدخول…" : "تسجيل الدخول"}
        </button>
      </form>
    </div>
  );
}
