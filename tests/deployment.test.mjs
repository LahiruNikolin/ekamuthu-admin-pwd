import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
const vercel = `import { config } from './vercel.mjs'; console.log(JSON.stringify(config));`;
const vite = `import { loadConfigFromFile } from 'vite'; const { config } = await loadConfigFromFile({ command: 'serve', mode: 'development' }); console.log(JSON.stringify(config.server.proxy['/api'].target));`;

test("PROD switches the actual deployment proxy without changing the browser API origin", () => {
  for (const [flag, target] of [
    ["true", "https://court-social-production.up.railway.app"],
    ["false", "https://api-staging-52eb.up.railway.app"],
  ]) {
    const config = evaluate(vercel, flag);
    assert.equal(config.rewrites[0].source, "/api/:path*");
    assert.equal(config.rewrites[0].destination, `${target}/api/:path*`);
    assert.equal(
      config.rewrites[0].has,
      undefined,
      "the flag must apply to custom domains too",
    );
    assert.deepEqual(
      config.headers.find((rule) => rule.source === "/api/:path*").headers,
      [
        { key: "Cache-Control", value: "no-store" },
        { key: "Vercel-CDN-Cache-Control", value: "no-store" },
      ],
    );
    assert.equal(
      config.headers.find((rule) => rule.source === "/sw.js").headers[0].value,
      "no-cache",
    );
    assert.equal(config.rewrites.at(-1).destination, "/index.html");
    assert.ok(
      config.rewrites.at(-1).source.includes("?!api/"),
      "SPA fallback must exclude API failures",
    );
  }
});

test("missing PROD defaults deployed requests to staging rather than a development override", () => {
  assert.equal(
    evaluate(vercel).rewrites[0].destination,
    "https://api-staging-52eb.up.railway.app/api/:path*",
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
