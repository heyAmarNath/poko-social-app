import { env, SELF } from "cloudflare:test";

/** Requests go to localhost, where the dev sign-in works (DEV_LOGIN is set for tests). */
export const BASE = "http://localhost/api";

export async function call(path: string, init: { method?: string; json?: unknown; cookie?: string; body?: BodyInit; headers?: Record<string, string>; host?: string } = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  if (init.cookie) headers.cookie = init.cookie;
  const url = init.host ? `http://${init.host}/api${path}` : `${BASE}${path}`;
  const res = await SELF.fetch(url, {
    method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    redirect: "manual",
  });
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : type.startsWith("text/") ? await res.text() : await res.arrayBuffer();
  return { status: res.status, data: data as any, res };
}

/** The value of one cookie a response sets, as a "name=value" request cookie. */
export const cookieFrom = (res: Response, name: string) =>
  res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`) && c.length > name.length + 1);

let n = 0;
/** Creates a profile directly in the database and returns its id. */
export async function makeProfile(opts: { name?: string; email?: string; role?: "admin" | "member" } = {}) {
  const i = ++n;
  const row = await env.DB.prepare("INSERT INTO profiles (name, email, avatar_color, role, created_at) VALUES (?,?,?,?,?) RETURNING id")
    .bind(opts.name ?? `Person ${i}`, opts.email ?? `person${i}.${crypto.randomUUID().slice(0, 8)}@example.com`, "#123456", opts.role ?? "member", Date.now())
    .first<{ id: number }>();
  return row!.id;
}

/** Signs in through the dev sign-in and returns the session cookie. */
export async function login(id: number) {
  const r = await call("/auth/dev", { json: { profile_id: id } });
  if (r.status !== 200) throw new Error(`login failed: ${r.status} ${JSON.stringify(r.data)}`);
  return cookieFrom(r.res, "sp_session")!;
}

export async function member(name?: string) {
  const id = await makeProfile({ name, role: "member" });
  return { id, cookie: await login(id) };
}

export async function admin(name?: string) {
  const id = await makeProfile({ name, role: "admin" });
  return { id, cookie: await login(id) };
}

export async function platformId(key: string) {
  return (await env.DB.prepare("SELECT id FROM platforms WHERE key = ?").bind(key).first<{ id: number }>())!.id;
}

/** Seeds the default platforms (the seed script is not part of migrations). */
export async function seedPlatforms() {
  const rows: [string, string, number][] = [["x", "X", 280], ["instagram", "Instagram", 2200], ["linkedin", "LinkedIn", 3000], ["reddit", "Reddit", 40000]];
  for (const [i, [key, name, limit]] of rows.entries()) {
    await env.DB.prepare("INSERT OR IGNORE INTO platforms (key, name, char_limit, color, sort) VALUES (?,?,?,?,?)").bind(key, name, limit, "#000000", i).run();
  }
}
