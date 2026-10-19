import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { audit, bad, body, idParam, now, optNum, optStr } from "../util";
import { requireMember } from "../auth";
import { canTransition, MAX_UPLOAD_BYTES, STATUSES, type Status } from "../../shared/rules";

export const posts = new Hono<AppEnv>();
posts.use("*", requireMember);

/** Assignees (writer, creative, manager) must be active members. */
async function assertMembers(c: Context<AppEnv>, ...ids: (number | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is number => typeof x === "number"))];
  if (!list.length) return;
  const { results } = await c.env.DB.prepare(
    `SELECT id FROM profiles WHERE active = 1 AND role = 'member' AND id IN (${list.map(() => "?").join(",")})`,
  )
    .bind(...list)
    .all<{ id: number }>();
  if (results.length !== list.length) bad("Only active members can be assigned");
}

const OPEN = "t.status NOT IN ('posted','cancelled')";
/** Targets a person is on: as writer, creative, poster, or handler of the account. */
const INVOLVES = "(t.manager_id = ? OR p.writer_id = ? OR p.creative_id = ? OR EXISTS (SELECT 1 FROM account_handlers h WHERE h.account_id = t.account_id AND h.profile_id = ?))";

const TARGET_SELECT = `
  SELECT t.*, p.title, p.body, p.writer_id, p.creative_id, p.copy_due, p.media_due, p.template_id,
         a.handle, a.display_name, a.timezone AS account_timezone, a.platform_id,
         pl.name AS platform_name, pl.key AS platform_key, pl.color AS platform_color, pl.char_limit,
         (SELECT COUNT(*) FROM attachments x WHERE x.post_id = p.id) AS attachment_count
    FROM post_targets t
    JOIN posts p ON p.id = t.post_id AND p.deleted_at IS NULL
    JOIN accounts a ON a.id = t.account_id
    JOIN platforms pl ON pl.id = a.platform_id`;

/** Lists targets (one row per post x account) for the calendar, kanban and "my work" views. */
posts.get("/targets", async (c) => {
  const q = c.req.query();
  const me = c.get("profile").id;
  const where: string[] = [];
  const vals: unknown[] = [];
  if (q.unscheduled === "1") where.push("t.scheduled_at IS NULL");
  if (q.from) (where.push("t.scheduled_at >= ?"), vals.push(Number(q.from)));
  if (q.to) (where.push("t.scheduled_at < ?"), vals.push(Number(q.to)));
  if (q.status) {
    const list = q.status.split(",").filter((s) => (STATUSES as readonly string[]).includes(s));
    if (list.length) (where.push(`t.status IN (${list.map(() => "?").join(",")})`), vals.push(...list));
  }
  if (q.account_id) (where.push("t.account_id = ?"), vals.push(Number(q.account_id)));
  if (q.platform_id) (where.push("a.platform_id = ?"), vals.push(Number(q.platform_id)));
  if (q.mine === "1") {
    where.push(`${INVOLVES} AND ${OPEN}`);
    vals.push(me, me, me, me);
  }
  if (q.person) {
    const pid = Number(q.person);
    where.push(INVOLVES);
    vals.push(pid, pid, pid, pid);
  }
  const sql = `${TARGET_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY t.scheduled_at IS NULL, t.scheduled_at, p.id LIMIT 1000`;
  const { results } = await c.env.DB.prepare(sql).bind(...vals).all();
  return c.json(results);
});

posts.get("/dashboard", async (c) => {
  const from = Number(c.req.query("from"));
  const to = Number(c.req.query("to"));
  if (!from || !to) bad("from and to are required");
  const me = c.get("profile").id;
  const t = now();
  const base = "FROM post_targets t JOIN posts p ON p.id = t.post_id AND p.deleted_at IS NULL";
  const [today, overdue, unassigned, mine] = await c.env.DB.batch<{ n: number }>([
    c.env.DB.prepare(`SELECT COUNT(*) n ${base} WHERE t.scheduled_at >= ? AND t.scheduled_at < ? AND t.status != 'cancelled'`).bind(from, to),
    c.env.DB.prepare(`SELECT COUNT(*) n ${base} WHERE t.scheduled_at < ? AND ${OPEN}`).bind(t),
    c.env.DB.prepare(`SELECT COUNT(*) n ${base} WHERE t.manager_id IS NULL AND ${OPEN} AND (t.scheduled_at IS NULL OR t.scheduled_at >= ?)`).bind(t),
    c.env.DB.prepare(`SELECT COUNT(*) n ${base} WHERE ${INVOLVES} AND ${OPEN}`).bind(me, me, me, me),
  ]);
  const n = (r: D1Result<{ n: number }>) => r.results[0]?.n ?? 0;
  return c.json({ today: n(today), overdue: n(overdue), unassigned: n(unassigned), mine: n(mine) });
});

async function loadPost(c: Context<AppEnv>, id: number) {
  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL").bind(id).first<{
    id: number;
    created_by: number | null;
    writer_id: number | null;
    creative_id: number | null;
  }>();
  if (!post) bad("Post not found", 404);
  return post;
}

posts.get("/posts/:id", async (c) => {
  const id = idParam(c);
  const post = await loadPost(c, id);
  const [targets, attachments, comments, tpl] = await c.env.DB.batch([
    c.env.DB.prepare(`${TARGET_SELECT} WHERE t.post_id = ? ORDER BY pl.sort, a.handle`).bind(id),
    c.env.DB.prepare("SELECT * FROM attachments WHERE post_id = ? ORDER BY created_at").bind(id),
    c.env.DB.prepare(
      "SELECT cm.*, pr.name AS author_name, pr.avatar_color AS author_color FROM comments cm LEFT JOIN profiles pr ON pr.id = cm.author_id WHERE post_id = ? ORDER BY created_at",
    ).bind(id),
    c.env.DB.prepare("SELECT t.title FROM templates t JOIN posts p ON p.template_id = t.id WHERE p.id = ?").bind(id),
  ]);
  return c.json({
    ...post,
    targets: targets.results,
    attachments: attachments.results,
    comments: comments.results,
    template_title: (tpl.results[0] as { title?: string } | undefined)?.title ?? null,
  });
});

type TargetInput = {
  account_id: number;
  scheduled_at?: number | null;
  manager_id?: number | null;
  body_override?: string | null;
  extra?: Record<string, string>;
};

/** Active member handlers per account. */
async function handlersFor(c: Context<AppEnv>, accountIds: number[]) {
  const map = new Map<number, number[]>();
  if (!accountIds.length) return map;
  const { results } = await c.env.DB.prepare(
    `SELECT h.account_id, h.profile_id FROM account_handlers h JOIN profiles p ON p.id = h.profile_id
      WHERE p.active = 1 AND p.role = 'member' AND h.account_id IN (${accountIds.map(() => "?").join(",")})`,
  )
    .bind(...accountIds)
    .all<{ account_id: number; profile_id: number }>();
  for (const r of results) map.set(r.account_id, [...(map.get(r.account_id) ?? []), r.profile_id]);
  return map;
}

/** When an account has exactly one handler, they post it by default. */
function targetInsert(c: Context<AppEnv>, postId: number, t: TargetInput, handlers: Map<number, number[]>) {
  const accountId = optNum(t.account_id);
  if (!accountId) bad("Each target needs an account");
  const hs = handlers.get(accountId) ?? [];
  const manager = t.manager_id !== undefined ? optNum(t.manager_id) : hs.length === 1 ? hs[0] : null;
  return c.env.DB.prepare(
    "INSERT INTO post_targets (post_id, account_id, body_override, extra, scheduled_at, manager_id) VALUES (?,?,?,?,?,?)",
  ).bind(
    postId,
    accountId,
    optStr(t.body_override) ?? null,
    JSON.stringify(t.extra ?? {}),
    optNum(t.scheduled_at) ?? null,
    manager ?? null,
  );
}

/** Active templates members can start a post from. Admins edit them under /admin/templates. */
posts.get("/templates", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.title, t.body, t.notes, t.weekdays, t.time, t.timezone, t.writer_id, t.creative_id,
            (SELECT GROUP_CONCAT(account_id) FROM template_accounts WHERE template_id = t.id) AS account_ids
       FROM templates t WHERE t.deleted_at IS NULL AND t.active = 1 ORDER BY t.title`,
  ).all<{ weekdays: string; account_ids: string | null }>();
  return c.json(
    results.map((t) => ({
      ...t,
      weekdays: JSON.parse(t.weekdays || "[]"),
      account_ids: (t.account_ids ?? "").split(",").filter(Boolean).map(Number),
    })),
  );
});

posts.post("/posts", async (c) => {
  const me = c.get("profile");
  const b = await body<{
    title: string;
    body?: string;
    notes?: string;
    writer_id?: number | null;
    creative_id?: number | null;
    copy_due?: number | null;
    media_due?: number | null;
    targets?: TargetInput[];
    template_id?: number | null;
  }>(c);
  const title = optStr(b.title, 300)?.trim();
  const templateId = optNum(b.template_id) ?? null;
  if (templateId) {
    const tpl = await c.env.DB.prepare("SELECT 1 FROM templates WHERE id = ? AND deleted_at IS NULL AND active = 1").bind(templateId).first();
    if (!tpl) bad("That template is no longer available");
  }
  if (!title) bad("Title is required");
  const targets = b.targets ?? [];
  const accountIds = [...new Set(targets.map((t) => Number(t.account_id)))];
  if (accountIds.length !== targets.length) bad("Each account can only be targeted once per post");
  const handlers = await handlersFor(c, accountIds);
  const writer = b.writer_id !== undefined ? optNum(b.writer_id) : me.id;
  const creative = b.creative_id !== undefined ? optNum(b.creative_id) : null;
  await assertMembers(c, writer, creative, ...targets.map((t) => optNum(t.manager_id)));
  const t = now();
  const post = await c.env.DB.prepare(
    `INSERT INTO posts (title, body, notes, created_by, writer_id, creative_id, copy_due, media_due, template_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  )
    .bind(title, optStr(b.body) ?? "", optStr(b.notes) ?? null, me.id, writer ?? null, creative ?? null, optNum(b.copy_due) ?? null, optNum(b.media_due) ?? null, templateId, t, t)
    .first<{ id: number }>();
  if (targets.length) await c.env.DB.batch(targets.map((tg) => targetInsert(c, post!.id, tg, handlers)));
  await audit(c, "post", post!.id, "create", { title, targets: accountIds.length, ...(templateId && { from_template: templateId }) });
  return c.json(post, 201);
});

posts.patch("/posts/:id", async (c) => {
  const id = idParam(c);
  const post = await loadPost(c, id);
  const b = await body<Record<string, unknown>>(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const changes: Record<string, unknown> = {};
  for (const f of ["title", "body", "notes"] as const) {
    const v = optStr(b[f]);
    if (v === undefined) continue;
    if (f === "title" && !v?.trim()) bad("Title is required");
    sets.push(`${f} = ?`), vals.push(v);
  }
  for (const f of ["copy_due", "media_due"] as const) {
    const v = optNum(b[f]);
    if (v === undefined) continue;
    sets.push(`${f} = ?`), vals.push(v), (changes[f] = v);
  }
  for (const f of ["writer_id", "creative_id"] as const) {
    const v = optNum(b[f]);
    if (v === undefined || v === post[f]) continue;
    await assertMembers(c, v);
    sets.push(`${f} = ?`), vals.push(v), (changes[f] = v);
  }
  if (!sets.length) return c.json({ ok: true });
  sets.push("updated_at = ?"), vals.push(now());
  await c.env.DB.prepare(`UPDATE posts SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  await audit(c, "post", id, "update", Object.keys(changes).length ? changes : { fields: Object.keys(b) });
  return c.json({ ok: true });
});

posts.delete("/posts/:id", async (c) => {
  const id = idParam(c);
  await loadPost(c, id);
  await c.env.DB.prepare("UPDATE posts SET deleted_at = ? WHERE id = ?").bind(now(), id).run();
  await audit(c, "post", id, "delete");
  return c.json({ ok: true });
});

posts.post("/posts/:id/duplicate", async (c) => {
  const id = idParam(c);
  const me = c.get("profile");
  await loadPost(c, id);
  const t = now();
  const copy = await c.env.DB.prepare(
    `INSERT INTO posts (title, body, notes, created_by, writer_id, creative_id, created_at, updated_at)
     SELECT title || ' (copy)', body, notes, ?, writer_id, creative_id, ?, ? FROM posts WHERE id = ? RETURNING id`,
  )
    .bind(me.id, t, t, id)
    .first<{ id: number }>();
  await c.env.DB.prepare(
    `INSERT INTO post_targets (post_id, account_id, body_override, extra, manager_id)
     SELECT ?, account_id, body_override, extra, manager_id FROM post_targets WHERE post_id = ?`,
  )
    .bind(copy!.id, id)
    .run();
  await audit(c, "post", copy!.id, "create", { duplicated_from: id });
  return c.json(copy, 201);
});

// ---------- targets ----------

async function loadTarget(c: Context<AppEnv>, id: number) {
  const t = await c.env.DB.prepare(
    "SELECT t.* FROM post_targets t JOIN posts p ON p.id = t.post_id AND p.deleted_at IS NULL WHERE t.id = ?",
  )
    .bind(id)
    .first<{ id: number; post_id: number; account_id: number; status: Status; manager_id: number | null }>();
  if (!t) bad("Target not found", 404);
  return t;
}

posts.post("/posts/:id/targets", async (c) => {
  const id = idParam(c);
  await loadPost(c, id);
  const b = await body<TargetInput>(c);
  await assertMembers(c, optNum(b.manager_id));
  const handlers = await handlersFor(c, [Number(b.account_id)]);
  try {
    await targetInsert(c, id, b, handlers).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) bad("That account is already on this post", 409);
    throw e;
  }
  await audit(c, "post", id, "add_target", { account_id: b.account_id });
  return c.json({ ok: true }, 201);
});

posts.patch("/targets/:id", async (c) => {
  const id = idParam(c);
  const target = await loadTarget(c, id);
  const b = await body<Record<string, unknown>>(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const changes: Record<string, unknown> = { target_id: id };
  const bo = optStr(b.body_override);
  if (bo !== undefined) {
    sets.push("body_override = ?"), vals.push(bo || null);
  }
  if (b.extra !== undefined) {
    sets.push("extra = ?"), vals.push(JSON.stringify(b.extra ?? {}));
  }
  const sched = optNum(b.scheduled_at);
  if (sched !== undefined) {
    sets.push("scheduled_at = ?"), vals.push(sched), (changes.scheduled_at = sched);
  }
  const mgr = optNum(b.manager_id);
  if (mgr !== undefined && mgr !== target.manager_id) {
    await assertMembers(c, mgr);
    sets.push("manager_id = ?"), vals.push(mgr), (changes.manager_id = mgr);
  }
  const url = optStr(b.posted_url, 1000);
  if (url !== undefined) {
    sets.push("posted_url = ?"), vals.push(url || null);
  }
  if (!sets.length) return c.json({ ok: true });
  await c.env.DB.prepare(`UPDATE post_targets SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  await audit(c, "post", target.post_id, "update_target", changes);
  return c.json({ ok: true });
});

posts.delete("/targets/:id", async (c) => {
  const id = idParam(c);
  const target = await loadTarget(c, id);
  await c.env.DB.prepare("DELETE FROM post_targets WHERE id = ?").bind(id).run();
  await audit(c, "post", target.post_id, "remove_target", { account_id: target.account_id });
  return c.json({ ok: true });
});

async function applyStatus(
  c: Context<AppEnv>,
  target: { id: number; post_id: number; status: Status; manager_id: number | null },
  to: Status,
  postedUrl?: string | null,
) {
  const check = canTransition(target.status, to);
  if (!check.ok) return check;
  const postedAt = to === "posted" ? now() : null;
  await c.env.DB.prepare(
    "UPDATE post_targets SET status = ?, posted_at = ?, posted_url = COALESCE(?, CASE WHEN ? = 'posted' THEN posted_url ELSE NULL END) WHERE id = ?",
  )
    .bind(to, postedAt, postedUrl ?? null, to, target.id)
    .run();
  await audit(c, "post", target.post_id, "status", { target_id: target.id, from: target.status, to });
  return check;
}

const parseStatus = (s: unknown): Status => {
  if (!(STATUSES as readonly string[]).includes(String(s))) bad("Unknown status");
  return s as Status;
};

posts.post("/targets/:id/status", async (c) => {
  const id = idParam(c);
  const b = await body<{ status: string; posted_url?: string }>(c);
  const to = parseStatus(b.status);
  const target = await loadTarget(c, id);
  const r = await applyStatus(c, target, to, optStr(b.posted_url, 1000));
  if (!r.ok) bad(r.reason, 409);
  return c.json({ ok: true });
});

/** Moves every target of a post that can legally move. Reports the ones it skipped. */
posts.post("/posts/:id/status", async (c) => {
  const id = idParam(c);
  const to = parseStatus((await body<{ status: string }>(c)).status);
  await loadPost(c, id);
  const { results } = await c.env.DB.prepare("SELECT id, post_id, status, manager_id FROM post_targets WHERE post_id = ? AND status != ?")
    .bind(id, to)
    .all<{ id: number; post_id: number; status: Status; manager_id: number | null }>();
  let moved = 0;
  const skipped: string[] = [];
  for (const t of results) {
    const r = await applyStatus(c, t, to);
    if (r.ok) moved++;
    else skipped.push(r.reason);
  }
  return c.json({ moved, skipped });
});

// ---------- comments ----------

posts.post("/posts/:id/comments", async (c) => {
  const id = idParam(c);
  await loadPost(c, id);
  const text = optStr((await body<{ body: string }>(c)).body, 5000)?.trim();
  if (!text) bad("Comment is empty");
  await c.env.DB.prepare("INSERT INTO comments (post_id, author_id, body, created_at) VALUES (?,?,?,?)")
    .bind(id, c.get("profile").id, text, now())
    .run();
  return c.json({ ok: true }, 201);
});

posts.delete("/comments/:id", async (c) => {
  const id = idParam(c);
  const r = await c.env.DB.prepare("DELETE FROM comments WHERE id = ? AND author_id = ?")
    .bind(id, c.get("profile").id)
    .run();
  if (!r.meta.changes) bad("Not your comment", 403);
  return c.json({ ok: true });
});

// ---------- attachments ----------

const safeName = (s: string) => s.replace(/[^\w.\-]+/g, "_").slice(-120) || "file";

/** Raw-body upload streamed straight into R2. */
posts.put("/posts/:id/attachments", async (c) => {
  const id = idParam(c);
  await loadPost(c, id);
  const len = Number(c.req.header("content-length") ?? 0);
  if (!len) bad("Empty upload or missing Content-Length");
  if (len > MAX_UPLOAD_BYTES) bad(`File too large. Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB; add large videos as a link`, 413);
  const filename = safeName(c.req.query("filename") ?? "file");
  const mime = c.req.header("content-type") || "application/octet-stream";
  const key = `posts/${id}/${crypto.randomUUID()}-${filename}`;
  await c.env.MEDIA.put(key, c.req.raw.body, { httpMetadata: { contentType: mime } });
  const row = await c.env.DB.prepare(
    "INSERT INTO attachments (post_id, kind, r2_key, filename, mime, size, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id",
  )
    .bind(id, "file", key, filename, mime, len, c.get("profile").id, now())
    .first<{ id: number }>();
  await audit(c, "post", id, "attach", { filename });
  return c.json(row, 201);
});

posts.post("/posts/:id/links", async (c) => {
  const id = idParam(c);
  await loadPost(c, id);
  const b = await body<{ url: string; filename?: string }>(c);
  let u: URL;
  try {
    u = new URL(String(b.url));
  } catch {
    bad("Invalid URL");
  }
  if (!["http:", "https:"].includes(u.protocol)) bad("Only http(s) links");
  const name = optStr(b.filename, 200)?.trim() || u.hostname + u.pathname;
  await c.env.DB.prepare(
    "INSERT INTO attachments (post_id, kind, url, filename, uploaded_by, created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, "link", u.toString(), name, c.get("profile").id, now())
    .run();
  await audit(c, "post", id, "attach", { link: u.hostname });
  return c.json({ ok: true }, 201);
});

posts.delete("/attachments/:id", async (c) => {
  const id = idParam(c);
  const a = await c.env.DB.prepare("SELECT * FROM attachments WHERE id = ?").bind(id).first<{ post_id: number; r2_key: string | null; filename: string }>();
  if (!a) bad("Attachment not found", 404);
  if (a.r2_key) await c.env.MEDIA.delete(a.r2_key);
  await c.env.DB.prepare("DELETE FROM attachments WHERE id = ?").bind(id).run();
  await audit(c, "post", a.post_id, "detach", { filename: a.filename });
  return c.json({ ok: true });
});

/** Streams a file from R2, with HTTP range support so videos can seek. */
posts.get("/files/:id", async (c) => {
  const id = idParam(c);
  const a = await c.env.DB.prepare("SELECT r2_key, filename, mime FROM attachments WHERE id = ? AND kind = 'file'")
    .bind(id)
    .first<{ r2_key: string; filename: string; mime: string }>();
  if (!a) bad("File not found", 404);
  const obj = await c.env.MEDIA.get(a.r2_key, { range: c.req.raw.headers });
  if (!obj) bad("File missing from storage", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");
  const dl = c.req.query("download") === "1";
  headers.set("content-disposition", `${dl ? "attachment" : "inline"}; filename="${a.filename}"`);
  const range = obj.range as { offset?: number; length?: number } | undefined;
  if (range && c.req.header("range")) {
    const start = range.offset ?? 0;
    const length = range.length ?? obj.size - start;
    headers.set("content-range", `bytes ${start}-${start + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response((obj as R2ObjectBody).body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response((obj as R2ObjectBody).body, { headers });
});
