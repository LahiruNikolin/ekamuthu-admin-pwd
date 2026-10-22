// Vite serves HTTP locally, while the upstream API sees its HTTPS hostname.
// Adapt only development responses; production cookies keep Secure unchanged.
export function localDevCookie(cookie: string): string {
  return cookie
    .replace(/;\s*Secure(?=;|$)/gi, "")
    .replace(/;\s*SameSite=None(?=;|$)/gi, "; SameSite=Lax");
}
