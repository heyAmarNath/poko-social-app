import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { audit, bad, body, idParam, now, optNum, optStr } from "../util";
import { MAX_MEDIA_LINKS, STATUSES, type Status } from "../../shared/rules";
import type { Comment, Dashboard, MediaLink, PostDetail, PostSummary, PostVersion } from "../../shared/api";

/** Content routes: anyone signed in, admins included. */
export const posts = new Hono<AppEnv>();

/** My work tabs, and which of a version's people each one follows. */
const MINE = {
  all: "(v.writer_id = ? OR v.creative_id = ? OR v.poster_id = ?)",
  content: "v.writer_id = ?", media: "v.creative_id = ?", post: "v.poster_id = ?",
} as const;

/** Versions on live accounts of live brands (removed accounts drop off posts). `where` filters `v`. */
const liveVersions = (where: string) =>
  `SELECT 1 FROM post_versions v
     JOIN accounts a ON a.id = v.account_id AND a.deleted_at IS NULL
     JOIN brands b ON b.id = a.brand_id AND b.deleted_at IS NULL
    WHERE ${where}`;

/**
 * Sets a post's status from its versions: completed when all are, working once any has started,
 * not ready otherwise. A post without versions keeps its status. `postId` is SQL, so it works inside a batch.
 */
const statusFromVersions = (c: Context<AppEnv>, postId: string, ...binds: unknown[]) =>
  c.env.DB.prepare(
    `UPDATE posts SET status = CASE
       WHEN NOT EXISTS (${liveVersions("v.post_id = posts.id")}) THEN status
       WHEN NOT EXISTS (${liveVersions("v.post_id = posts.id AND v.status <> 'completed'")}) THEN 'completed'
       WHEN EXISTS (${liveVersions("v.post_id = posts.id AND v.status <> 'not_ready'")}) THEN 'working'
       ELSE 'not_ready' END
     WHERE id = ${postId}`,
  ).bind(...binds);

const SUMMARY_COLS = `p.id, p.title, p.status, p.scheduled_at, p.topic_id, p.created_by,
  (SELECT COUNT(*) FROM comments m WHERE m.post_id = p.id) AS comment_count`;

/** The versions of many posts at once (one query; ids passed as JSON to avoid D1's 100-parameter limit). */
async function versionsFor(c: Context<AppEnv>, postIds: number[]) {
  const map = new Map<number, PostVersion[]>();
  if (!postIds.length) return map;
  const { results } = await c.env.DB.prepare(
    `SELECT v.post_id, a.id AS account_id, a.handle, b.name AS brand_name,
            pl.key AS platform_key, pl.name AS platform_name, pl.color AS platform_color, pl.char_limit,
            v.body, v.media, v.writer_id, v.creative_id, v.poster_id, v.scheduled_at, v.status, v.posted_url
       FROM post_versions v
       JOIN accounts a ON a.id = v.account_id
       JOIN brands b ON b.id = a.brand_id
       JOIN platforms pl ON pl.id = a.platform_id
      WHERE v.post_id IN (SELECT value FROM json_each(?))
        AND a.deleted_at IS NULL AND b.deleted_at IS NULL -- removed accounts drop off posts
      ORDER BY b.name COLLATE NOCASE, pl.sort`,
  )
    .bind(JSON.stringify(postIds))
    .all<Omit<PostVersion, "media"> & { post_id: number; media: string }>();
  for (const { post_id, media, ...v } of results) map.set(post_id, [...(map.get(post_id) ?? []), { ...v, media: JSON.parse(media) as MediaLink[] }]);
  return map;
}

/**
 * Lists posts. Filters, all optional:
 * - `status=open|completed`
 * - `topic=<id>`, or `topic=none` for posts without one
 * - `from` + `to`: planned in this time range (epoch ms), the post or any of its versions, for Today and Day
 * - `mine=all|content|media|post`: the signed-in person writes, makes media for, or posts (all: any of these) one of its open versions
 * Completed lists come newest first; everything else soonest first, with undated posts last.
 */
posts.get("/posts", async (c) => {
  const q = c.req.query();
  const where = ["p.deleted_at IS NULL"];
  const vals: unknown[] = [];
  const add = (sql: string, v: unknown) => (where.push(sql), vals.push(v));
  if (q.status && !["open", "completed"].includes(q.status)) bad("status must be open or completed");
  if (q.status === "open") where.push("p.status <> 'completed'");
  if (q.status === "completed") where.push("p.status = 'completed'");
  if (q.topic === "none") where.push("p.topic_id IS NULL");
  else if (q.topic) add("p.topic_id = ?", Number(q.topic));
  if (q.from || q.to) {
    const [from, to] = [Number(q.from) || 0, Number(q.to) || Number.MAX_SAFE_INTEGER];
    where.push("((p.scheduled_at >= ? AND p.scheduled_at < ?) OR EXISTS (SELECT 1 FROM post_versions v WHERE v.post_id = p.id AND v.scheduled_at >= ? AND v.scheduled_at < ?))");
    vals.push(from, to, from, to);
  }
  if (q.mine) {
    if (!Object.hasOwn(MINE, q.mine)) bad("mine must be all, content, media or post");
    const who = MINE[q.mine as keyof typeof MINE];
    where.push(`EXISTS (${liveVersions(`v.post_id = p.id AND ${who} AND v.status <> 'completed'`)})`);
    vals.push(...Array<number>(who.split("?").length - 1).fill(c.get("profile").id));
  }
  const order = q.status === "completed" ? "p.scheduled_at IS NULL, p.scheduled_at DESC, p.id DESC" : "p.scheduled_at IS NULL, p.scheduled_at, p.id";
  const { results } = await c.env.DB.prepare(`SELECT ${SUMMARY_COLS} FROM posts p WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 300`)
    .bind(...vals)
    .all<Omit<PostSummary, "versions">>();
  const versions = await versionsFor(c, results.map((r) => r.id));
  return c.json<PostSummary[]>(results.map((r) => ({ ...r, versions: versions.get(r.id) ?? [] })));
});

/** How many open versions on live posts and accounts match `who`. */
const countOpenVersions = (who: string) =>
  `SELECT COUNT(*) FROM post_versions v
     JOIN posts p ON p.id = v.post_id AND p.deleted_at IS NULL
     JOIN accounts a ON a.id = v.account_id AND a.deleted_at IS NULL
     JOIN brands b ON b.id = a.brand_id AND b.deleted_at IS NULL
    WHERE v.status <> 'completed' AND ${who}`;

/**
 * Sidebar counts: open posts planned between `from` and `to` (today; the post or one of its open
 * versions), and my open versions: all of them, and by job.
 */
posts.get("/dashboard", async (c) => {
  const from = Number(c.req.query("from"));
  const to = Number(c.req.query("to"));
  if (!from || !to) bad("from and to are required");
  const r = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM posts p WHERE p.deleted_at IS NULL AND p.status <> 'completed' AND ((p.scheduled_at >= ?2 AND p.scheduled_at < ?3)
          OR EXISTS (SELECT 1 FROM post_versions v WHERE v.post_id = p.id AND v.status <> 'completed' AND v.scheduled_at >= ?2 AND v.scheduled_at < ?3))) AS today,
       (${countOpenVersions("(v.writer_id = ?1 OR v.creative_id = ?1 OR v.poster_id = ?1)")}) AS "all",
       (${countOpenVersions("v.writer_id = ?1")}) AS content,
       (${countOpenVersions("v.creative_id = ?1")}) AS media,
       (${countOpenVersions("v.poster_id = ?1")}) AS post`,
  )
    .bind(c.get("profile").id, from, to)
    .first<Dashboard>();
  return c.json<Dashboard>(r ?? { today: 0, all: 0, content: 0, media: 0, post: 0 });
});

async function loadPost(c: Context<AppEnv>, id: number) {
  const post = await c.env.DB.prepare("SELECT id, version FROM posts WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ id: number; version: number }>();
  if (!post) bad("Post not found", 404);
  return post;
}

posts.get("/posts/:id", async (c) => {
  const id = idParam(c);
  const [post, comments] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT ${SUMMARY_COLS}, p.notes, p.version, p.created_at, p.updated_at FROM posts p WHERE p.id = ? AND p.deleted_at IS NULL`).bind(id),
    c.env.DB.prepare(
      `SELECT cm.id, cm.author_id, cm.body, cm.created_at, pr.name AS author_name, pr.avatar_color AS author_color
         FROM comments cm LEFT JOIN profiles pr ON pr.id = cm.author_id WHERE cm.post_id = ? ORDER BY cm.created_at`,
    ).bind(id),
  ]);
  const row = post.results[0] as Omit<PostDetail, "versions" | "comments"> | undefined;
  if (!row) bad("Post not found", 404);
  const versions = await versionsFor(c, [id]);
  return c.json<PostDetail>({ ...row, versions: versions.get(id) ?? [], comments: comments.results as Comment[] });
});

/** Who posts to each of these accounts by default: its manager, while they're active. */
async function defaultPosters(c: Context<AppEnv>, accountIds: number[]) {
  if (!accountIds.length) return new Map<number, number | null>();
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.manager_id FROM accounts a JOIN profiles pr ON pr.id = a.manager_id AND pr.active = 1
      WHERE a.id IN (SELECT value FROM json_each(?))`,
  )
    .bind(JSON.stringify(accountIds))
    .all<{ id: number; manager_id: number }>();
  return new Map(results.map((a) => [a.id, a.manager_id]));
}

/** Assignees must be active people (admins included). */
async function assertActivePeople(c: Context<AppEnv>, ...ids: (number | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is number => typeof x === "number"))];
  if (!list.length) return;
  const { results } = await c.env.DB.prepare("SELECT id FROM profiles WHERE active = 1 AND id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(list))
    .all();
  if (results.length !== list.length) bad("Only active people can be assigned");
}

/** Account ids must be live accounts of active brands. */
async function cleanAccountIds(c: Context<AppEnv>, raw: unknown) {
  if (!Array.isArray(raw)) bad("account_ids must be a list");
  const ids = [...new Set(raw.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return ids;
  const { results } = await c.env.DB.prepare(
    `SELECT a.id FROM accounts a JOIN brands b ON b.id = a.brand_id
      WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.id IN (SELECT value FROM json_each(?))`,
  )
    .bind(JSON.stringify(ids))
    .all();
  if (results.length !== ids.length) bad("An account no longer exists");
  return ids;
}

/** A live topic id, or null for none. */
async function cleanTopicId(c: Context<AppEnv>, raw: unknown) {
  const id = optNum(raw) ?? null;
  if (id === null) return null;
  const t = await c.env.DB.prepare("SELECT 1 FROM topics WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!t) bad("That topic no longer exists");
  return id;
}

const parseStatus = (s: unknown): Status => {
  if (!(STATUSES as readonly string[]).includes(String(s))) bad("Unknown status");
  return s as Status;
};

/** One version. Fields left out keep their saved value (or the default, for a new one). */
type VersionInput = {
  account_id: number; body?: string; media?: unknown;
  writer_id?: number | null; creative_id?: number | null; poster_id?: number | null;
  scheduled_at?: number | null; posted_url?: string | null;
  /** only for a new version; a saved version's status changes through its status route */
  status?: string;
};

type PostInput = {
  title?: string; notes?: string | null; scheduled_at?: number | null; topic_id?: number | null; version?: number;
  /** the versions with their details; or just `account_ids`, which take the defaults */
  versions?: VersionInput[]; account_ids?: number[];
};

function postFields(b: PostInput) {
  const title = optStr(b.title, 300)?.trim();
  if (!title) bad("Give the post a title");
  return {
    title,
    notes: optStr(b.notes, 5000)?.trim() || null,
    scheduled_at: optNum(b.scheduled_at) ?? null,
  };
}

/** A web address, null when blank, undefined when left out. */
function cleanUrl(v: unknown, message: string) {
  const s = optStr(v, 2000)?.trim();
  if (s === undefined) return undefined;
  if (!s) return null;
  try {
    const u = new URL(s);
    if (["http:", "https:"].includes(u.protocol)) return u.toString();
  } catch {
    // fall through
  }
  bad(message);
}

/** A version's media links as stored JSON. Rows without a link are dropped. */
function cleanMedia(v: unknown) {
  if (v === undefined) return undefined;
  if (v === null) return "[]";
  if (!Array.isArray(v)) bad("media must be a list");
  if (v.length > MAX_MEDIA_LINKS) bad(`At most ${MAX_MEDIA_LINKS} media links per version`);
  const links: MediaLink[] = [];
  for (const m of v as { url?: unknown; label?: unknown }[]) {
    const url = cleanUrl(m?.url ?? "", "A media link must be a web address");
    if (url) links.push({ url, label: optStr(m?.label ?? "", 200)!.trim() });
  }
  return JSON.stringify(links);
}

/** Validates the post's versions, keeping the order they were picked in. */
async function cleanVersions(c: Context<AppEnv>, b: PostInput) {
  const raw: VersionInput[] = Array.isArray(b.versions) ? b.versions : (b.account_ids ?? []).map((account_id) => ({ account_id }));
  if (!Array.isArray(raw)) bad("versions must be a list");
  const ids = await cleanAccountIds(c, raw.map((v) => v?.account_id));
  const byId = new Map(raw.map((v) => [Number(v.account_id), v]));
  const versions = ids.map((id) => {
    const v = byId.get(id)!;
    return {
      account_id: id,
      body: optStr(v.body) ?? undefined,
      media: cleanMedia(v.media),
      writer_id: optNum(v.writer_id),
      creative_id: optNum(v.creative_id),
      poster_id: optNum(v.poster_id),
      scheduled_at: optNum(v.scheduled_at),
      posted_url: cleanUrl(v.posted_url, "The post link must be a web address"),
      status: v.status === undefined ? undefined : parseStatus(v.status),
    };
  });
  await assertActivePeople(c, ...versions.flatMap((v) => [v.writer_id, v.creative_id, v.poster_id]));
  const defaults = await defaultPosters(c, versions.filter((v) => v.poster_id === undefined).map((v) => v.account_id));
  return { ids, versions, defaults };
}

const EDITABLE = ["body", "media", "writer_id", "creative_id", "poster_id", "scheduled_at", "posted_url"] as const;

/**
 * Statements that save the post's versions: removed ones go, and each given one is upserted. A new
 * one gets defaults for what was left out (written by the person saving, posted by the account's
 * manager, not ready); a saved one gets only the given details. `postId` is SQL, so it works inside a batch.
 */
function versionStatements(c: Context<AppEnv>, postId: string, binds: unknown[], v: Awaited<ReturnType<typeof cleanVersions>>) {
  const me = c.get("profile").id;
  const stmts = [
    c.env.DB.prepare(`DELETE FROM post_versions WHERE post_id = ${postId} AND account_id NOT IN (SELECT value FROM json_each(?))`)
      .bind(...binds, JSON.stringify(v.ids)),
  ];
  for (const x of v.versions) {
    const sets = EDITABLE.filter((k) => x[k] !== undefined);
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO post_versions (post_id, account_id, body, media, writer_id, creative_id, poster_id, scheduled_at, status, posted_url)
         VALUES (${postId}, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (post_id, account_id) DO ${sets.length ? `UPDATE SET ${sets.map((k) => `${k} = excluded.${k}`).join(", ")}` : "NOTHING"}`,
      ).bind(
        ...binds, x.account_id, x.body ?? "", x.media ?? "[]",
        x.writer_id === undefined ? me : x.writer_id,
        x.creative_id ?? null,
        x.poster_id === undefined ? v.defaults.get(x.account_id) ?? null : x.poster_id,
        x.scheduled_at ?? null, x.status ?? "not_ready", x.posted_url ?? null,
      ),
    );
  }
  return stmts;
}

posts.post("/posts", async (c) => {
  const me = c.get("profile");
  const b = await body<PostInput>(c);
  const f = postFields(b);
  const versions = await cleanVersions(c, b);
  const topicId = await cleanTopicId(c, b.topic_id);
  const t = now();
  // One transaction: the post and its versions are created together (the new post is the highest id inside it).
  const newest = "(SELECT MAX(id) FROM posts)";
  const [created] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO posts (title, notes, status, scheduled_at, topic_id, created_by, created_at, updated_at)
       VALUES (?,?,'not_ready',?,?,?,?,?) RETURNING id`,
    ).bind(f.title, f.notes, f.scheduled_at, topicId, me.id, t, t),
    ...versionStatements(c, newest, [], versions),
    statusFromVersions(c, newest),
  ]);
  const id = (created.results[0] as { id: number }).id;
  await audit(c, "post", id, "create", { title: f.title, versions: versions.ids.length, topic: topicId });
  return c.json({ id }, 201);
});

/**
 * Save the whole post. `version` must match what the editor loaded; if someone else saved
 * in between, this fails with 409 instead of silently overwriting their changes.
 * Saved versions' statuses are not part of it: they change through the status route below.
 */
posts.put("/posts/:id", async (c) => {
  const id = idParam(c);
  const current = await loadPost(c, id);
  const b = await body<PostInput>(c);
  if (Number(b.version) !== current.version) bad("Someone else changed this post while you were editing. Reload to see their changes.", 409);
  const f = postFields(b);
  const versions = await cleanVersions(c, b);
  const topicId = await cleanTopicId(c, b.topic_id);
  const res = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE posts SET title = ?, notes = ?, scheduled_at = ?, topic_id = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?`,
    ).bind(f.title, f.notes, f.scheduled_at, topicId, now(), id, current.version),
    ...versionStatements(c, "?", [id], versions),
    statusFromVersions(c, "?", id),
  ]);
  if (!res[0].meta.changes) bad("Someone else changed this post while you were editing. Reload to see their changes.", 409);
  await audit(c, "post", id, "update", { title: f.title });
  return c.json({ ok: true, version: current.version + 1 });
});

/** Set one version's status. The post's status follows. Doesn't conflict with someone editing. */
posts.post("/posts/:id/versions/:account/status", async (c) => {
  const id = idParam(c);
  const account = idParam(c, "account");
  await loadPost(c, id);
  const to = parseStatus((await body<{ status: string }>(c)).status);
  const [r] = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE post_versions SET status = ? WHERE post_id = ? AND account_id = ?").bind(to, id, account),
    statusFromVersions(c, "?", id),
  ]);
  if (!r.meta.changes) bad("That account isn't on this post", 404);
  await audit(c, "post", id, "status", { account, to });
  return c.json({ ok: true });
});

posts.delete("/posts/:id", async (c) => {
  const id = idParam(c);
  await loadPost(c, id);
  await c.env.DB.prepare("UPDATE posts SET deleted_at = ? WHERE id = ?").bind(now(), id).run();
  await audit(c, "post", id, "delete");
  return c.json({ ok: true });
});

/** A fresh copy: same versions (text, media, people), all not ready, no times or live links. */
posts.post("/posts/:id/duplicate", async (c) => {
  const id = idParam(c);
  await loadPost(c, id);
  const t = now();
  const [created] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO posts (title, notes, status, topic_id, created_by, created_at, updated_at)
       SELECT title || ' (copy)', notes, 'not_ready', topic_id, ?, ?, ? FROM posts WHERE id = ? RETURNING id`,
    ).bind(c.get("profile").id, t, t, id),
    c.env.DB.prepare(
      `INSERT INTO post_versions (post_id, account_id, body, media, writer_id, creative_id, poster_id)
       SELECT (SELECT MAX(id) FROM posts), account_id, body, media, writer_id, creative_id, poster_id FROM post_versions WHERE post_id = ?`,
    ).bind(id),
  ]);
  const copy = (created.results[0] as { id: number }).id;
  await audit(c, "post", copy, "create", { duplicated_from: id });
  return c.json({ id: copy }, 201);
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
  const r = await c.env.DB.prepare("DELETE FROM comments WHERE id = ? AND author_id = ?").bind(id, c.get("profile").id).run();
  if (!r.meta.changes) bad("Not your comment", 403);
  return c.json({ ok: true });
});
