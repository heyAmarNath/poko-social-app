import { createMiddleware } from "hono/factory";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppEnv, Profile } from "./env";
import { bad } from "./util";
import { ROLES, type Role } from "../shared/rules";

const COOKIE = "sp_session";
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const PBKDF2_ITER = 100_000; // Workers' maximum for PBKDF2
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 60_000;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Verifies the Cloudflare Access JWT. Fails closed if Access isn't configured. */
export const requireAccess = createMiddleware<AppEnv>(async (c, next) => {
  const bypass = c.env.DEV_BYPASS_EMAIL;
  const host = new URL(c.req.url).hostname;
  // The bypass only ever works on localhost, so a leaked dev var can't disable Access in production.
  if (bypass && (host === "localhost" || host === "127.0.0.1")) {
    c.set("accessEmail", bypass);
    return next();
  }
  const team = c.env.ACCESS_TEAM_DOMAIN;
  const aud = c.env.ACCESS_AUD;
  if (!team || !aud) bad("Cloudflare Access is not configured on this deployment", 403);
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) bad("Missing Access token", 401);
  jwks ??= createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud });
    c.set("accessEmail", String(payload.email ?? ""));
  } catch {
    bad("Invalid Access token", 401);
  }
  return next();
});

export function parseRoles(raw: string): Role[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((r): r is Role => ROLES.includes(r)) : [];
  } catch {
    return [];
  }
}

/** Requires a valid profile session (set after PIN entry). */
export const requireProfile = createMiddleware<AppEnv>(async (c, next) => {
  const raw = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE);
  if (!raw) bad("Choose a profile", 401);
  const [idStr, expStr] = raw.split(".");
  if (Number(expStr) < Date.now()) bad("Session expired", 401);
  const row = await c.env.DB.prepare(
    "SELECT id, name, avatar_color, roles, email FROM profiles WHERE id = ? AND active = 1",
  )
    .bind(Number(idStr))
    .first<Omit<Profile, "roles"> & { roles: string }>();
  if (!row) bad("Profile not found", 401);
  c.set("profile", { ...row, roles: parseRoles(row.roles) });
  return next();
});

export async function startSession(c: Parameters<typeof setSignedCookie>[0], secret: string, profileId: number) {
  await setSignedCookie(c, COOKIE, `${profileId}.${Date.now() + SESSION_MS}`, secret, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export function endSession(c: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(c, COOKIE, { path: "/" });
}

const hex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

export async function hashPin(pin: string, saltHex?: string) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER },
    key,
    256,
  );
  return { hash: hex(bits), salt: hex(salt) };
}

export async function verifyPin(pin: string, hashHex: string, saltHex: string) {
  const { hash } = await hashPin(pin, saltHex);
  if (hash.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

export const isValidPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4}$/.test(pin);
