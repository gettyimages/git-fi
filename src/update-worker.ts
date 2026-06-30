import { request } from "node:https";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Detached background worker: fetch the latest published version from the npm
// registry and write it to the cache file, then exit. Spawned by update-check;
// never run inline. Best-effort — any failure exits silently (stdio is ignored
// by the parent), so a registry outage can never surface or block git-fi.

const [, , name, cachePath] = process.argv;

if (!name || !cachePath) process.exit(1);

const url = `https://registry.npmjs.org/${name.replace("/", "%2F")}`;

const req = request(
  url,
  {
    method: "GET",
    headers: { accept: "application/vnd.npm.install-v1+json" },
    timeout: 5000,
  },
  (res) => {
    if (res.statusCode !== 200) {
      res.resume();
      process.exit(0);
    }
    let body = "";
    res.setEncoding("utf-8");
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      try {
        const latest = JSON.parse(body)["dist-tags"]?.latest;
        if (typeof latest === "string") {
          mkdirSync(dirname(cachePath), { recursive: true });
          writeFileSync(cachePath, JSON.stringify({ latest, checkedAt: Date.now() }));
        }
      } catch {
        // best-effort: leave the cache untouched on a parse/write error
      }
      process.exit(0);
    });
  }
);
req.on("timeout", () => {
  req.destroy();
  process.exit(0);
});
req.on("error", () => process.exit(0));
req.end();
