/**
 * Minimal Lab Runtime API server.
 *
 *   node server/index.ts            # API on :8788, serves dist/ when built
 *   LAB_PORT=9000 LAB_DB_PATH=…     # env overrides
 *
 * The same process serves the built SPA (dist/) with history-API fallback,
 * so production is a single Node ≥22.13 process — no framework, no workers.
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "./db/client.ts";
import { attachDb, attachSession, type AppVariables } from "./http/context.ts";
import { authRoutes } from "./routes/auth.ts";
import { adminRoutes } from "./routes/admin.ts";
import { calculatorRoutes } from "./routes/calculator.ts";
import { dashboardRoutes } from "./routes/dashboard.ts";
import { imageEncodingRoutes } from "./routes/image-encoding.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const distRoot = resolve(here, "../dist");

export function createApp(db: DatabaseSync) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("/api/*", attachDb(db), attachSession());

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/auth", authRoutes());
  app.route("/api/admin", adminRoutes());
  app.route("/api/classes/:classId/labs/calculator", calculatorRoutes());
  app.route("/api/classes/:classId/labs/image-encoding", imageEncodingRoutes());
  app.route("/api/classes/:classId/dashboard", dashboardRoutes());

  app.notFound((c) => c.json({ error: "not-found" }, 404));
  app.onError((err, c) => {
    console.error("[api]", err);
    return c.json({ error: "internal-error" }, 500);
  });
  return app;
}

export function createServerApp(db: DatabaseSync) {
  const app = createApp(db);

  if (existsSync(distRoot)) {
    app.use("/*", serveStatic({ root: distRoot }));
    // SPA history fallback for extensionless paths.
    app.get("/*", async (c, next) => {
      const path = new URL(c.req.url).pathname;
      if (path.includes(".")) return next();
      const html = await readFile(resolve(distRoot, "index.html"), "utf8");
      return c.html(html);
    });
  }
  return app;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(here, "index.ts");
if (isMain) {
  const port = Number(process.env.LAB_PORT ?? 8788);
  const db = getDb();
  serve({ fetch: createServerApp(db).fetch, port }, (info) => {
    console.log(`[lab-server] listening on http://localhost:${info.port}`);
    console.log(`[lab-server] db: ${process.env.LAB_DB_PATH ?? "data/lab.db"}`);
  });
}
