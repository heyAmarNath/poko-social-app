import type { Env } from "./env";

const PURGE_DELETED_AFTER_DAYS = 30;
const KEEP_AUDIT_DAYS = 90;

/**
 * Nightly housekeeping: posts deleted more than 30 days ago are removed for good, and change-log
 * entries older than 90 days are dropped.
 */
export async function purge(env: Env) {
  const cutoff = Date.now() - PURGE_DELETED_AFTER_DAYS * 86_400_000;
  const { results: gone } = await env.DB.prepare("SELECT id FROM posts WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT 200")
    .bind(cutoff)
    .all<{ id: number }>();
  if (gone.length) {
    const ids = JSON.stringify(gone.map((p) => p.id));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM comments WHERE post_id IN (SELECT value FROM json_each(?))").bind(ids),
      env.DB.prepare("DELETE FROM post_versions WHERE post_id IN (SELECT value FROM json_each(?))").bind(ids),
      env.DB.prepare("DELETE FROM posts WHERE id IN (SELECT value FROM json_each(?))").bind(ids),
    ]);
  }
  await env.DB.prepare("DELETE FROM audit_log WHERE created_at < ?").bind(Date.now() - KEEP_AUDIT_DAYS * 86_400_000).run();
  return gone.length;
}
