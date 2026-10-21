import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import https from 'node:https';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.API_PROXY_TARGET || 'http://localhost:8080';
  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      port: 3002,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          // Prefer the working IPv4 route when the host also advertises an unreachable IPv6 address.
          agent: target.startsWith('https:') ? new https.Agent({ family: 4, keepAlive: true }) : undefined,
          proxyTimeout: 12_000,
          timeout: 15_000,
        },
      },
    },
  };
});
