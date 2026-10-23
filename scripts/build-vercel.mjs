import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { apiTarget } from "../config/api-target.mjs";

export async function buildVercel(root = process.cwd()) {
  const target = apiTarget(loadEnv("production", root, ""));
  const dist = path.join(root, "dist");
  await stat(path.join(dist, "index.html"));
  const output = path.join(root, ".vercel/output");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(dist, path.join(output, "static"), { recursive: true });
  const config = {
    version: 3,
    routes: [
      {
        src: "^/api(?:/(.*))?$",
        dest: `${target}/api/$1`,
        headers: {
          "Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
        },
      },
      {
        src: "^/(sw\\.js|manifest\\.webmanifest|offline\\.html)$",
        headers: { "Cache-Control": "no-cache" },
        continue: true,
      },
      {
        src: "^/assets/(.*)$",
        headers: { "Cache-Control": "public, max-age=31536000, immutable" },
        continue: true,
      },
      { handle: "filesystem" },
      {
        src: "^/((?!api(?:/|$)|assets/|icons/|sw\\.js$|manifest\\.webmanifest$|offline\\.html$).*)$",
        dest: "/index.html",
        headers: { "Cache-Control": "no-cache" },
      },
    ],
  };
  await writeFile(
    path.join(output, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
  console.log(`Vercel API proxy: ${target}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildVercel();
}
