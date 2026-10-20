// SPDX-License-Identifier: AGPL-3.0-only
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.PORT || 5175);
const mime = { html: "text/html; charset=utf-8", js: "text/javascript", css: "text/css", json: "application/json", gz: "application/octet-stream", bin: "application/octet-stream" };
createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const path = resolve(root, "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(404).end(); return; }
    const bytes = await readFile(path);
    res.writeHead(200, {
      "Content-Type": mime[path.split(".").pop()] || "text/plain; charset=utf-8",
      "Content-Length": bytes.length,
      "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      // Also governs the worker: documents cannot fetch external resources.
      "Content-Security-Policy": "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    }).end(req.method === "HEAD" ? undefined : bytes);
  } catch { res.writeHead(404).end("Not found. Run npm run build first."); }
}).listen(port, "127.0.0.1", () => console.log(`Static converter: http://localhost:${port}`));
