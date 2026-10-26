import { Hono, type Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { devLogin, endSession, isHttps, requireProfile, startSession } from "../auth";
import { authUrl, challengeFor, randomToken, verifiedEmail } from "../google";
import { audit, bad, body, optNum } from "../util";

/** Signing in and out. Everything else in the API needs a signed-in profile. */
export const session = new Hono<AppEnv>();

/** What the sign-in page can offer. */
session.get("/auth/options", (c) => c.json({ google: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET), dev: devLogin(c) }));

// ---------- Sign in with Google ----------

/** Short-lived cookie that ties Google's answer to the browser that asked. Lax, so it comes back on Google's redirect. */
const OAUTH_COOKIE = "sp_oauth";
const redirectUri = (c: Context<AppEnv>) => `${new URL(c.req.url).origin}/api/auth/google/callback`;

session.get("/auth/google", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) bad("Google sign-in isn't set up on this deployment", 503);
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  await setSignedCookie(c, OAUTH_COOKIE, JSON.stringify({ state, nonce, verifier }), c.env.SESSION_SECRET, {
    httpOnly: true, secure: isHttps(c), sameSite: "Lax", path: "/api/auth", maxAge: 600,
  });
  return c.redirect(authUrl({ clientId: c.env.GOOGLE_CLIENT_ID, redirectUri: redirectUri(c), state, nonce, challenge: await challengeFor(verifier) }));
});

/**
 * Google sends the browser back here. Signs in the profile whose email matches the Google account;
 * anything else goes back to the sign-in page with a reason it can show.
 */
session.get("/auth/google/callback", async (c) => {
  const back = (reason: "cancelled" | "failed" | "not_on_team", email?: string) =>
    c.redirect(`/?${new URLSearchParams({ signin_error: reason, ...(email ? { email } : {}) })}`);
  const raw = await getSignedCookie(c, c.env.SESSION_SECRET, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth" });
  if (c.req.query("error")) return back("cancelled");
  let saved: { state: string; nonce: string; verifier: string } | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  const code = c.req.query("code");
  if (!saved || !code || c.req.query("state") !== saved.state) return back("failed");

  let email: string;
  try {
    email = await verifiedEmail({
      clientId: c.env.GOOGLE_CLIENT_ID, clientSecret: c.env.GOOGLE_CLIENT_SECRET, code,
      redirectUri: redirectUri(c), verifier: saved.verifier, nonce: saved.nonce,
    });
  } catch (e) {
    console.error(e);
    return back("failed");
  }
  const row = await c.env.DB.prepare("SELECT id, session_version FROM profiles WHERE email = ? COLLATE NOCASE AND active = 1")
    .bind(email)
    .first<{ id: number; session_version: number }>();
  if (!row) return back("not_on_team", email);
  await startSession(c, row.id, row.session_version);
  await audit(c, "profile", row.id, "sign_in");
  return c.redirect("/");
});

// ---------- Local development: sign in as anyone ----------

session.get("/auth/dev/profiles", async (c) => {
  if (!devLogin(c)) bad("Not found", 404);
  const { results } = await c.env.DB.prepare("SELECT id, name, email, avatar_color, role FROM profiles WHERE active = 1 ORDER BY role, name").all();
  return c.json(results);
});

session.post("/auth/dev", async (c) => {
  if (!devLogin(c)) bad("Not found", 404);
  const id = optNum((await body<{ profile_id: number }>(c)).profile_id);
  const row = await c.env.DB.prepare("SELECT id, session_version FROM profiles WHERE id = ? AND active = 1").bind(id).first<{ id: number; session_version: number }>();
  if (!row) bad("Profile not found", 404);
  await startSession(c, row.id, row.session_version);
  return c.json({ ok: true });
});

// ---------- Signed in ----------

session.post("/auth/logout", (c) => {
  endSession(c);
  return c.json({ ok: true });
});

session.get("/me", requireProfile, (c) => c.json(c.get("profile")));
