import { Hono } from "hono";
import type { AppEnv } from "../env";
import { endSession, hashPin, isValidPin, LOCK_MS, MAX_ATTEMPTS, requireProfile, startSession, verifyPin } from "../auth";
import { bad, body, now } from "../util";

export const session = new Hono<AppEnv>();

/** Profile tiles for the switcher. Behind Access, but no PIN needed. */
session.get("/profiles/public", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, avatar_color FROM profiles WHERE active = 1 ORDER BY name",
  ).all();
  return c.json(results);
});

session.post("/auth/pin", async (c) => {
  const { profile_id, pin } = await body<{ profile_id: number; pin: string }>(c);
  if (!isValidPin(pin)) bad("PIN must be 4 digits");
  const row = await c.env.DB.prepare(
    "SELECT id, pin_hash, pin_salt, failed_attempts, locked_until FROM profiles WHERE id = ? AND active = 1",
  )
    .bind(Number(profile_id))
    .first<{ id: number; pin_hash: string; pin_salt: string; failed_attempts: number; locked_until: number | null }>();
  if (!row) bad("Profile not found", 404);
  if (row.locked_until && row.locked_until > now()) {
    bad(`Too many attempts. Try again in ${Math.ceil((row.locked_until - now()) / 1000)}s`, 423);
  }
  if (!(await verifyPin(pin, row.pin_hash, row.pin_salt))) {
    const attempts = row.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS ? now() + LOCK_MS : null;
    await c.env.DB.prepare("UPDATE profiles SET failed_attempts = ?, locked_until = ? WHERE id = ?")
      .bind(lock ? 0 : attempts, lock, row.id)
      .run();
    if (lock) bad("Too many attempts. Locked for 60s", 423);
    bad(`Wrong PIN. ${MAX_ATTEMPTS - attempts} attempts left`, 401);
  }
  await c.env.DB.prepare("UPDATE profiles SET failed_attempts = 0, locked_until = NULL WHERE id = ?").bind(row.id).run();
  await startSession(c, c.env.SESSION_SECRET, row.id);
  return c.json({ ok: true });
});

session.post("/auth/logout", (c) => {
  endSession(c);
  return c.json({ ok: true });
});

session.get("/me", requireProfile, (c) => c.json({ ...c.get("profile"), access_email: c.get("accessEmail") }));

session.post("/me/pin", requireProfile, async (c) => {
  const { current, next } = await body<{ current: string; next: string }>(c);
  if (!isValidPin(next)) bad("New PIN must be 4 digits");
  const me = c.get("profile");
  const row = await c.env.DB.prepare("SELECT pin_hash, pin_salt FROM profiles WHERE id = ?")
    .bind(me.id)
    .first<{ pin_hash: string; pin_salt: string }>();
  if (!row || !isValidPin(current) || !(await verifyPin(current, row.pin_hash, row.pin_salt))) {
    bad("Current PIN is wrong", 401);
  }
  const h = await hashPin(next);
  await c.env.DB.prepare("UPDATE profiles SET pin_hash = ?, pin_salt = ? WHERE id = ?").bind(h.hash, h.salt, me.id).run();
  return c.json({ ok: true });
});
