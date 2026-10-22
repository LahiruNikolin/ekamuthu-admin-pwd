import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import https from "node:https";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_PROXY_TARGET || "http://localhost:8080";
  return {
    plugins: [react()],
    build: {
      minify: "terser",
      manifest: true,
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,
          // Related lazy screens compress together without entering the login bundle.
          manualChunks(id) {
            if (
              /\/src\/operator\/(OperatorDashboard|OperatorVenue|OperatorPlayers)\.tsx$/.test(
                id,
              )
            )
              return "operator-views";
            if (
              /\/src\/operator\/(OperatorCalendar|WeekTimeline|OperationsBoard|Timeline|BookingDialog|VirtualList|calendarVisibility|useCalendarZoom)\.(tsx?|jsx?)$/.test(
                id,
              )
            )
              return "calendar";
            if (/\/src\/features\/(Booking|Games)\.tsx$/.test(id))
              return "bookings";
            if (
              /\/src\/features\/(Player|Notifications|Reports|Account|BrowserPush)\.tsx$/.test(
                id,
              )
            )
              return "admin-tools";
            if (
              /\/src\/features\/(Areas|Templates|Closures|Photos|Promotions|Settings)\.tsx$/.test(
                id,
              )
            )
              return "venue-tools";
          },
        },
      },
      terserOptions: {
        compress: { passes: 2 },
        format: { comments: "some" },
      },
    },
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: {
      port: 3002,
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          // Prefer the working IPv4 route when the host also advertises an unreachable IPv6 address.
          agent: target.startsWith("https:")
            ? new https.Agent({ family: 4, keepAlive: true })
            : undefined,
          proxyTimeout: 12_000,
          timeout: 15_000,
        },
      },
    },
  };
});
