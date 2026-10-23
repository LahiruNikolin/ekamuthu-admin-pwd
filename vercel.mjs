import { apiTarget } from "./config/api-target.mjs";

export const config = {
  framework: "vite",
  installCommand: "npm ci",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  rewrites: [
    {
      source: "/api/:path*",
      destination: `${apiTarget(process.env)}/api/:path*`,
    },
    {
      source:
        "/((?!api/|assets/|icons/|sw\\.js$|manifest\\.webmanifest$|offline\\.html$).*)",
      destination: "/index.html",
    },
  ],
  headers: [
    {
      source: "/api/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "no-store",
        },
        {
          key: "Vercel-CDN-Cache-Control",
          value: "no-store",
        },
      ],
    },
    {
      source: "/sw.js",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache",
        },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache",
        },
      ],
    },
    {
      source: "/offline.html",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache",
        },
      ],
    },
  ],
};
