import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "./env";
import { requireAdmin, requireProfile } from "./auth";
import { session } from "./routes/session";
import { admin, directory } from "./routes/admin";
import { posts } from "./routes/posts";
import { topics } from "./routes/topics";
import { purge } from "./purge";

const app = new Hono<AppEnv>().basePath("/api");

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Server error" }, 500);
});

// Security headers on every API response.
app.use("*", async (c, next) => {
  await next();
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "same-origin");
  c.header("x-frame-options", "DENY");
  if (!c.res.headers.has("cache-control")) c.header("cache-control", "no-store");
});
app.use("*", async (c, next) => {
  if (!c.env.SESSION_SECRET) return c.json({ error: "SESSION_SECRET is not set" }, 500);
  await next();
});
app.route("/", session);

// Everything else needs a signed-in profile; the settings area (/admin) needs an admin.
const authed = new Hono<AppEnv>();
authed.use("*", requireProfile);
authed.use("/admin/*", requireAdmin);
authed.route("/", directory);
authed.route("/", topics);
authed.route("/admin", admin);
authed.route("/", posts);
app.route("/", authed);

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purge(env));
  },
} satisfies ExportedHandler<Env>;
