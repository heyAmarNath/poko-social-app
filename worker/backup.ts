import type { Env } from "./env";

const TABLES = ["profiles", "platforms", "accounts", "account_handlers", "templates", "template_accounts", "template_runs", "posts", "post_targets", "attachments", "comments", "audit_log"];
const KEEP_DAYS = 30;

/** Nightly JSON snapshot of every table into R2, keeping the last 30 days. */
export async function backup(env: Env) {
  const results = await env.DB.batch(TABLES.map((t) => env.DB.prepare(`SELECT * FROM ${t}`)));
  const snapshot = Object.fromEntries(TABLES.map((t, i) => [t, results[i].results]));
  const day = new Date().toISOString().slice(0, 10);
  await env.MEDIA.put(`backups/${day}.json`, JSON.stringify({ created_at: new Date().toISOString(), ...snapshot }), {
    httpMetadata: { contentType: "application/json" },
  });
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const listed = await env.MEDIA.list({ prefix: "backups/" });
  const old = listed.objects.map((o) => o.key).filter((k) => k.slice(8, 18) < cutoff);
  if (old.length) await env.MEDIA.delete(old);
  return `backups/${day}.json`;
}
