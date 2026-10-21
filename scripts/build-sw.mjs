import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const version = createHash("sha256")
  .update(await readFile("dist/index.html"))
  .update(await readFile("dist/offline.html"))
  .update(await readFile("src/service-worker.js"))
  .digest("hex")
  .slice(0, 12);
const source = await readFile("src/service-worker.js", "utf8");
await writeFile("dist/sw.js", source.replace("__BUILD_VERSION__", version));
