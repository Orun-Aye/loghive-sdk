/**
 * Static server for the Apperio browser example.
 *
 * Serves the example pages and mounts the built SDK at /sdk, so the pages can
 * `import { Apperio } from "/sdk/index.mjs"` against your working tree instead
 * of an npm install. Run `npm run build` first.
 *
 *   node example/browser/serve.mjs [port]
 *
 * No dependencies. Node 18+.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "../../dist");
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** Resolves a URL path to a file on disk, refusing anything outside `root`. */
function safeJoin(root, urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const full = join(root, clean);
  return full.startsWith(root) ? full : null;
}

async function send(res, file, status = 200) {
  const body = await readFile(file);
  res.writeHead(status, {
    "Content-Type": MIME[extname(file)] || "application/octet-stream",
    // The example is edited constantly; never let the browser cache it.
    "Cache-Control": "no-store",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    let urlPath = new URL(req.url, "http://localhost").pathname;
    if (urlPath === "/") urlPath = "/index.html";

    // The built SDK, served straight out of dist/ (including split chunks).
    if (urlPath.startsWith("/sdk/")) {
      const file = safeJoin(DIST, urlPath.slice("/sdk".length));
      if (!file) return res.writeHead(403).end("Forbidden");
      return await send(res, file);
    }

    const file = safeJoin(HERE, urlPath);
    if (!file) return res.writeHead(403).end("Forbidden");
    return await send(res, file);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end('<p style="font:14px system-ui">Not found. <a href="/">Back to the example</a></p>');
    }
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server error: " + err.message);
  }
});

// Fail loudly and early if the SDK has not been built.
try {
  await stat(join(DIST, "index.mjs"));
} catch {
  console.error("\n  dist/index.mjs is missing. Build the SDK first:\n\n    npm run build\n");
  process.exit(1);
}

server.listen(PORT, () => {
  console.log("\n  Apperio browser example");
  console.log("  http://localhost:" + PORT);
  console.log("\n  Serving pages from example/browser and the SDK from dist/");
  console.log("  Point it at your backend on the page itself. Ctrl+C to stop.\n");
});
