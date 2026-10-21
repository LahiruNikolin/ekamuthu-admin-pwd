import { jwtDecode } from "jwt-decode";

export type Role = "sys_admin" | "court_admin" | "player";

interface JWTPayload {
  uid: string;
  role: Role;
  court_admin_of?: string[];
  exp: number;
}

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  role: Role | null;
  courtAdminOf: string[];
}

const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

export function readToken(): string | null {
  return sessionStorage.getItem("access_token");
}

export function setToken(token: string) {
  sessionStorage.setItem("access_token", token);
}

export function clearToken() {
  sessionStorage.removeItem("access_token");
}

export function decodeAuth(): AuthState {
  const token = readToken();
  if (!token)
    return {
      isAuthenticated: false,
      userId: null,
      role: null,
      courtAdminOf: [],
    };
  try {
    const payload = jwtDecode<JWTPayload>(token);
    if (payload.exp * 1000 < Date.now()) {
      clearToken();
      return {
        isAuthenticated: false,
        userId: null,
        role: null,
        courtAdminOf: [],
      };
    }
    return {
      isAuthenticated: true,
      userId: payload.uid,
      role: payload.role,
      courtAdminOf: payload.court_admin_of ?? [],
    };
  } catch {
    clearToken();
    return {
      isAuthenticated: false,
      userId: null,
      role: null,
      courtAdminOf: [],
    };
  }
}

let refreshing: Promise<boolean> | null = null;
export function refreshWebSession(): Promise<boolean> {
  if (!refreshing)
    refreshing = refreshWithSessionLock().finally(() => {
      refreshing = null;
    });
  return refreshing;
}
async function refreshWithSessionLock(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.locks)
    return await navigator.locks.request("ekamuthu-admin-session", performRefresh);
  return performRefresh();
}
async function performRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", "X-Admin-Web": "1" },
    });
    if (!res.ok) {
      if (res.status !== 400 && res.status !== 401) throw new Error("Session service unavailable");
      clearToken();
      return false;
    }
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) {
      clearToken();
      return false;
    }
    setToken(body.access_token);
    return true;
  } catch {
    throw new Error("Could not restore your session. Reconnect and try again.");
  }
}

export async function logout() {
  // Keep the UI/session intact if cookie revocation fails, so the user can retry.
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "X-Admin-Web": "1" },
  });
  if (!response.ok) throw new Error("Sign out failed. Please try again.");
  clearToken();
}
