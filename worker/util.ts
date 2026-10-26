import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./env";

export const now = () => Date.now();

export function bad(message: string, status: 400 | 401 | 403 | 404 | 409 | 503 = 400): never {
  throw new HTTPException(status, { message });
}

export async function body<T = Record<string, unknown>>(c: Context<AppEnv>): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    bad("Invalid JSON body");
  }
}

export const idParam = (c: Context<AppEnv>, name = "id") => {
  const n = Number(c.req.param(name));
  if (!Number.isInteger(n) || n <= 0) bad("Invalid id");
  return n;
};

export async function audit(
  c: Context<AppEnv>,
  entity: string,
  entityId: number,
  action: string,
  detail?: unknown,
) {
  await c.env.DB.prepare(
    "INSERT INTO audit_log (actor_id, entity, entity_id, action, detail, created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(c.get("profile")?.id ?? null, entity, entityId, action, detail ? JSON.stringify(detail) : null, now())
    .run();
}

/** Coerce optional numeric ids / timestamps from JSON: undefined stays undefined, "" and null become null. */
export function optNum(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) bad("Expected a number");
  return n;
}

export function optStr(v: unknown, max = 100_000): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") bad("Expected a string");
  if (v.length > max) bad("Text too long");
  return v;
}
