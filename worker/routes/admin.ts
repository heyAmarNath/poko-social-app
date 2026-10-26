import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { requireAdmin } from "../auth";
import { audit, bad, body, idParam, now, optNum, optStr } from "../util";
import { isAdmin, ROLES, type Role } from "../../shared/rules";
import type { Account, Brand } from "../../shared/api";
import { handleFromUrl, normalizeUrl } from "../../shared/links";

// ---------------------------------------------------------------------------------------
// Directory: read-only data every signed-in profile needs
// ---------------------------------------------------------------------------------------
export const directory = new Hono<AppEnv>();

/** Everyone, deleted people included (flagged) so finished posts keep their names. */
directory.get("/profiles", async (c) => {
  const admin = isAdmin(c.get("profile"));
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, avatar_color, role, active, deleted_at IS NOT NULL AS deleted${admin ? ", email" : ""} FROM profiles ORDER BY name`,
  ).all();
  return c.json(results);
});

directory.get("/platforms", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, key, name, char_limit, color, visible, sort FROM platforms ORDER BY sort, name").all();
  return c.json(results);
});

/** Every live brand with its platform profiles and their managers. */
async function loadBrands(c: Context<AppEnv>): Promise<Brand[]> {
  const [brands, accounts] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id, name, timezone, notes, active FROM brands WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE"),
    c.env.DB.prepare(
      `SELECT a.id, a.brand_id, a.platform_id, a.url, a.handle, a.manager_id,
              p.key AS platform_key, p.name AS platform_name, p.color AS platform_color, p.visible AS platform_visible
         FROM accounts a JOIN platforms p ON p.id = a.platform_id
        WHERE a.deleted_at IS NULL ORDER BY p.sort, p.name`,
    ),
  ]);
  const byBrand = new Map<number, Account[]>();
  for (const a of accounts.results as Account[]) byBrand.set(a.brand_id, [...(byBrand.get(a.brand_id) ?? []), a]);
  return (brands.results as Omit<Brand, "accounts">[]).map((b) => ({ ...b, accounts: byBrand.get(b.id) ?? [] }));
}

directory.get("/brands", async (c) => c.json(await loadBrands(c)));

// ---------------------------------------------------------------------------------------
// Admin-only
// ---------------------------------------------------------------------------------------
export const admin = new Hono<AppEnv>();
admin.use("*", requireAdmin);

const cleanRole = (v: unknown): Role => {
  if (!ROLES.includes(v as Role)) bad("Role must be admin or member");
  return v as Role;
};

/** Colours are stored as #rrggbb and used in inline styles, so nothing else gets in. */
const cleanColor = (v: unknown) => {
  if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) bad("Colour must look like #1a2b3c");
  return v;
};

/** A required name, trimmed. */
const cleanName = (v: unknown, max: number) => {
  const name = optStr(v, max)?.trim();
  if (!name) bad("Name is required");
  return name;
};

/** The Google account email a person signs in with, lowercased. */
const cleanEmail = (v: unknown) => {
  const email = optStr(v, 200)?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad("Enter the Google email they sign in with");
  return email;
};

/** Emails are unique (ignoring case); turn a duplicate into a clear message. */
function rethrowEmailTaken(e: unknown, email: string): never {
  if (String(e).includes("UNIQUE")) bad(`${email} already has a profile. Edit that one instead (it may be inactive).`, 409);
  throw e;
}

/** A platform's character limit: a whole number from 1, or null for none. */
const cleanLimit = (v: unknown) => {
  const n = optNum(v) ?? null;
  if (n !== null && (!Number.isInteger(n) || n < 1 || n > 1_000_000)) bad("Character limit must be a whole number from 1");
  return n;
};

async function otherActiveAdmins(c: Context<AppEnv>, excludeId: number) {
  const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM profiles WHERE active = 1 AND role = 'admin' AND id != ?")
    .bind(excludeId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/** Add a person. They can sign in with Google as soon as they're added. */
admin.post("/profiles", async (c) => {
  const b = await body<{ name: string; email: string; avatar_color?: string; role?: Role }>(c);
  const name = cleanName(b.name, 100);
  const email = cleanEmail(b.email);
  let row: { id: number } | null = null;
  try {
    row = await c.env.DB.prepare("INSERT INTO profiles (name, email, avatar_color, role, created_at) VALUES (?,?,?,?,?) RETURNING id")
      .bind(name, email, cleanColor(b.avatar_color ?? "#6366f1"), cleanRole(b.role ?? "member"), now())
      .first<{ id: number }>();
  } catch (e) {
    rethrowEmailTaken(e, email);
  }
  await audit(c, "profile", row!.id, "create", { name, email });
  return c.json(row, 201);
});

/** Edit a person. A new role, email or status signs out their sessions. */
admin.patch("/profiles/:id", async (c) => {
  const id = idParam(c);
  const b = await body<{ name?: string; email?: string; avatar_color?: string; role?: Role; active?: boolean }>(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(val);
  };
  const current = await c.env.DB.prepare("SELECT email, role, active FROM profiles WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ email: string; role: Role; active: number }>();
  if (!current) bad("Person not found", 404);
  const email = b.email === undefined ? current.email : cleanEmail(b.email);
  const role = b.role === undefined ? current.role : cleanRole(b.role);
  const active = b.active === undefined ? !!current.active : !!b.active;
  // Someone has to be able to manage people.
  if (current.role === "admin" && current.active && (role !== "admin" || !active) && (await otherActiveAdmins(c, id)) === 0) bad("Keep at least one admin");
  if (b.name !== undefined) set("name", cleanName(b.name, 100));
  if (b.avatar_color !== undefined) set("avatar_color", cleanColor(b.avatar_color));
  if (email !== current.email) set("email", email);
  if (role !== current.role) set("role", role);
  if (active !== !!current.active) set("active", active ? 1 : 0);
  if (!sets.length) return c.json({ ok: true });
  if (email !== current.email || role !== current.role || active !== !!current.active) sets.push("session_version = session_version + 1");
  try {
    await c.env.DB.prepare(`UPDATE profiles SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  } catch (e) {
    rethrowEmailTaken(e, email);
  }
  await audit(c, "profile", id, "update", b);
  return c.json({ ok: true });
});

/**
 * Delete a person. They're signed out and hidden everywhere, and taken off open work and the accounts
 * they manage so it can be handed to someone else. Finished posts keep their name. Their email is
 * freed, so they can be added again later.
 */
admin.delete("/profiles/:id", async (c) => {
  const id = idParam(c);
  // Whoever deletes is an active admin and can't delete themselves, so an active admin always remains.
  if (id === c.get("profile").id) bad("You can't delete yourself");
  const p = await c.env.DB.prepare("SELECT name FROM profiles WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ name: string }>();
  if (!p) bad("Person not found", 404);
  const open = "status <> 'completed'";
  await c.env.DB.batch([
    // Anyone editing one of their open posts has to reload before saving, instead of putting them back.
    c.env.DB.prepare(`UPDATE posts SET version = version + 1 WHERE id IN (SELECT post_id FROM post_versions WHERE ${open} AND ?1 IN (writer_id, creative_id, poster_id))`).bind(id),
    c.env.DB.prepare(`UPDATE post_versions SET writer_id = NULL WHERE writer_id = ? AND ${open}`).bind(id),
    c.env.DB.prepare(`UPDATE post_versions SET creative_id = NULL WHERE creative_id = ? AND ${open}`).bind(id),
    c.env.DB.prepare(`UPDATE post_versions SET poster_id = NULL WHERE poster_id = ? AND ${open}`).bind(id),
    c.env.DB.prepare("UPDATE accounts SET manager_id = NULL WHERE manager_id = ?").bind(id),
    c.env.DB.prepare("UPDATE profiles SET deleted_at = ?, active = 0, session_version = session_version + 1 WHERE id = ?").bind(now(), id),
  ]);
  await audit(c, "profile", id, "delete", { name: p.name });
  return c.json({ ok: true });
});

admin.post("/platforms", async (c) => {
  const b = await body<{ name: string; char_limit?: number; color?: string; visible?: boolean }>(c);
  const name = cleanName(b.name, 50);
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  try {
    const r = await c.env.DB.prepare(
      "INSERT INTO platforms (key, name, char_limit, color, visible, sort) VALUES (?,?,?,?,?, (SELECT COALESCE(MAX(sort),0)+1 FROM platforms)) RETURNING id",
    )
      .bind(key, name, cleanLimit(b.char_limit), cleanColor(b.color ?? "#64748b"), b.visible === false ? 0 : 1)
      .first<{ id: number }>();
    return c.json(r, 201);
  } catch (e) {
    if (String(e).includes("UNIQUE")) bad("A platform with that name already exists", 409);
    throw e;
  }
});

admin.patch("/platforms/:id", async (c) => {
  const id = idParam(c);
  const b = await body<{ name?: string; char_limit?: number | null; color?: string; visible?: boolean }>(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(val);
  };
  if (b.name !== undefined) set("name", cleanName(b.name, 50));
  if (b.char_limit !== undefined) set("char_limit", cleanLimit(b.char_limit));
  if (b.color !== undefined) set("color", cleanColor(b.color));
  if (b.visible !== undefined) set("visible", b.visible ? 1 : 0);
  if (!sets.length) bad("Nothing to update");
  await c.env.DB.prepare(`UPDATE platforms SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  return c.json({ ok: true });
});

// ----- brands (accounts) -----

/**
 * One platform profile in the account form: its profile link (the handle shown around the app is
 * worked out from it) and `manager_id`, the member who posts to it by default (null for none; omit
 * to leave unchanged). An existing `id` sent without a link is removed.
 */
type Entry = { id?: number | null; platform_id: number; url?: string | null; manager_id?: number | null };
type BrandInput = { name: string; timezone?: string | null; notes?: string | null; active?: boolean; entries: Entry[] };

async function assertActivePeople(c: Context<AppEnv>, ids: number[]) {
  if (!ids.length) return;
  const { results } = await c.env.DB.prepare("SELECT id FROM profiles WHERE active = 1 AND id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids))
    .all();
  if (results.length !== ids.length) bad("Only active people can manage accounts");
}

/**
 * Builds every statement for saving a brand's platform profiles, so the whole save runs as one
 * transaction. `brandRef` is SQL that yields the brand id inside that transaction.
 */
async function brandStatements(c: Context<AppEnv>, b: BrandInput, brandRef: { sql: string; binds: unknown[] }) {
  if (!Array.isArray(b.entries)) bad("entries must be a list");
  const { results: plats } = await c.env.DB.prepare("SELECT id, key, name FROM platforms").all<{ id: number; key: string; name: string }>();
  const platformById = new Map(plats.map((p) => [p.id, p]));
  await assertActivePeople(c, [...new Set(b.entries.map((e) => optNum(e.manager_id)).filter((m): m is number => !!m))]);
  const t = now();
  const stmts: D1PreparedStatement[] = [];
  let kept = 0;
  for (const e of b.entries) {
    const manager = optNum(e.manager_id);
    const eid = optNum(e.id);
    const platform = platformById.get(Number(e.platform_id));
    const rawUrl = optStr(e.url, 500)?.trim() || "";
    const url = normalizeUrl(rawUrl);
    if (rawUrl && !url) bad(`${platform?.name ?? "That"} link isn't a valid web address`);
    if (!platform && (url || !eid)) bad("Each platform entry needs a platform");
    if (!url) {
      if (eid) stmts.push(c.env.DB.prepare(`UPDATE accounts SET deleted_at = ? WHERE id = ? AND brand_id = ${brandRef.sql}`).bind(t, eid, ...brandRef.binds));
      continue;
    }
    kept++;
    const handle = handleFromUrl(platform!.key, url).slice(0, 200);
    if (eid) {
      const setManager = manager === undefined ? "" : ", manager_id = ?";
      stmts.push(
        c.env.DB.prepare(`UPDATE accounts SET url = ?, handle = ?${setManager} WHERE id = ? AND deleted_at IS NULL AND brand_id = ${brandRef.sql}`)
          .bind(url, handle, ...(manager === undefined ? [] : [manager]), eid, ...brandRef.binds),
      );
    } else {
      stmts.push(
        c.env.DB.prepare(`INSERT INTO accounts (brand_id, platform_id, url, handle, manager_id, created_at) VALUES (${brandRef.sql}, ?, ?, ?, ?, ?)`)
          .bind(...brandRef.binds, platform!.id, url, handle, manager ?? null, t),
      );
    }
  }
  return { stmts, kept };
}

function brandFields(b: BrandInput) {
  const name = optStr(b.name, 200)?.trim();
  if (!name) bad("Account name is required");
  return { name, timezone: optStr(b.timezone, 64) || null, notes: optStr(b.notes, 5000) || null, active: b.active === false ? 0 : 1 };
}

/** The unique index on live brand names makes a duplicate fail; turn that into a clear message. */
function rethrowNameTaken(e: unknown, name: string): never {
  if (String(e).includes("UNIQUE")) bad(`An account named "${name}" already exists`, 409);
  throw e;
}

admin.post("/brands", async (c) => {
  const b = await body<BrandInput>(c);
  const f = brandFields(b);
  // The brand and its profiles go in one transaction; the new brand is the highest id inside it.
  const { stmts, kept } = await brandStatements(c, b, { sql: "(SELECT MAX(id) FROM brands)", binds: [] });
  if (!kept) bad("Add at least one profile link");
  let id = 0;
  try {
    const [created] = await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO brands (name, timezone, notes, active, created_at) VALUES (?,?,?,?,?) RETURNING id")
        .bind(f.name, f.timezone, f.notes, f.active, now()),
      ...stmts,
    ]);
    id = (created.results[0] as { id: number }).id;
  } catch (e) {
    rethrowNameTaken(e, f.name);
  }
  await audit(c, "brand", id, "create", { name: f.name, platforms: kept });
  return c.json({ ok: true, id, platforms: kept }, 201);
});

admin.put("/brands/:id", async (c) => {
  const id = idParam(c);
  const b = await body<BrandInput>(c);
  const f = brandFields(b);
  if (!(await c.env.DB.prepare("SELECT 1 FROM brands WHERE id = ? AND deleted_at IS NULL").bind(id).first())) bad("Account not found", 404);
  const { stmts, kept } = await brandStatements(c, b, { sql: "?", binds: [id] });
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE brands SET name = ?, timezone = ?, notes = ?, active = ? WHERE id = ?")
        .bind(f.name, f.timezone, f.notes, f.active, id),
      ...stmts,
    ]);
  } catch (e) {
    rethrowNameTaken(e, f.name);
  }
  await audit(c, "brand", id, "update", { name: f.name, platforms: kept });
  return c.json({ ok: true, platforms: kept });
});

/** Soft delete a brand and its profiles. Past posts stay. */
admin.delete("/brands/:id", async (c) => {
  const id = idParam(c);
  if (!(await c.env.DB.prepare("SELECT 1 FROM brands WHERE id = ? AND deleted_at IS NULL").bind(id).first())) bad("Account not found", 404);
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE accounts SET deleted_at = ? WHERE brand_id = ? AND deleted_at IS NULL").bind(t, id),
    c.env.DB.prepare("UPDATE brands SET deleted_at = ? WHERE id = ?").bind(t, id),
  ]);
  await audit(c, "brand", id, "delete");
  return c.json({ ok: true });
});
