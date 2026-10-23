const production = "https://court-social-production.up.railway.app";
const staging = "https://api-staging-52eb.up.railway.app";

// This is deployment configuration, not Vite's built-in import.meta.env.PROD.
export function apiTarget(env, { local = false } = {}) {
  if (env.PROD === undefined) {
    return local ? env.API_PROXY_TARGET || "http://localhost:8080" : staging;
  }
  const flag = env.PROD.trim().toLowerCase();
  if (flag !== "true" && flag !== "false") {
    throw new Error(
      "Set PROD to true (production API) or false (staging API).",
    );
  }
  if (env.VITE_API_URL && env.VITE_API_URL !== "/api/v1") {
    throw new Error(
      "When PROD is set, remove VITE_API_URL or set it to /api/v1 so requests use the selected proxy.",
    );
  }
  return flag === "true" ? production : staging;
}
