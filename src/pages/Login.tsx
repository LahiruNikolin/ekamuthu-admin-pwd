import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "@/Toast";
import {
  clearToken,
  decodeAuth,
  setToken,
  refreshWebSession,
} from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Keep the return route stable while React Router switches to a lazy screen.
  const [destination] = useState(() => {
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") && !next.startsWith("/login") ? next : "/";
  });
  useEffect(() => {
    let alive = true;
    setRestoring(true);
    setRestoreError("");
    async function restore() {
      try {
        const existing = decodeAuth();
        const ok = existing.isAuthenticated || (await refreshWebSession());
        if (!alive) return;
        const auth = decodeAuth();
        if (ok && (auth.role === "court_admin" || auth.role === "sys_admin"))
          navigate(destination, { replace: true });
      } catch {
        if (alive)
          setRestoreError(
            "Could not reconnect to your session. Check your connection and retry.",
          );
      } finally {
        if (alive) setRestoring(false);
      }
    }
    void restore();
    return () => {
      alive = false;
    };
  }, [attempt, destination, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json", "X-Admin-Web": "1" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        toast.error("Login failed. Check your credentials.");
        return;
      }
      const body = (await res.json()) as { access_token?: string };
      if (!body.access_token) {
        toast.error("Login failed. Try again.");
        return;
      }
      setToken(body.access_token);
      const auth = decodeAuth();
      if (auth.role !== "court_admin" && auth.role !== "sys_admin") {
        clearToken();
        toast.error("This console is for admins only.");
        return;
      }
      navigate(destination, { replace: true });
    } catch {
      toast.error("Could not connect. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="operator-login">
      <section className="operator-login-card">
        <p className="operator-eyebrow">Ekamuthu Admin</p>
        <h1>{restoring ? "Welcome back" : "Sign in"}</h1>
        {restoring && <p role="status">Restoring your session…</p>}
        {restoreError && (
          <div role="alert">
            <p>{restoreError}</p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              Retry connection
            </button>
          </div>
        )}
        <p>View your venue calendar, bookings, players, and updates.</p>
        {!restoring && !restoreError && (
          <form onSubmit={handleSubmit}>
            <label>
              Email or phone
              <input
                type="text"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button
              type="button"
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? "Hide password" : "Show password"}
            </button>
            <button disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}
        <p>
          <Link to="/privacy">Privacy policy</Link> ·{" "}
          <Link to="/terms">Terms</Link>
        </p>
      </section>
    </main>
  );
}
