import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { hashPin, isValidPin, requireAdmin } from "../auth";
import { audit, bad, body, idParam, now, optNum, optStr } from "../util";
import { isAdmin, ROLES, type Role } from "../../shared/rules";
import { backup } from "../backup";

/** Read-only directory data everyone needs (people, platforms, accounts, rules). */
export const directory = new Hono<AppEnv>();

directory.get("/profiles", async (c) => {
  const admin = isAdmin(c.get("profile"));
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, avatar_color, role, active${admin ? ", email, locked_until" : ""} FROM profiles ORDER BY name`,
  ).all();
  return c.json(results);
});

directory.get("/platforms", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM platforms ORDER BY sort, name").all<{ extra_fields: string }>();
  return c.json(results.map((p) => ({ ...p, extra_fields: JSON.parse(p.extra_fields || "[]") })));
});

directory.get("/accounts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, p.name AS platform_name, p.key AS platform_key, p.color AS platform_color, p.visible AS platform_visible
       FROM accounts a JOIN platforms p ON p.id = a.platform_id
      WHERE a.deleted_at IS NULL ORDER BY a.display_name, p.sort, a.handle`,
  ).all();
  return c.json(results);
});

directory.get("/rules", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM assignment_rules").all();
  return c.json(results);
});

/** Admin-only writes. */
export const admin = new Hono<AppEnv>();
admin.use("*", requireAdmin);

const cleanRole = (v: unknown): Role => {
  if (!ROLES.includes(v as Role)) bad("Role must be admin or member");
  return v as Role;
};

async function otherActiveAdmins(c: Context<AppEnv>, excludeId: number) {
  const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM profiles WHERE active = 1 AND role = 'admin' AND id != ?")
    .bind(excludeId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

admin.post("/profiles", async (c) => {
  const b = await body<{ name: string; avatar_color?: string; role: Role; email?: string; pin: string }>(c);
  if (!b.name?.trim()) bad("Name is required");
  if (!isValidPin(b.pin)) bad("PIN must be 4 digits");
  const { n } = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM profiles WHERE active = 1").first<{ n: number }>())!;
  if (n >= 25) bad("Profile limit reached");
  const h = await hashPin(b.pin);
  const r = await c.env.DB.prepare(
    "INSERT INTO profiles (name, avatar_color, pin_hash, pin_salt, role, email, created_at) VALUES (?,?,?,?,?,?,?) RETURNING id",
  )
    .bind(b.name.trim(), b.avatar_color || "#6366f1", h.hash, h.salt, cleanRole(b.role ?? "member"), b.email || null, now())
    .first<{ id: number }>();
  await audit(c, "profile", r!.id, "create", { name: b.name });
  return c.json(r, 201);
});

admin.patch("/profiles/:id", async (c) => {
  const id = idParam(c);
  const b = await body<{ name?: string; avatar_color?: string; role?: Role; email?: string; active?: boolean; pin?: string }>(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.name !== undefined) {
    if (!String(b.name).trim()) bad("Name is required");
    sets.push("name = ?"), vals.push(String(b.name).trim());
  }
  if (b.avatar_color !== undefined) (sets.push("avatar_color = ?"), vals.push(b.avatar_color));
  if (b.email !== undefined) (sets.push("email = ?"), vals.push(b.email || null));
  if (b.role !== undefined) {
    const role = cleanRole(b.role);
    if (role !== "admin" && (await otherActiveAdmins(c, id)) === 0) bad("Keep at least one admin");
    sets.push("role = ?"), vals.push(role);
    // An admin can't hold content assignments.
    if (role === "admin") await c.env.DB.prepare("DELETE FROM assignment_rules WHERE profile_id = ?").bind(id).run();
  }
  if (b.active !== undefined) {
    if (!b.active && (await otherActiveAdmins(c, id)) === 0) {
      const me = await c.env.DB.prepare("SELECT role FROM profiles WHERE id = ?").bind(id).first<{ role: Role }>();
      if (me?.role === "admin") bad("Keep at least one admin");
    }
    sets.push("active = ?"), vals.push(b.active ? 1 : 0);
  }
  if (b.pin !== undefined && b.pin !== "") {
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
  const b = await body<{ name: string; char_limit?: number; extra_fields?: unknown[]; color?: string; visible?: boolean }>(c);
  if (!b.name?.trim()) bad("Name is required");
  const key = b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  try {
    const r = await c.env.DB.prepare(
      "INSERT INTO platforms (key, name, char_limit, extra_fields, color, visible, sort) VALUES (?,?,?,?,?,?, (SELECT COALESCE(MAX(sort),0)+1 FROM platforms)) RETURNING id",
    )
      .bind(key, b.name.trim(), optNum(b.char_limit) ?? null, JSON.stringify(b.extra_fields ?? []), b.color || "#64748b", b.visible === false ? 0 : 1)
      .first<{ id: number }>();
    return c.json(r, 201);
  } catch (e) {
    if (String(e).includes("UNIQUE")) bad("A platform with that name already exists", 409);
    throw e;
  }
});

admin.patch("/platforms/:id", async (c) => {
  const id = idParam(c);
  const b = await body<{ name?: string; char_limit?: number | null; extra_fields?: unknown[]; color?: string; visible?: boolean }>(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.name !== undefined) (sets.push("name = ?"), vals.push(b.name));
  if (b.char_limit !== undefined) (sets.push("char_limit = ?"), vals.push(optNum(b.char_limit)));
  if (b.extra_fields !== undefined) (sets.push("extra_fields = ?"), vals.push(JSON.stringify(b.extra_fields)));
  if (b.color !== undefined) (sets.push("color = ?"), vals.push(b.color));
  if (b.visible !== undefined) (sets.push("visible = ?"), vals.push(b.visible ? 1 : 0));
  if (!sets.length) bad("Nothing to update");
  await c.env.DB.prepare(`UPDATE platforms SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  return c.json({ ok: true });
});

type Entry = { id?: number | null; platform_id: number; handle?: string | null; url?: string | null };

/**
 * Save one named account (e.g. "Acme") across many platforms in a single form.
 * Entries with a handle are created or updated; an existing entry with an empty handle is removed.
 */
admin.put("/accounts", async (c) => {
  const b = await body<{ name: string; previous_name?: string | null; timezone?: string; notes?: string; active?: boolean; entries: Entry[] }>(c);
  const name = optStr(b.name, 200)?.trim();
  if (!name) bad("Account name is required");
  if (!Array.isArray(b.entries)) bad("entries must be a list");
  const tz = optStr(b.timezone, 64) || null;
  const notes = optStr(b.notes, 5000) || null;
  const active = b.active === false ? 0 : 1;
  if (name !== b.previous_name) {
    const taken = await c.env.DB.prepare("SELECT 1 FROM accounts WHERE display_name = ? AND deleted_at IS NULL LIMIT 1").bind(name).first();
    if (taken) bad(`An account named "${name}" already exists`, 409);
  }
  const t = now();
  const stmts: D1PreparedStatement[] = [];
  let kept = 0;
  for (const e of b.entries) {
    const handle = optStr(e.handle, 200)?.trim();
    const url = optStr(e.url, 500)?.trim() || null;
    const eid = optNum(e.id);
    if (eid) {
      if (handle) {
        kept++;
        stmts.push(
          c.env.DB.prepare("UPDATE accounts SET handle = ?, url = ?, display_name = ?, timezone = ?, notes = ?, active = ? WHERE id = ? AND deleted_at IS NULL")
            .bind(handle, url, name, tz, notes, active, eid),
        );
      } else {
        stmts.push(c.env.DB.prepare("UPDATE accounts SET deleted_at = ?, active = 0 WHERE id = ?").bind(t, eid));
        stmts.push(c.env.DB.prepare("DELETE FROM assignment_rules WHERE account_id = ?").bind(eid));
      }
    } else if (handle) {
      kept++;
      const pid = optNum(e.platform_id);
      if (!pid) bad("Each entry needs a platform");
      stmts.push(
        c.env.DB.prepare("INSERT INTO accounts (platform_id, handle, display_name, url, timezone, notes, active, created_at) VALUES (?,?,?,?,?,?,?,?)")
          .bind(pid, handle, name, url, tz, notes, active, t),
      );
    }
  }
  if (!kept && !b.previous_name) bad("Fill in at least one platform");
  if (stmts.length) await c.env.DB.batch(stmts);
  await audit(c, "account", 0, "save_group", { name, platforms: kept });
  return c.json({ ok: true, platforms: kept });
});

/** Soft delete every platform account under a name. Past posts keep their history. */
admin.delete("/accounts", async (c) => {
  const name = c.req.query("name");
  if (!name) bad("name is required");
  const { results } = await c.env.DB.prepare("SELECT id FROM accounts WHERE display_name = ? AND deleted_at IS NULL").bind(name).all<{ id: number }>();
  if (results.length) {
    await c.env.DB.batch(
      results.flatMap((r) => [
        c.env.DB.prepare("UPDATE accounts SET deleted_at = ?, active = 0 WHERE id = ?").bind(now(), r.id),
        c.env.DB.prepare("DELETE FROM assignment_rules WHERE account_id = ?").bind(r.id),
      ]),
    );
  }
  await audit(c, "account", 0, "delete_group", { name });
  return c.json({ ok: true });
});

/** Set (or clear with profile_id = null) which member handles an account for a job. */
admin.put("/rules", async (c) => {
  const b = await body<{ account_id: number; role: string; profile_id: number | null }>(c);
  if (!["manager", "creative", "writer"].includes(b.role)) bad("Invalid job");
  const accountId = optNum(b.account_id);
  if (!accountId) bad("Account is required");
  if (b.profile_id == null) {
    await c.env.DB.prepare("DELETE FROM assignment_rules WHERE account_id = ? AND role = ?").bind(accountId, b.role).run();
  } else {
    const p = await c.env.DB.prepare("SELECT role FROM profiles WHERE id = ? AND active = 1").bind(Number(b.profile_id)).first<{ role: Role }>();
    if (p?.role !== "member") bad("Only active members can be assigned");
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

admin.post("/backup", async (c) => c.json({ key: await backup(c.env) }));
