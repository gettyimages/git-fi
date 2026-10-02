// Serves docs/ the way GitHub Pages does, for previewing the Docsify site
// locally (npm run docs). Docsify renders in the browser, so any static server
// works; this one keeps the preview free of extra dependencies.
//
// The spec page includes spec-body.md, which the Pages workflow copies from
// SPEC.md at deploy time, so this copies it the same way before serving.
import { copyFileSync, createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const docs = resolve(root, "docs");
const port = Number(process.env.PORT ?? 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
};

copyFileSync(join(root, "SPEC.md"), join(docs, "spec-body.md"));

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const file = resolve(docs, "." + (path.endsWith("/") ? path + "index.html" : path));
  if (file !== docs && !file.startsWith(docs + sep)) {
    res.writeHead(403).end();
    return;
  }
  let isFile = false;
  try {
    isFile = statSync(file).isFile();
  } catch {}
  if (!isFile) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Serving docs/ at http://127.0.0.1:${port}/  (Ctrl-C to stop)\n`);
});
