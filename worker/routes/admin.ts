import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { hashPin, isValidPin, requireAdmin } from "../auth";
import { audit, bad, body, idParam, now, optNum, optStr } from "../util";
import { isAdmin, ROLES, type Role } from "../../shared/rules";
import { backup } from "../backup";
import { handleFromUrl, normalizeUrl } from "../../shared/links";

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

const AVATAR_KEY = /^avatars\/[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/;

/** Account profile pictures, readable by any signed-in profile. */
directory.get("/avatars/:file", async (c) => {
  const key = `avatars/${c.req.param("file")}`;
  if (!AVATAR_KEY.test(key)) bad("Not found", 404);
  const obj = await c.env.MEDIA.get(key);
  if (!obj) bad("Not found", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("cache-control", "private, max-age=86400, immutable");
  return new Response(obj.body, { headers });
});

directory.get("/handlers", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT account_id, profile_id FROM account_handlers").all();
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
    // An admin can't handle accounts.
    if (role === "admin") await c.env.DB.prepare("DELETE FROM account_handlers WHERE profile_id = ?").bind(id).run();
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

const AVATAR_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const AVATAR_MAX = 2 * 1024 * 1024;

/** Upload an account profile picture. Returns the key to save on the account. */
admin.put("/account-avatar", async (c) => {
  const mime = (c.req.header("content-type") ?? "").split(";")[0].trim();
  const ext = AVATAR_TYPES[mime];
  if (!ext) bad("Use a PNG, JPG, WebP or GIF image");
  const len = Number(c.req.header("content-length") ?? 0);
  if (!len) bad("Empty upload");
  if (len > AVATAR_MAX) bad("Profile pictures can be up to 2 MB", 413);
  const key = `avatars/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA.put(key, c.req.raw.body, { httpMetadata: { contentType: mime } });
  return c.json({ key }, 201);
});

/** Delete a stored picture once no account uses it. */
async function dropAvatarIfUnused(c: Context<AppEnv>, key: string | null | undefined) {
  if (!key) return;
  const used = await c.env.DB.prepare("SELECT 1 FROM accounts WHERE avatar_key = ? AND deleted_at IS NULL LIMIT 1").bind(key).first();
  if (!used) await c.env.MEDIA.delete(key);
}

/**
 * One platform of an account. The profile link is what admins enter; the handle shown around
 * the app is worked out from it. `handle` alone is accepted only to keep an older entry that has
 * no link. manager_ids: members who manage it (omit to leave unchanged).
 */
type Entry = { id?: number | null; platform_id: number; handle?: string | null; url?: string | null; manager_ids?: number[] };

/** Throws unless every id is an active member. */
async function assertActiveMembers(c: Context<AppEnv>, ids: number[]) {
  if (!ids.length) return;
  const { results } = await c.env.DB.prepare(
    `SELECT id FROM profiles WHERE active = 1 AND role = 'member' AND id IN (${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all();
  if (results.length !== ids.length) bad("Only active members can manage accounts");
}

/**
 * Save one named account (e.g. "Acme") across many platforms in a single form.
 * Entries with a handle are created or updated; an existing entry with an empty handle is removed.
 */
admin.put("/accounts", async (c) => {
  const b = await body<{ name: string; previous_name?: string | null; timezone?: string; notes?: string; active?: boolean; avatar_key?: string | null; entries: Entry[] }>(c);
  const name = optStr(b.name, 200)?.trim();
  if (!name) bad("Account name is required");
  if (!Array.isArray(b.entries)) bad("entries must be a list");
  const tz = optStr(b.timezone, 64) || null;
  const notes = optStr(b.notes, 5000) || null;
  const active = b.active === false ? 0 : 1;
  const avatar = b.avatar_key || null;
  if (avatar && !AVATAR_KEY.test(avatar)) bad("Invalid picture");
  const oldAvatar = b.previous_name
    ? (await c.env.DB.prepare("SELECT avatar_key FROM accounts WHERE display_name = ? AND deleted_at IS NULL AND avatar_key IS NOT NULL LIMIT 1").bind(b.previous_name).first<{ avatar_key: string }>())?.avatar_key
    : null;
  if (name !== b.previous_name) {
    const taken = await c.env.DB.prepare("SELECT 1 FROM accounts WHERE display_name = ? AND deleted_at IS NULL LIMIT 1").bind(name).first();
    if (taken) bad(`An account named "${name}" already exists`, 409);
  }
  const { results: plats } = await c.env.DB.prepare("SELECT id, key, name FROM platforms").all<{ id: number; key: string; name: string }>();
  const platformById = new Map(plats.map((p) => [p.id, p]));
  const managersOf = (e: Entry) => (Array.isArray(e.manager_ids) ? [...new Set(e.manager_ids.map(Number))].filter((n) => n > 0) : undefined);
  await assertActiveMembers(c, [...new Set(b.entries.flatMap((e) => managersOf(e) ?? []))]);
  const t = now();
  // One batch = one transaction: accounts and their managers save together or not at all.
  const stmts: D1PreparedStatement[] = [];
  let kept = 0;
  for (const e of b.entries) {
    const managers = managersOf(e);
    const eid = optNum(e.id);
    const platform = platformById.get(Number(e.platform_id));
    const rawUrl = optStr(e.url, 500)?.trim() || "";
    const url = normalizeUrl(rawUrl);
    if (rawUrl && !url) bad(`${platform?.name ?? "That"} link isn't a valid web address`);
    if (url && !platform) bad("Each entry needs a platform");
    const handle = url ? handleFromUrl(platform!.key, url).slice(0, 200) : optStr(e.handle, 200)?.trim();
    if (eid) {
      if (handle) {
        kept++;
        stmts.push(
          c.env.DB.prepare("UPDATE accounts SET handle = ?, url = ?, display_name = ?, timezone = ?, notes = ?, active = ?, avatar_key = ? WHERE id = ? AND deleted_at IS NULL")
            .bind(handle, url, name, tz, notes, active, avatar, eid),
        );
        if (managers) {
          stmts.push(c.env.DB.prepare("DELETE FROM account_handlers WHERE account_id = ?").bind(eid));
          for (const m of managers) stmts.push(c.env.DB.prepare("INSERT INTO account_handlers (account_id, profile_id) VALUES (?, ?)").bind(eid, m));
        }
      } else {
        stmts.push(c.env.DB.prepare("UPDATE accounts SET deleted_at = ?, active = 0 WHERE id = ?").bind(t, eid));
        stmts.push(c.env.DB.prepare("DELETE FROM account_handlers WHERE account_id = ?").bind(eid));
      }
    } else if (handle) {
      kept++;
      const pid = optNum(e.platform_id);
      if (!pid) bad("Each entry needs a platform");
      stmts.push(
        c.env.DB.prepare("INSERT INTO accounts (platform_id, handle, display_name, url, timezone, notes, active, avatar_key, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(pid, handle, name, url, tz, notes, active, avatar, t),
      );
      // Inside the transaction the row just inserted has the highest id.
      for (const m of managers ?? [])
        stmts.push(c.env.DB.prepare("INSERT INTO account_handlers (account_id, profile_id) VALUES ((SELECT MAX(id) FROM accounts), ?)").bind(m));
    }
  }
  if (!kept && !b.previous_name) bad("Fill in at least one platform");
  if (stmts.length) await c.env.DB.batch(stmts);
  if (oldAvatar && oldAvatar !== avatar) await dropAvatarIfUnused(c, oldAvatar);
  await audit(c, "account", 0, "save_group", { name, platforms: kept });
  return c.json({ ok: true, platforms: kept });
});

/** Soft delete every platform account under a name. Past posts stay. */
admin.delete("/accounts", async (c) => {
  const name = c.req.query("name");
  if (!name) bad("name is required");
  const { results } = await c.env.DB.prepare("SELECT id, avatar_key FROM accounts WHERE display_name = ? AND deleted_at IS NULL").bind(name).all<{ id: number; avatar_key: string | null }>();
  if (results.length) {
    await c.env.DB.batch(
      results.flatMap((r) => [
        c.env.DB.prepare("UPDATE accounts SET deleted_at = ?, active = 0 WHERE id = ?").bind(now(), r.id),
        c.env.DB.prepare("DELETE FROM account_handlers WHERE account_id = ?").bind(r.id),
      ]),
    );
  }
  await dropAvatarIfUnused(c, results.find((r) => r.avatar_key)?.avatar_key);
  await audit(c, "account", 0, "delete_group", { name });
  return c.json({ ok: true });
});

admin.post("/backup", async (c) => c.json({ key: await backup(c.env) }));
