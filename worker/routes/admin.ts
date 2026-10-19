import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { hashPin, isValidPin, parseRoles } from "../auth";
import { audit, bad, body, idParam, now, optNum, optStr } from "../util";
import { canAdmin, ROLES, type Role } from "../../shared/rules";

/** Read-only directory data everyone needs (people, platforms, accounts, rules). */
export const directory = new Hono<AppEnv>();

directory.get("/profiles", async (c) => {
  const admin = canAdmin(c.get("profile"));
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, avatar_color, roles, active${admin ? ", email, locked_until" : ""} FROM profiles ORDER BY name`,
  ).all<{ roles: string }>();
  return c.json(results.map((r) => ({ ...r, roles: parseRoles(r.roles) })));
});

directory.get("/platforms", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM platforms ORDER BY sort, name").all<{ extra_fields: string }>();
  return c.json(results.map((p) => ({ ...p, extra_fields: JSON.parse(p.extra_fields || "[]") })));
});

directory.get("/accounts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, p.name AS platform_name, p.key AS platform_key, p.color AS platform_color
       FROM accounts a JOIN platforms p ON p.id = a.platform_id
      WHERE a.deleted_at IS NULL ORDER BY p.sort, a.handle`,
  ).all();
  return c.json(results);
});

directory.get("/rules", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM assignment_rules").all();
  return c.json(results);
});

/** Admin-only writes. */
export const admin = new Hono<AppEnv>();
admin.use(
  "*",
  createMiddleware<AppEnv>(async (c, next) => {
    if (!canAdmin(c.get("profile"))) bad("Admins only", 403);
    return next();
  }),
);

const cleanRoles = (v: unknown): Role[] => {
  if (!Array.isArray(v)) bad("roles must be an array");
  return [...new Set(v.filter((r): r is Role => ROLES.includes(r)))];
};

async function adminCount(c: { env: AppEnv["Bindings"] }, excludeId: number) {
  const { results } = await c.env.DB.prepare("SELECT roles FROM profiles WHERE active = 1 AND id != ?")
    .bind(excludeId)
    .all<{ roles: string }>();
  return results.filter((r) => parseRoles(r.roles).includes("admin")).length;
}

admin.post("/profiles", async (c) => {
  const b = await body<{ name: string; avatar_color?: string; roles: Role[]; email?: string; pin: string }>(c);
  if (!b.name?.trim()) bad("Name is required");
  if (!isValidPin(b.pin)) bad("PIN must be 4 digits");
  const { count } = (await c.env.DB.prepare("SELECT COUNT(*) AS count FROM profiles WHERE active = 1").first<{ count: number }>())!;
  if (count >= 25) bad("Profile limit reached");
  const h = await hashPin(b.pin);
  const r = await c.env.DB.prepare(
    "INSERT INTO profiles (name, avatar_color, pin_hash, pin_salt, roles, email, created_at) VALUES (?,?,?,?,?,?,?) RETURNING id",
  )
    .bind(b.name.trim(), b.avatar_color || "#6366f1", h.hash, h.salt, JSON.stringify(cleanRoles(b.roles)), b.email || null, now())
    .first<{ id: number }>();
  await audit(c, "profile", r!.id, "create", { name: b.name });
  return c.json(r, 201);
});

admin.patch("/profiles/:id", async (c) => {
  const id = idParam(c);
  const b = await body<{ name?: string; avatar_color?: string; roles?: Role[]; email?: string; active?: boolean; pin?: string }>(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.name !== undefined) (sets.push("name = ?"), vals.push(String(b.name).trim()));
  if (b.avatar_color !== undefined) (sets.push("avatar_color = ?"), vals.push(b.avatar_color));
  if (b.email !== undefined) (sets.push("email = ?"), vals.push(b.email || null));
  if (b.roles !== undefined) {
    const roles = cleanRoles(b.roles);
    if (!roles.includes("admin") && (await adminCount(c, id)) === 0) bad("Keep at least one admin");
    sets.push("roles = ?"), vals.push(JSON.stringify(roles));
  }
  if (b.active !== undefined) {
    if (!b.active && (await adminCount(c, id)) === 0) bad("Keep at least one admin");
    sets.push("active = ?"), vals.push(b.active ? 1 : 0);
  }
  if (b.pin !== undefined) {
    if (!isValidPin(b.pin)) bad("PIN must be 4 digits");
    const h = await hashPin(b.pin);
    sets.push("pin_hash = ?", "pin_salt = ?", "failed_attempts = 0", "locked_until = NULL");
    vals.push(h.hash, h.salt);
  }
  if (!sets.length) bad("Nothing to update");
  await c.env.DB.prepare(`UPDATE profiles SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  await audit(c, "profile", id, "update", { ...b, pin: b.pin ? "reset" : undefined });
  return c.json({ ok: true });
});

admin.post("/platforms", async (c) => {
  const b = await body<{ key: string; name: string; char_limit?: number; extra_fields?: unknown[]; color?: string }>(c);
  if (!b.name?.trim()) bad("Name is required");
  const key = (b.key || b.name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const r = await c.env.DB.prepare(
    "INSERT INTO platforms (key, name, char_limit, extra_fields, color, sort) VALUES (?,?,?,?,?, (SELECT COALESCE(MAX(sort),0)+1 FROM platforms)) RETURNING id",
  )
    .bind(key, b.name.trim(), optNum(b.char_limit) ?? null, JSON.stringify(b.extra_fields ?? []), b.color || "#64748b")
    .first<{ id: number }>();
  return c.json(r, 201);
});

admin.patch("/platforms/:id", async (c) => {
  const id = idParam(c);
  const b = await body<{ name?: string; char_limit?: number | null; extra_fields?: unknown[]; color?: string; active?: boolean }>(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.name !== undefined) (sets.push("name = ?"), vals.push(b.name));
  if (b.char_limit !== undefined) (sets.push("char_limit = ?"), vals.push(optNum(b.char_limit)));
  if (b.extra_fields !== undefined) (sets.push("extra_fields = ?"), vals.push(JSON.stringify(b.extra_fields)));
  if (b.color !== undefined) (sets.push("color = ?"), vals.push(b.color));
  if (b.active !== undefined) (sets.push("active = ?"), vals.push(b.active ? 1 : 0));
  if (!sets.length) bad("Nothing to update");
  await c.env.DB.prepare(`UPDATE platforms SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  return c.json({ ok: true });
});

admin.post("/accounts", async (c) => {
  const b = await body<Record<string, unknown>>(c);
  const platformId = optNum(b.platform_id);
  if (!platformId) bad("Platform is required");
  const handle = optStr(b.handle, 200);
  if (!handle?.trim()) bad("Handle is required");
  const r = await c.env.DB.prepare(
    "INSERT INTO accounts (platform_id, handle, display_name, url, timezone, notes, created_at) VALUES (?,?,?,?,?,?,?) RETURNING id",
  )
    .bind(platformId, handle.trim(), optStr(b.display_name, 200) ?? null, optStr(b.url, 500) ?? null, optStr(b.timezone, 64) ?? null, optStr(b.notes, 5000) ?? null, now())
    .first<{ id: number }>();
  await audit(c, "account", r!.id, "create", { handle });
  return c.json(r, 201);
});

admin.patch("/accounts/:id", async (c) => {
  const id = idParam(c);
  const b = await body<Record<string, unknown>>(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of ["handle", "display_name", "url", "timezone", "notes"] as const) {
    const v = optStr(b[f], 5000);
    if (v !== undefined) (sets.push(`${f} = ?`), vals.push(v));
  }
  const pid = optNum(b.platform_id);
  if (pid) (sets.push("platform_id = ?"), vals.push(pid));
  if (b.active !== undefined) (sets.push("active = ?"), vals.push(b.active ? 1 : 0));
  if (!sets.length) bad("Nothing to update");
  await c.env.DB.prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  await audit(c, "account", id, "update", b);
  return c.json({ ok: true });
});

/** Soft delete: past posts keep their history. */
admin.delete("/accounts/:id", async (c) => {
  const id = idParam(c);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE accounts SET deleted_at = ?, active = 0 WHERE id = ?").bind(now(), id),
    c.env.DB.prepare("DELETE FROM assignment_rules WHERE account_id = ?").bind(id),
  ]);
  await audit(c, "account", id, "delete");
  return c.json({ ok: true });
});

/** Set (or clear with profile_id = null) who handles an account for a role. */
admin.put("/rules", async (c) => {
  const b = await body<{ account_id: number; role: string; profile_id: number | null }>(c);
  if (!["manager", "creative", "writer"].includes(b.role)) bad("Invalid role");
  const accountId = optNum(b.account_id);
  if (!accountId) bad("Account is required");
  if (b.profile_id == null) {
    await c.env.DB.prepare("DELETE FROM assignment_rules WHERE account_id = ? AND role = ?").bind(accountId, b.role).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO assignment_rules (account_id, role, profile_id) VALUES (?,?,?)
       ON CONFLICT(account_id, role) DO UPDATE SET profile_id = excluded.profile_id`,
    )
      .bind(accountId, b.role, Number(b.profile_id))
      .run();
  }
  await audit(c, "account", accountId, "assign", b);
  return c.json({ ok: true });
});
