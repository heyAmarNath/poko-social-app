import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { AppEnv, Profile } from "./env";
import { bad } from "./util";
import { isAdmin } from "../shared/rules";

const COOKIE = "sp_session";
/** How long a sign-in lasts. Signing out, or a change to the profile's role, email or status, ends it sooner. */
const SESSION_MS = 30 * 86_400_000;

export const isHttps = (c: Context) => new URL(c.req.url).protocol === "https:";

/** The dev sign-in only ever works on localhost, so a leaked dev setting can't open up production. */
export const devLogin = (c: Context<AppEnv>) =>
  !!c.env.DEV_LOGIN && ["localhost", "127.0.0.1"].includes(new URL(c.req.url).hostname);

/**
 * Requires a signed-in profile. The cookie carries the profile's session_version, so deactivating a
 * profile or changing its role or email signs out every session it has.
 */
export const requireProfile = createMiddleware<AppEnv>(async (c, next) => {
  const raw = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE);
  if (!raw) bad("Please sign in", 401);
  const [idStr, versionStr, expStr] = raw.split(".");
  if (!(Number(expStr) > Date.now())) bad("Your sign-in has expired", 401);
  const row = await c.env.DB.prepare(
    "SELECT id, name, email, avatar_color, role, session_version FROM profiles WHERE id = ? AND active = 1",
  )
    .bind(Number(idStr))
    .first<Profile & { session_version: number }>();
  if (!row || row.session_version !== Number(versionStr)) bad("Please sign in again", 401);
  const { session_version: _, ...profile } = row;
  c.set("profile", profile);
  return next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isAdmin(c.get("profile"))) bad("Admins only", 403);
  return next();
});

export async function startSession(c: Context<AppEnv>, profileId: number, sessionVersion: number) {
  await setSignedCookie(c, COOKIE, `${profileId}.${sessionVersion}.${Date.now() + SESSION_MS}`, c.env.SESSION_SECRET, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export function endSession(c: Context<AppEnv>) {
  deleteCookie(c, COOKIE, { path: "/" });
}
