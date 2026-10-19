import { Hono, type Context } from "hono";
import type { AppEnv, Env } from "./env";
import { requireAdmin } from "./auth";
import { audit, bad, body, idParam, now, optNum, optStr } from "./util";
import {
  isHhmm, isTimeZone, isYmd, runDates, TEMPLATE_HORIZON_DAYS, todayIn, zonedToEpoch, type Schedule,
} from "../shared/schedule";

interface TemplateRow {
  id: number; title: string; body: string; notes: string | null;
  weekdays: string; time: string; timezone: string; starts_on: string; ends_on: string | null;
  writer_id: number | null; creative_id: number | null; active: number; created_by: number | null;
}

const schedule = (t: TemplateRow): Schedule => ({
  weekdays: JSON.parse(t.weekdays || "[]"), time: t.time, timezone: t.timezone, starts_on: t.starts_on, ends_on: t.ends_on,
});

/**
 * Create draft posts for upcoming run dates that don't have one yet.
 * Safe to call repeatedly: template_runs records every date already produced.
 */
export async function generateTemplates(env: Env, onlyId?: number) {
  const { results: templates } = await env.DB.prepare(
    `SELECT * FROM templates WHERE active = 1 AND deleted_at IS NULL ${onlyId ? "AND id = ?" : ""}`,
  )
    .bind(...(onlyId ? [onlyId] : []))
    .all<TemplateRow>();
  let created = 0;
  for (const t of templates) {
    const s = schedule(t);
    const today = todayIn(t.timezone);
    const { results: accounts } = await env.DB.prepare(
      `SELECT ta.account_id,
              (SELECT GROUP_CONCAT(h.profile_id) FROM account_handlers h JOIN profiles pr ON pr.id = h.profile_id
                WHERE h.account_id = ta.account_id AND pr.active = 1 AND pr.role = 'member') AS handlers
         FROM template_accounts ta JOIN accounts a ON a.id = ta.account_id
        WHERE ta.template_id = ? AND a.active = 1 AND a.deleted_at IS NULL`,
    )
      .bind(t.id)
      .all<{ account_id: number; handlers: string | null }>();
    if (!accounts.length) continue;

    for (const day of runDates(s, today, TEMPLATE_HORIZON_DAYS)) {
      const at = zonedToEpoch(day, t.time, t.timezone);
      if (at < Date.now()) continue; // today's slot already passed
      // Claim the date first so two runs can never both create it.
      const claim = await env.DB.prepare("INSERT OR IGNORE INTO template_runs (template_id, run_date) VALUES (?, ?)").bind(t.id, day).run();
      if (!claim.meta.changes) continue;
      const ts = now();
      const post = await env.DB.prepare(
        `INSERT INTO posts (title, body, notes, created_by, writer_id, creative_id, template_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
      )
        .bind(t.title, t.body, t.notes, t.created_by, t.writer_id, t.creative_id, t.id, ts, ts)
        .first<{ id: number }>();
      const postId = post!.id;
      await env.DB.batch([
        ...accounts.map((a) => {
          const hs = (a.handlers ?? "").split(",").filter(Boolean).map(Number);
          return env.DB.prepare("INSERT INTO post_targets (post_id, account_id, scheduled_at, manager_id) VALUES (?,?,?,?)")
            .bind(postId, a.account_id, at, hs.length === 1 ? hs[0] : null);
        }),
        env.DB.prepare("UPDATE template_runs SET post_id = ? WHERE template_id = ? AND run_date = ?").bind(postId, t.id, day),
        env.DB.prepare("INSERT INTO audit_log (actor_id, entity, entity_id, action, detail, created_at) VALUES (NULL, 'post', ?, 'create', ?, ?)")
          .bind(postId, JSON.stringify({ template_id: t.id, run_date: day }), ts),
      ]);
      created++;
    }
  }
  return created;
}

/**
 * Remove future posts from a template that nobody has touched yet (no edits, status
 * changes, comments or media), so a changed template can regenerate them.
 */
async function clearUntouchedFuture(c: Context<AppEnv>, templateId: number, timezone: string) {
  const { results } = await c.env.DB.prepare(
    `SELECT r.post_id FROM template_runs r JOIN posts p ON p.id = r.post_id
      WHERE r.template_id = ? AND r.run_date >= ? AND p.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM audit_log l WHERE l.entity = 'post' AND l.entity_id = p.id AND l.action != 'create')
        AND NOT EXISTS (SELECT 1 FROM comments cm WHERE cm.post_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM attachments at WHERE at.post_id = p.id)`,
  )
    .bind(templateId, todayIn(timezone))
    .all<{ post_id: number }>();
  if (!results.length) return 0;
  await c.env.DB.batch(
    results.flatMap(({ post_id }) => [
      c.env.DB.prepare("DELETE FROM post_targets WHERE post_id = ?").bind(post_id),
      c.env.DB.prepare("DELETE FROM template_runs WHERE post_id = ?").bind(post_id),
      c.env.DB.prepare("DELETE FROM audit_log WHERE entity = 'post' AND entity_id = ?").bind(post_id),
      c.env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(post_id),
    ]),
  );
  return results.length;
}

export const templates = new Hono<AppEnv>();
templates.use("*", requireAdmin);

templates.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, (SELECT GROUP_CONCAT(account_id) FROM template_accounts WHERE template_id = t.id) AS account_ids,
            (SELECT COUNT(*) FROM posts p WHERE p.template_id = t.id AND p.deleted_at IS NULL) AS post_count
       FROM templates t WHERE t.deleted_at IS NULL ORDER BY t.active DESC, t.title`,
  ).all<TemplateRow & { account_ids: string | null }>();
  return c.json(
    results.map((t) => ({
      ...t,
      weekdays: JSON.parse(t.weekdays || "[]"),
      account_ids: (t.account_ids ?? "").split(",").filter(Boolean).map(Number),
    })),
  );
});

type Input = {
  title?: string; body?: string; notes?: string | null; weekdays?: number[]; time?: string; timezone?: string;
  starts_on?: string; ends_on?: string | null; writer_id?: number | null; creative_id?: number | null;
  active?: boolean; account_ids?: number[];
};

/** Validates a full template payload and returns normalised values. */
async function validate(c: Context<AppEnv>, b: Input) {
  const title = optStr(b.title, 300)?.trim();
  if (!title) bad("Title is required");
  const weekdays = [...new Set((Array.isArray(b.weekdays) ? b.weekdays : []).map(Number))].filter((n) => n >= 1 && n <= 7).sort();
  if (!weekdays.length) bad("Pick at least one weekday");
  if (!isHhmm(b.time)) bad("Time must be HH:MM");
  if (!isTimeZone(b.timezone)) bad("Unknown timezone");
  if (!isYmd(b.starts_on)) bad("Start date is required");
  const ends = b.ends_on || null;
  if (ends && (!isYmd(ends) || ends < b.starts_on)) bad("End date must be after the start date");
  const accountIds = [...new Set((b.account_ids ?? []).map(Number))];
  if (!accountIds.length) bad("Pick at least one account");
  const { results: found } = await c.env.DB.prepare(
    `SELECT id FROM accounts WHERE deleted_at IS NULL AND id IN (${accountIds.map(() => "?").join(",")})`,
  )
    .bind(...accountIds)
    .all();
  if (found.length !== accountIds.length) bad("An account no longer exists");
  const people = [optNum(b.writer_id), optNum(b.creative_id)].filter((x): x is number => typeof x === "number");
  if (people.length) {
    const { results } = await c.env.DB.prepare(
      `SELECT id FROM profiles WHERE active = 1 AND role = 'member' AND id IN (${people.map(() => "?").join(",")})`,
    )
      .bind(...people)
      .all();
    if (results.length !== new Set(people).size) bad("Only active members can be assigned");
  }
  return {
    title, body: optStr(b.body) ?? "", notes: optStr(b.notes, 5000) || null, weekdays, time: b.time!, timezone: b.timezone!,
    starts_on: b.starts_on!, ends_on: ends, writer_id: optNum(b.writer_id) ?? null, creative_id: optNum(b.creative_id) ?? null,
    active: b.active === false ? 0 : 1, accountIds,
  };
}

const saveAccounts = (c: Context<AppEnv>, id: number, accountIds: number[]) => [
  c.env.DB.prepare("DELETE FROM template_accounts WHERE template_id = ?").bind(id),
  ...accountIds.map((a) => c.env.DB.prepare("INSERT INTO template_accounts (template_id, account_id) VALUES (?, ?)").bind(id, a)),
];

templates.post("/", async (c) => {
  const v = await validate(c, await body<Input>(c));
  const t = now();
  const row = await c.env.DB.prepare(
    `INSERT INTO templates (title, body, notes, weekdays, time, timezone, starts_on, ends_on, writer_id, creative_id, active, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  )
    .bind(v.title, v.body, v.notes, JSON.stringify(v.weekdays), v.time, v.timezone, v.starts_on, v.ends_on, v.writer_id, v.creative_id, v.active, c.get("profile").id, t, t)
    .first<{ id: number }>();
  await c.env.DB.batch(saveAccounts(c, row!.id, v.accountIds));
  const created = await generateTemplates(c.env, row!.id);
  await audit(c, "template", row!.id, "create", { title: v.title });
  return c.json({ id: row!.id, created }, 201);
});

/** Full update. Untouched future posts are rebuilt from the new version. */
templates.put("/:id", async (c) => {
  const id = idParam(c);
  const old = await c.env.DB.prepare("SELECT timezone FROM templates WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ timezone: string }>();
  if (!old) bad("Template not found", 404);
  const v = await validate(c, await body<Input>(c));
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE templates SET title = ?, body = ?, notes = ?, weekdays = ?, time = ?, timezone = ?, starts_on = ?, ends_on = ?,
              writer_id = ?, creative_id = ?, active = ?, updated_at = ? WHERE id = ?`,
    ).bind(v.title, v.body, v.notes, JSON.stringify(v.weekdays), v.time, v.timezone, v.starts_on, v.ends_on, v.writer_id, v.creative_id, v.active, now(), id),
    ...saveAccounts(c, id, v.accountIds),
  ]);
  const removed = await clearUntouchedFuture(c, id, old.timezone);
  const created = await generateTemplates(c.env, id);
  await audit(c, "template", id, "update", { title: v.title });
  return c.json({ ok: true, removed, created });
});

/** Pause or resume. Pausing removes untouched future posts. */
templates.patch("/:id", async (c) => {
  const id = idParam(c);
  const { active } = await body<{ active: boolean }>(c);
  const t = await c.env.DB.prepare("SELECT timezone FROM templates WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ timezone: string }>();
  if (!t) bad("Template not found", 404);
  await c.env.DB.prepare("UPDATE templates SET active = ?, updated_at = ? WHERE id = ?").bind(active ? 1 : 0, now(), id).run();
  const removed = active ? 0 : await clearUntouchedFuture(c, id, t.timezone);
  const created = active ? await generateTemplates(c.env, id) : 0;
  return c.json({ ok: true, removed, created });
});

templates.delete("/:id", async (c) => {
  const id = idParam(c);
  const t = await c.env.DB.prepare("SELECT timezone FROM templates WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ timezone: string }>();
  if (!t) bad("Template not found", 404);
  const removed = await clearUntouchedFuture(c, id, t.timezone);
  await c.env.DB.prepare("UPDATE templates SET deleted_at = ?, active = 0 WHERE id = ?").bind(now(), id).run();
  await audit(c, "template", id, "delete");
  return c.json({ ok: true, removed });
});
