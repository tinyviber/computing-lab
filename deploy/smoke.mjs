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
      ".jpg": "image/jpeg",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    }[extname(path)] ?? "application/octet-stream"
  );
}

function fileForRoute(pathname) {
  const route = routePath(pathname);
  if (route === null) return null;
  let candidate;
  try {
    candidate = resolve(join(dist, decodeURIComponent(route)));
  } catch {
    return null;
  }
  const relativePath = relative(dist, candidate);
  if (relativePath.startsWith("..") || relativePath.startsWith("/")) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;

  const slide = route.match(/^\/slides\/([A-Za-z0-9][A-Za-z0-9_-]*)(\/.*)?$/);
  if (slide) {
    if (extname(route) !== "") return null;
    const slideIndex = resolve(join(dist, "slides", slide[1], "index.html"));
    return existsSync(slideIndex) && statSync(slideIndex).isFile() ? slideIndex : null;
  }

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
  const deepPath = `${rootPath}labs/image-encoding?image=checkerboard&sample=25&phase=0.5&bits=2&view=error`;
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

  const slidesRoot = join(dist, "slides");
  if (existsSync(slidesRoot)) {
    const slidePath = `${rootPath}slides/excel-01/`;
    const slideResponse = await fetch(`${origin}${slidePath}`);
    if (slideResponse.status !== 200)
      throw new Error(`smoke: Slidev route returned ${slideResponse.status}`);
    const slideIndex = await slideResponse.text();
    if (!slideIndex.includes('meta property="slidev:version"'))
      throw new Error("smoke: Slidev index was not served");

    const slideDeepResponse = await fetch(`${origin}${rootPath}slides/excel-01/2`);
    if (slideDeepResponse.status !== 200)
      throw new Error(`smoke: Slidev deep route returned ${slideDeepResponse.status}`);
    if ((await slideDeepResponse.text()) !== slideIndex)
      throw new Error("smoke: Slidev deep route did not use deck fallback");

    const slideAssets = [...slideIndex.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path.startsWith("/") && !path.endsWith(".html"));
    for (const asset of slideAssets) {
      const response = await fetch(`${origin}${asset}`);
      if (response.status !== 200)
        throw new Error(`smoke: Slidev asset ${asset} returned ${response.status}`);
    }

    const missingSlide = await fetch(`${origin}${rootPath}slides/unknown/`);
    if (missingSlide.status !== 404)
      throw new Error(`smoke: unknown Slidev route returned ${missingSlide.status}`);
    const missingSlideAsset = await fetch(`${origin}${slidePath}assets/missing.js`);
    if (missingSlideAsset.status !== 404)
      throw new Error(`smoke: missing Slidev asset returned ${missingSlideAsset.status}`);
  }

  if (base !== "/") {
    const unprefixedResponse = await fetch(`${origin}/labs/image-encoding`);
    if (unprefixedResponse.status !== 404)
      throw new Error(`smoke: unprefixed subpath returned ${unprefixedResponse.status}`);
  }
  console.log(`smoke: ok base=${base} assets=${assets.length}`);
} finally {
  server.stop(true);
}
