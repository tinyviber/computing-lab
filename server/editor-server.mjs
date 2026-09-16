import { spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import httpProxy from "http-proxy";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const editorRoot = resolve(process.env.EDITOR_ROOT ?? root);
const lessonsRoot = resolve(editorRoot, "lessons");
const distRoot = resolve(root, "dist");
const port = Number(process.env.EDITOR_PORT ?? 8787);
const host = process.env.EDITOR_HOST ?? "0.0.0.0";
const vitePort = Number(process.env.EDITOR_VITE_PORT ?? 5173);
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? process.env.BASE_PATH ?? "/");
const editorPassword = process.env.EDITOR_PASSWORD?.trim() || null;
const sessionValue = editorPassword
  ? createHash("sha256").update(editorPassword).digest("hex")
  : null;
const maxBodyBytes = 2 * 1024 * 1024;
const editableExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".vue",
]);

const previewProcesses = new Map();
let nextPreviewPort = Number(process.env.EDITOR_PREVIEW_PORT ?? 3030);
let viteProcess = null;

function normalizeBasePath(value) {
  const raw = value?.trim() || "/";
  if (raw === "/") return "/";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

function externalPath(pathname) {
  if (basePath === "/") return pathname;
  return `${basePath}${pathname === "/" ? "/" : pathname}`;
}

function internalPath(pathname) {
  if (basePath === "/") return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return null;
}

function isSafeSlug(slug) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug);
}

function isWithin(parent, target) {
  const parentPath = resolve(parent);
  const targetPath = resolve(target);
  const relativePath = relative(parentPath, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/"));
}

function lessonDirectory(slug) {
  if (!isSafeSlug(slug)) return null;
  const directory = resolve(lessonsRoot, slug);
  if (!isWithin(lessonsRoot, directory) || !existsSync(directory)) return null;
  try {
    if (!statSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return directory;
}

function editablePath(lessonDir, relativePath) {
  if (!relativePath || relativePath.includes("\\")) return null;
  const target = resolve(lessonDir, relativePath);
  if (!isWithin(lessonDir, target)) return null;
  if (!editableExtensions.has(extname(target).toLowerCase())) return null;
  try {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return target;
}

function walkLessonFiles(directory, prefix = "") {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkLessonFiles(absolutePath, relativePath));
      continue;
    }
    if (!entry.isFile()) continue;
    const fileExtension = extname(entry.name).toLowerCase();
    result.push({
      path: relativePath,
      size: statSync(absolutePath).size,
      editable: editableExtensions.has(fileExtension),
    });
  }
  return result;
}

function lessonTitle(slug, directory) {
  const slidesPath = join(directory, "slides.md");
  if (!existsSync(slidesPath)) return slug;
  const source = readFileSync(slidesPath, "utf8");
  const match = source.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  return match?.[1]?.trim() || slug;
}

function listLessons() {
  if (!existsSync(lessonsRoot)) return [];
  return readdirSync(lessonsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isSafeSlug(entry.name) && !entry.isSymbolicLink())
    .map((entry) => {
      const directory = join(lessonsRoot, entry.name);
      const files = walkLessonFiles(directory);
      return {
        slug: entry.name,
        title: lessonTitle(entry.name, directory),
        files,
      };
    })
    .filter((lesson) => lesson.files.some((file) => file.path === "slides.md"));
}

function parseCookies(header) {
  return Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]),
  );
}

function authenticated(request) {
  if (!sessionValue) return true;
  const candidate = parseCookies(request.headers.cookie).editor_session ?? "";
  const expected = Buffer.from(sessionValue);
  const received = Buffer.from(candidate);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendText(response, status, body) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

function requireEditorAuth(request, response) {
  if (authenticated(request)) return true;
  sendJson(response, 401, { error: "需要登录后才能编辑课件。" });
  return false;
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function parseJsonBody(request) {
  return readBody(request).then((body) => {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error("invalid JSON");
    }
  });
}

function writeTextAtomically(path, content) {
  const temporaryPath = `${path}.editor-${process.pid}.tmp`;
  writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o640 });
  renameSync(temporaryPath, path);
}

function previewRecord(slug) {
  const lessonDir = lessonDirectory(slug);
  if (!lessonDir || !existsSync(join(lessonDir, "slides.md"))) return null;

  const existing = previewProcesses.get(slug);
  if (existing?.child && !existing.child.killed) return existing;

  const cliCandidates = [
    resolve(editorRoot, "node_modules/@slidev/cli/bin/slidev.mjs"),
    resolve(root, "node_modules/@slidev/cli/bin/slidev.mjs"),
  ];
  const cli = cliCandidates.find((candidate) => existsSync(candidate));
  if (!cli) {
    const unavailable = { state: "error", output: "找不到 @slidev/cli，请先安装项目依赖。" };
    previewProcesses.set(slug, unavailable);
    return unavailable;
  }

  const previewPort = nextPreviewPort;
  nextPreviewPort += 1;
  const previewBase = `${externalPath(`/__preview/${slug}/`)}`;
  const child = spawn(
    process.execPath,
    [cli, "slides.md", "--port", String(previewPort), "--base", previewBase],
    {
      cwd: lessonDir,
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const record = {
    child,
    port: previewPort,
    basePath: `/__preview/${slug}/`,
    state: "starting",
    output: "",
  };
  previewProcesses.set(slug, record);

  const appendOutput = (chunk) => {
    record.output = `${record.output}${chunk.toString("utf8")}`.slice(-8000);
  };
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);
  child.on("error", (error) => {
    record.state = "error";
    appendOutput(error);
  });
  child.on("exit", (code, signal) => {
    record.state = code === 0 ? "stopped" : "error";
    record.exit = { code, signal };
    record.child = null;
  });
  return record;
}

async function probePreview(record) {
  if (!record?.port || record.state === "error" || record.state === "stopped") return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 700);
  try {
    const response = await fetch(
      `http://localhost:${record.port}${externalPath(record.basePath)}`,
      {
        signal: controller.signal,
      },
    );
    if (response.ok) record.state = "ready";
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function previewMatch(pathname) {
  return pathname.match(/^\/__preview\/([A-Za-z0-9][A-Za-z0-9_-]*)(\/.*)?$/);
}

function proxyRequest(proxy, request, response, targetPort) {
  proxy.web(
    request,
    response,
    { target: `http://localhost:${targetPort}`, changeOrigin: true },
    (error) => {
      if (!response.headersSent) sendText(response, 502, `预览服务暂不可用：${error.message}`);
      else response.destroy(error);
    },
  );
}

function contentType(path) {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".gif": "image/gif",
      ".html": "text/html; charset=utf-8",
      ".ico": "image/x-icon",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".map": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    }[extname(path).toLowerCase()] ?? "application/octet-stream"
  );
}

function staticFilePath(route) {
  try {
    const decoded = decodeURIComponent(route);
    const candidate = resolve(distRoot, `.${decoded}`);
    if (!isWithin(distRoot, candidate)) return null;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  } catch {
    return null;
  }
  return null;
}

function serveStatic(request, response, route) {
  if (!existsSync(distRoot)) {
    sendText(response, 503, "dist 不存在，请先执行 bun run build。");
    return;
  }
  const file = staticFilePath(route);
  if (file) {
    response.writeHead(200, {
      "Content-Type": contentType(file),
      "Cache-Control": extname(file) ? "public, max-age=31536000, immutable" : "no-store",
    });
    createReadStream(file).pipe(response);
    return;
  }
  if (extname(route)) {
    sendText(response, 404, "Not found");
    return;
  }
  const index = join(distRoot, "index.html");
  if (!existsSync(index)) {
    sendText(response, 503, "dist/index.html 不存在，请先执行 bun run build。");
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  createReadStream(index).pipe(response);
}

async function handleApi(request, response, route) {
  if (route === "/api/editor/session" && request.method === "GET") {
    if (!authenticated(request)) {
      sendJson(response, 401, { authenticated: false, authRequired: true });
      return;
    }
    sendJson(response, 200, { authenticated: true, authRequired: Boolean(sessionValue) });
    return;
  }

  if (route === "/api/editor/login" && request.method === "POST") {
    if (!sessionValue) {
      sendJson(response, 200, { authenticated: true, authRequired: false });
      return;
    }
    try {
      const body = await parseJsonBody(request);
      const candidate = typeof body?.password === "string" ? body.password : "";
      const expected = Buffer.from(editorPassword);
      const received = Buffer.from(candidate);
      const valid = received.length === expected.length && timingSafeEqual(received, expected);
      if (!valid) {
        sendJson(response, 401, { error: "密码不正确。" });
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `editor_session=${sessionValue}; HttpOnly; SameSite=Strict; Path=${basePath}`,
      });
      response.end(JSON.stringify({ authenticated: true, authRequired: true }));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (route === "/api/editor/logout" && request.method === "POST") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `editor_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=${basePath}`,
    });
    response.end(JSON.stringify({ authenticated: false }));
    return;
  }

  if (!requireEditorAuth(request, response)) return;

  if (route === "/api/editor/lessons" && request.method === "GET") {
    sendJson(response, 200, { lessons: listLessons() });
    return;
  }

  const lessonMatch = route.match(/^\/api\/editor\/lessons\/([A-Za-z0-9][A-Za-z0-9_-]*)$/);
  if (lessonMatch && request.method === "GET") {
    const lesson = listLessons().find((item) => item.slug === lessonMatch[1]);
    if (!lesson) {
      sendJson(response, 404, { error: "课件不存在。" });
      return;
    }
    sendJson(response, 200, lesson);
    return;
  }

  const statusMatch = route.match(
    /^\/api\/editor\/lessons\/([A-Za-z0-9][A-Za-z0-9_-]*)\/preview-status$/,
  );
  if (statusMatch && request.method === "GET") {
    const record = previewRecord(statusMatch[1]);
    if (!record) {
      sendJson(response, 404, { error: "找不到可预览的课件。" });
      return;
    }
    const ready = await probePreview(record);
    sendJson(response, 200, {
      state: ready ? "ready" : record.state,
      output: record.output,
      url: externalPath(`/__preview/${statusMatch[1]}/`),
    });
    return;
  }

  const fileMatch = route.match(
    /^\/api\/editor\/lessons\/([A-Za-z0-9][A-Za-z0-9_-]*)\/files\/(.+)$/,
  );
  if (fileMatch) {
    const directory = lessonDirectory(fileMatch[1]);
    const relativePath = decodeURIComponent(fileMatch[2]);
    const file = directory && editablePath(directory, relativePath);
    if (!file) {
      sendJson(response, 404, { error: "文件不存在或不可编辑。" });
      return;
    }
    if (request.method === "GET") {
      sendJson(response, 200, {
        path: relativePath,
        content: readFileSync(file, "utf8"),
      });
      return;
    }
    if (request.method === "PUT") {
      try {
        const body = await parseJsonBody(request);
        if (typeof body?.content !== "string") throw new Error("content must be a string");
        writeTextAtomically(file, body.content);
        sendJson(response, 200, { path: relativePath, saved: true });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }
  }

  sendJson(response, 404, { error: "编辑器接口不存在。" });
}

const proxy = httpProxy.createProxyServer({ ws: true });
proxy.on("error", (error, request, response) => {
  if (response && !response.headersSent) sendText(response, 502, `代理失败：${error.message}`);
  else if (request?.socket) request.socket.destroy();
});

function startViteForDevelopment() {
  if (process.env.EDITOR_DEV !== "1") return;
  const viteCli = resolve(root, "node_modules/vite/bin/vite.js");
  if (!existsSync(viteCli)) throw new Error(`找不到 Vite CLI：${viteCli}`);
  viteProcess = spawn(
    process.execPath,
    [viteCli, "--host", "127.0.0.1", "--port", String(vitePort)],
    {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const route = internalPath(requestUrl.pathname);
    if (route === null) {
      sendText(response, 404, "Not found");
      return;
    }

    if (route.startsWith("/api/editor/")) {
      await handleApi(request, response, route);
      return;
    }

    const preview = previewMatch(route);
    if (preview) {
      if (!requireEditorAuth(request, response)) return;
      const record = previewRecord(preview[1]);
      if (!record?.port) {
        sendText(response, 503, record?.output || "预览服务不可用");
        return;
      }
      proxyRequest(proxy, request, response, record.port);
      return;
    }

    if (process.env.EDITOR_DEV === "1") {
      proxy.web(request, response, {
        target: `http://127.0.0.1:${vitePort}`,
        changeOrigin: true,
      });
      return;
    }
    serveStatic(request, response, route);
  } catch (error) {
    if (!response.headersSent) sendJson(response, 500, { error: error.message });
    else response.destroy(error);
  }
});

server.on("upgrade", (request, socket, head) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const route = internalPath(requestUrl.pathname);
    const preview = route && previewMatch(route);
    if (preview) {
      if (!authenticated(request)) {
        socket.destroy();
        return;
      }
      const record = previewRecord(preview[1]);
      if (!record?.port) {
        socket.destroy();
        return;
      }
      proxy.ws(request, socket, head, {
        target: `http://localhost:${record.port}`,
        changeOrigin: true,
      });
      return;
    }
    if (process.env.EDITOR_DEV === "1") {
      proxy.ws(request, socket, head, {
        target: `http://127.0.0.1:${vitePort}`,
        changeOrigin: true,
      });
      return;
    }
    socket.destroy();
  } catch {
    socket.destroy();
  }
});

function shutdown() {
  for (const record of previewProcesses.values()) record.child?.kill("SIGTERM");
  viteProcess?.kill("SIGTERM");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

mkdirSync(lessonsRoot, { recursive: true });
startViteForDevelopment();
server.listen(port, host, () => {
  const authMessage = sessionValue ? "password protected" : "EDITOR_PASSWORD not set";
  const mode = process.env.EDITOR_DEV === "1" ? "development" : "production";
  console.log(
    `Computing Lab editor: http://${host}:${port}${externalPath("/editor")} (${mode}, ${authMessage})`,
  );
  console.log(`Editor root: ${editorRoot}`);
});
