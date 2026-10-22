import {
  clearToken,
  readToken,
  refreshWebSession,
  tokenNeedsRefresh,
} from "@/lib/auth";

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "APIError";
  }
}

export async function adminFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  function sessionExpired(): never {
    clearToken();
    if (!window.location.pathname.startsWith("/login"))
      window.location.href =
        "/login?next=" +
        encodeURIComponent(window.location.pathname + window.location.search);
    throw new APIError(401, "Please sign in again to continue.");
  }
  let token = readToken();
  if (retry && tokenNeedsRefresh(token)) {
    if (!(await refreshWebSession(token))) sessionExpired();
    token = readToken();
  }
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Admin-Web": "1",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(
    () =>
      controller.abort(new DOMException("Request timed out", "TimeoutError")),
    15_000,
  );
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers,
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) {
      if (retry) {
        if (!(await refreshWebSession(token))) sessionExpired();
        return adminFetch<T>(path, options, false);
      }
      // Only a rejected refresh cookie proves the persistent session has ended.
      throw new APIError(401, "Could not verify access. Please retry.");
    }
    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({ error: res.statusText }))) as { error?: string };
      throw new APIError(res.status, body.error ?? "Unknown error");
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export const adminApi = {
  get: <T>(path: string, signal?: AbortSignal) =>
    adminFetch<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) =>
    adminFetch<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    adminFetch<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body: unknown) =>
    adminFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    adminFetch<T>(path, {
      method: "DELETE",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};
