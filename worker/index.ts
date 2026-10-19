import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "./env";
import { requireAccess, requireProfile } from "./auth";
import { session } from "./routes/session";
import { admin, directory } from "./routes/admin";
import { posts } from "./routes/posts";
import { backup } from "./backup";
import { canAdmin } from "../shared/rules";

const app = new Hono<AppEnv>().basePath("/api");

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Server error" }, 500);
});

app.use("*", requireAccess);
app.use("*", async (c, next) => {
  if (!c.env.SESSION_SECRET) return c.json({ error: "SESSION_SECRET is not set" }, 500);
  await next();
});
app.route("/", session);

const authed = new Hono<AppEnv>();
authed.use("*", requireProfile);
authed.route("/", directory);
authed.route("/admin", admin);
authed.route("/", posts);
authed.post("/admin/backup", async (c) => {
  if (!canAdmin(c.get("profile"))) return c.json({ error: "Admins only" }, 403);
  return c.json({ key: await backup(c.env) });
});
app.route("/", authed);

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(backup(env));
  },
} satisfies ExportedHandler<Env>;
