import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiTarget } from "../config/api-target.mjs";

function evaluate(code, flag) {
  const env = {
    ...process.env,
    VITE_API_URL: "/api/v1",
    API_PROXY_TARGET: "http://old-local-proxy.invalid",
  };
  delete env.PROD;
  if (flag !== undefined) env.PROD = flag;
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      env,
      encoding: "utf8",
    }),
  );
}
const vite = `import { loadConfigFromFile } from 'vite'; const { config } = await loadConfigFromFile({ command: 'serve', mode: 'development' }); console.log(JSON.stringify(config.server.proxy['/api'].target));`;
function output(flag) {
  const root = mkdtempSync(path.join(tmpdir(), "ekamuthu-deployment-"));
  const env = {
    ...process.env,
    VITE_API_URL: "/api/v1",
    API_PROXY_TARGET: "http://old-local-proxy.invalid",
  };
  delete env.PROD;
  if (flag !== undefined) env.PROD = flag;
  try {
    mkdirSync(path.join(root, "dist/assets"), { recursive: true });
    mkdirSync(path.join(root, "dist/icons"));
    for (const [file, content] of [
      ["index.html", "app"],
      ["assets/main-hash.js", "script"],
      ["icons/icon.png", "icon"],
      ["sw.js", "worker"],
      ["offline.html", "offline"],
      ["manifest.webmanifest", "{}"],
    ])
      writeFileSync(path.join(root, "dist", file), content);
    const script = fileURLToPath(
      new URL("../scripts/build-vercel.mjs", import.meta.url),
    );
    execFileSync(process.execPath, [script], {
      env,
      cwd: root,
      encoding: "utf8",
    });
    const result = JSON.parse(
      readFileSync(path.join(root, ".vercel/output/config.json"), "utf8"),
    );
    for (const file of [
      "index.html",
      "assets/main-hash.js",
      "icons/icon.png",
      "sw.js",
      "offline.html",
      "manifest.webmanifest",
    ])
      assert.equal(
        readFileSync(path.join(root, ".vercel/output/static", file), "utf8"),
        readFileSync(path.join(root, "dist", file), "utf8"),
      );
    return result;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("PROD generates literal deployment routes and complete static output for both environments", () => {
  for (const [flag, target] of [
    ["true", "https://court-social-production.up.railway.app"],
    ["false", "https://api-staging-52eb.up.railway.app"],
  ]) {
    const config = output(flag);
    assert.equal(config.version, 3);
    const proxy = config.routes[0];
    assert.equal(
      "/api/v1/auth/login".replace(new RegExp(proxy.src), proxy.dest),
      `${target}/api/v1/auth/login`,
    );
    assert.equal(
      "/api/v1/admin/courts".replace(new RegExp(proxy.src), proxy.dest),
      `${target}/api/v1/admin/courts`,
    );
    assert.equal(
      proxy.has,
      undefined,
      "the flag must apply to custom domains too",
    );
    assert.deepEqual(proxy.headers, {
      "Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    });
    const workerHeaders = config.routes.find(
      (rule) => rule.src && new RegExp(rule.src).test("/sw.js"),
    );
    assert.equal(workerHeaders.headers["Cache-Control"], "no-cache");
    assert.equal(workerHeaders.continue, true);
    assert.ok(config.routes.some((rule) => rule.handle === "filesystem"));
    const fallback = config.routes.at(-1);
    assert.equal(fallback.dest, "/index.html");
    const regex = new RegExp(fallback.src);
    for (const pathname of ["/calendar", "/games/123", "/login"])
      assert.ok(regex.test(pathname));
    for (const pathname of [
      "/api",
      "/api/v1/auth/login",
      "/assets/missing.js",
      "/icons/missing.png",
      "/sw.js",
      "/manifest.webmanifest",
      "/offline.html",
    ])
      assert.equal(
        regex.test(pathname),
        false,
        `${pathname} must never fall back to app HTML`,
      );
  }
});

test("missing PROD defaults generated deployment routes to staging", () => {
  assert.equal(
    output().routes[0].dest,
    "https://api-staging-52eb.up.railway.app/api/$1",
  );
});

test("explicit PROD controls the actual Vite proxy even with an older API_PROXY_TARGET", () => {
  assert.equal(
    evaluate(vite, "true"),
    "https://court-social-production.up.railway.app",
  );
  assert.equal(
    evaluate(vite, "false"),
    "https://api-staging-52eb.up.railway.app",
  );
});

test("local backend overrides remain available when PROD is absent", () => {
  assert.equal(
    apiTarget({ API_PROXY_TARGET: "http://localhost:8082" }, { local: true }),
    "http://localhost:8082",
  );
  assert.equal(apiTarget({}, { local: true }), "http://localhost:8080");
});

test("invalid PROD values stop configuration instead of selecting an unintended database", () => {
  for (const value of ["", "yes", "1", "production"])
    assert.throws(() => apiTarget({ PROD: value }), /Set PROD to true/);
});

test("a direct API URL cannot silently bypass an explicit PROD selection", () => {
  for (const value of ["true", "false"])
    assert.throws(
      () =>
        apiTarget({
          PROD: value,
          VITE_API_URL: "https://old-api.invalid/api/v1",
        }),
      /remove VITE_API_URL/,
    );
});
