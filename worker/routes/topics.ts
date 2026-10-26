import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { audit, bad, body, idParam, now, optStr } from "../util";
import type { Topic } from "../../shared/api";

/** Topics: read by everyone signed in, managed by admins (index.ts guards /admin/*). */
export const topics = new Hono<AppEnv>();

/** Every live topic in sidebar order, with how many of its posts are still open. */
topics.get("/topics", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.description, t.template, t.sort,
            (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.status <> 'completed' AND p.deleted_at IS NULL) AS open_count
       FROM topics t WHERE t.deleted_at IS NULL ORDER BY t.sort, t.name COLLATE NOCASE`,
  ).all<Topic>();
  return c.json<Topic[]>(results);
});

type Input = { name?: string; description?: string; template?: string };

function fields(b: Input) {
  const name = optStr(b.name, 100)?.trim();
  if (!name) bad("Give the topic a name");
  return { name, description: optStr(b.description, 500)?.trim() ?? "", template: optStr(b.template, 20_000) ?? "" };
}

/** The unique index on live topic names makes a duplicate fail; turn that into a clear message. */
function rethrowNameTaken(e: unknown, name: string): never {
  if (String(e).includes("UNIQUE")) bad(`A topic named "${name}" already exists`, 409);
  throw e;
}

async function loadTopic(c: Context<AppEnv>, id: number) {
  const t = await c.env.DB.prepare("SELECT id FROM topics WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!t) bad("Topic not found", 404);
}

/** New topics go to the end of the list. */
topics.post("/admin/topics", async (c) => {
  const f = fields(await body<Input>(c));
  const t = now();
  let row: { id: number } | null = null;
  try {
    row = await c.env.DB.prepare(
      `INSERT INTO topics (name, description, template, sort, created_at, updated_at)
       VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM topics WHERE deleted_at IS NULL), ?, ?) RETURNING id`,
    )
      .bind(f.name, f.description, f.template, t, t)
      .first<{ id: number }>();
  } catch (e) {
    rethrowNameTaken(e, f.name);
  }
  await audit(c, "topic", row!.id, "create", { name: f.name });
  return c.json(row, 201);
});

topics.put("/admin/topics/:id", async (c) => {
  const id = idParam(c);
  await loadTopic(c, id);
  const f = fields(await body<Input>(c));
  try {
    await c.env.DB.prepare("UPDATE topics SET name = ?, description = ?, template = ?, updated_at = ? WHERE id = ?")
      .bind(f.name, f.description, f.template, now(), id)
      .run();
  } catch (e) {
    rethrowNameTaken(e, f.name);
  }
  await audit(c, "topic", id, "update", { name: f.name });
  return c.json({ ok: true });
});

/** Set the sidebar order: `ids` lists every topic, first to last. */
topics.post("/admin/topics/order", async (c) => {
  const { ids } = await body<{ ids: unknown }>(c);
  if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n) && n > 0)) bad("ids must be a list of topic ids");
  await c.env.DB.batch(ids.map((id, i) => c.env.DB.prepare("UPDATE topics SET sort = ? WHERE id = ?").bind(i + 1, id)));
  return c.json({ ok: true });
});

/** Soft delete. Its posts stay, with no topic. */
topics.delete("/admin/topics/:id", async (c) => {
  const id = idParam(c);
  await loadTopic(c, id);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE posts SET topic_id = NULL WHERE topic_id = ?").bind(id),
    c.env.DB.prepare("UPDATE topics SET deleted_at = ? WHERE id = ?").bind(now(), id),
  ]);
  await audit(c, "topic", id, "delete");
  return c.json({ ok: true });
});
