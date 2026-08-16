import { existsSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "");
const base = normalizeBase(process.argv[3] ?? "/");

if (!dist || !existsSync(join(dist, "index.html"))) {
  throw new Error("smoke: dist/index.html is missing");
}

function normalizeBase(value) {
  const raw = value.trim() || "/";
  if (raw === "/") return "/";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

function routePath(pathname) {
  if (base === "/") return pathname;
  if (pathname === base) return "/";
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length) || "/";
  return null;
}

function contentType(path) {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
    }[extname(path)] ?? "application/octet-stream"
  );
}

function fileForRoute(pathname) {
  const route = routePath(pathname);
  if (route === null) return null;
  const candidate = resolve(join(dist, decodeURIComponent(route)));
  const relativePath = relative(dist, candidate);
  if (relativePath.startsWith("..") || relativePath.startsWith("/")) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  if (extname(route) !== "") return null;
  return join(dist, "index.html");
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    const file = fileForRoute(url.pathname);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(file), { headers: { "content-type": contentType(file) } });
  },
});

try {
  const origin = `http://${server.hostname}:${server.port}`;
  const rootPath = base === "/" ? "/" : `${base}/`;
  const deepPath = `${rootPath}labs/image-encoding?scenario=low-sampling`;
  const index = await (await fetch(`${origin}${rootPath}`)).text();
  if (!index.includes('id="root"')) throw new Error("smoke: root did not return index.html");
  const deepResponse = await fetch(`${origin}${deepPath}`);
  if (deepResponse.status !== 200)
    throw new Error(`smoke: deep route returned ${deepResponse.status}`);
  const deep = await deepResponse.text();
  if (deep !== index) throw new Error("smoke: deep route did not use history fallback");

  const assets = [...index.matchAll(/(?:src|href)="([^\"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => path.startsWith("/") && !path.endsWith(".html"));
  for (const asset of assets) {
    const response = await fetch(`${origin}${asset}`);
    if (response.status !== 200)
      throw new Error(`smoke: asset ${asset} returned ${response.status}`);
  }
  const missingAssetResponse = await fetch(`${origin}${rootPath}assets/missing.js`);
  if (missingAssetResponse.status !== 404)
    throw new Error(`smoke: missing asset returned ${missingAssetResponse.status}`);
  if (base !== "/") {
    const unprefixedResponse = await fetch(`${origin}/labs/image-encoding`);
    if (unprefixedResponse.status !== 404)
      throw new Error(`smoke: unprefixed subpath returned ${unprefixedResponse.status}`);
  }
  console.log(`smoke: ok base=${base} assets=${assets.length}`);
} finally {
  server.stop(true);
}
