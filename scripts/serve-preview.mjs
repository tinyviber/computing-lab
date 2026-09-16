import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const port = Number(process.env.PORT ?? 4175);
const host = process.env.HOST ?? "127.0.0.1";

function normalizeBasePath(value) {
  const raw = value?.trim() || "/";
  if (raw === "/") return "/";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? process.env.BASE_PATH);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function routePath(requestPath) {
  if (basePath === "/") return requestPath;
  if (requestPath === basePath) return "/";
  if (requestPath.startsWith(`${basePath}/`)) return requestPath.slice(basePath.length) || "/";
  return null;
}

function safeFilePath(route) {
  try {
    const decoded = decodeURIComponent(route);
    const candidate = resolve(join(root, decoded));
    const relativePath = relative(root, candidate);
    const withinDist =
      relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/");
    return withinDist ? candidate : null;
  } catch {
    return null;
  }
}

function slideRoute(route) {
  return route?.match(/^\/slides\/([A-Za-z0-9][A-Za-z0-9_-]*)(\/.*)?$/);
}

function fileForRoute(route) {
  if (route === null) return null;

  const filePath = safeFilePath(route);
  if (filePath && existsSync(filePath) && statSync(filePath).isFile()) return filePath;

  const slide = slideRoute(route);
  if (slide) {
    if (extname(route) !== "") return null;
    const slideIndex = safeFilePath(`/slides/${slide[1]}/index.html`);
    return slideIndex && existsSync(slideIndex) && statSync(slideIndex).isFile()
      ? slideIndex
      : null;
  }

  return extname(route) === "" ? join(root, "index.html") : null;
}

function sendFile(response, filePath) {
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const route = routePath(requestUrl.pathname);
  const filePath = fileForRoute(route);

  if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(response, filePath);
    return;
  }

  const hasFileExtension = route === null || slideRoute(route) || extname(route) !== "";
  if (hasFileExtension) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  sendFile(response, join(root, "index.html"));
}).listen(port, host, () => {
  console.log(`Preview server: http://${host}:${port}${basePath}/`);
});
