import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "@/Toast";
import { clearToken, decodeAuth, setToken } from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const next = new URLSearchParams(window.location.search).get("next") || "/";

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
      navigate(
        next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
          ? next
          : "/",
        { replace: true },
      );
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
        <h1>Sign in</h1>
        <p>View your venue calendar, bookings, players, and updates.</p>
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
        <p>
          <Link to="/privacy">Privacy policy</Link> ·{" "}
          <Link to="/terms">Terms</Link>
        </p>
      </section>
    </main>
  );
}
