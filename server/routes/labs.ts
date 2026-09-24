import { Hono } from "hono";
import { jsonError, type AppVariables } from "../http/context.ts";
import { labCatalog } from "../labs.ts";

/**
 * Lab catalog for any signed-in user. The home page, entry redirects and the
 * admin visibility table all read this; the hidden flag is admin-managed via
 * PUT /api/admin/labs/:labId/visibility.
 */
export function labsRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get("/", (c) => {
    if (!c.get("user")) return jsonError(c, 401, "unauthenticated");
    return c.json({ labs: labCatalog(c.get("db")) });
  });

  return app;
}
