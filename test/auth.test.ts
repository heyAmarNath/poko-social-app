import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { admin, call, cookieFrom, login, makeProfile, member, platformId, seedPlatforms } from "./helpers";

// ---------- a stand-in for Google ----------

let signingKey: CryptoKey;
let publicJwk: JWK;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  signingKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
});
afterEach(() => vi.restoreAllMocks());

/** What the fake Google puts in the next ID token, and what it was sent. */
const google = { claims: {} as Record<string, unknown>, audience: "test-client-id", verifier: "" };

/** Answers the Worker's calls to Google: the token exchange with a signed ID token, and the signing keys. */
function fakeGoogle() {
  const real = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) return Response.json({ keys: [publicJwk] });
    if (url === "https://oauth2.googleapis.com/token") {
      google.verifier = new URLSearchParams(String(init?.body)).get("code_verifier") ?? "";
      const idToken = await new SignJWT(google.claims).setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer("https://accounts.google.com").setAudience(google.audience).setIssuedAt().setExpirationTime("5m").sign(signingKey);
      return Response.json({ id_token: idToken, token_type: "Bearer" });
    }
    return real(input, init);
  });
}

/** Starts a sign-in the way the button does: returns Google's URL and the browser's sign-in cookie. */
async function startSignIn() {
  const r = await call("/auth/google");
  expect(r.status).toBe(302);
  return { url: new URL(r.res.headers.get("location")!), cookie: cookieFrom(r.res, "sp_oauth")! };
}

/** Google sends the browser back with a code; the ID token carries `claims` (this sign-in's nonce unless overridden). */
async function finishSignIn(start: Awaited<ReturnType<typeof startSignIn>>, claims: Record<string, unknown>, state = start.url.searchParams.get("state")) {
  google.claims = { nonce: start.url.searchParams.get("nonce"), email_verified: true, ...claims };
  const r = await call(`/auth/google/callback?code=test-code&state=${state}`, { cookie: start.cookie });
  expect(r.status).toBe(302);
  return { to: r.res.headers.get("location"), session: cookieFrom(r.res, "sp_session") };
}

/** HTTP status of /me with this session cookie. */
const meStatus = async (cookie: string) => (await call("/me", { cookie })).status;

const s256 = async (v: string) =>
  btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("Google sign-in", () => {
  it("signs in the profile with that Google email", async () => {
    const id = await makeProfile({ name: "Ana", email: "ana@poko.video" });
    fakeGoogle();
    const start = await startSignIn();
    expect(`${start.url.origin}${start.url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(start.url.searchParams)).toMatchObject({
      client_id: "test-client-id", redirect_uri: "http://localhost/api/auth/google/callback",
      response_type: "code", scope: "openid email profile", code_challenge_method: "S256",
    });
    const done = await finishSignIn(start, { email: "Ana@Poko.video" }); // case doesn't matter
    expect(done.to).toBe("/");
    expect(await s256(google.verifier)).toBe(start.url.searchParams.get("code_challenge")); // PKCE
    expect((await call("/me", { cookie: done.session })).data).toEqual({ id, name: "Ana", email: "ana@poko.video", avatar_color: "#123456", role: "member" });
  });

  it("turns away anyone who isn't on the team, or whose profile is inactive", async () => {
    fakeGoogle();
    const stranger = await finishSignIn(await startSignIn(), { email: "stranger@gmail.com" });
    expect(stranger).toEqual({ to: "/?signin_error=not_on_team&email=stranger%40gmail.com", session: undefined });
    const id = await makeProfile({ email: "gone@poko.video" });
    await env.DB.prepare("UPDATE profiles SET active = 0 WHERE id = ?").bind(id).run();
    expect((await finishSignIn(await startSignIn(), { email: "gone@poko.video" })).to).toContain("signin_error=not_on_team");
  });

  it("refuses answers it can't trust", async () => {
    await makeProfile({ email: "eve@poko.video" });
    fakeGoogle();
    const failed = { to: "/?signin_error=failed", session: undefined };
    // the state doesn't match this browser's sign-in
    expect(await finishSignIn(await startSignIn(), { email: "eve@poko.video" }, "forged")).toEqual(failed);
    // a callback without this browser's sign-in cookie
    const other = await startSignIn();
    expect((await call(`/auth/google/callback?code=c&state=${other.url.searchParams.get("state")}`)).res.headers.get("location")).toBe(failed.to);
    // an ID token from another sign-in, with an unverified email, or for another app
    expect(await finishSignIn(await startSignIn(), { email: "eve@poko.video", nonce: "another" })).toEqual(failed);
    expect(await finishSignIn(await startSignIn(), { email: "eve@poko.video", email_verified: false })).toEqual(failed);
    google.audience = "someone-elses-app";
    expect(await finishSignIn(await startSignIn(), { email: "eve@poko.video" })).toEqual(failed);
    google.audience = "test-client-id";
    // cancelled on Google's screen
    const cancelled = await startSignIn();
    const r = await call(`/auth/google/callback?error=access_denied&state=${cancelled.url.searchParams.get("state")}`, { cookie: cancelled.cookie });
    expect(r.res.headers.get("location")).toBe("/?signin_error=cancelled");
  });
});

describe("sessions", () => {
  it("only lets you sign in as anyone (the dev sign-in) on localhost", async () => {
    const id = await makeProfile();
    expect((await call("/auth/options")).data).toEqual({ google: true, dev: true });
    expect((await call("/auth/options", { host: "poko.example.com" })).data).toEqual({ google: true, dev: false });
    expect((await call("/auth/dev", { host: "poko.example.com", json: { profile_id: id } })).status).toBe(404);
    expect((await call("/auth/dev/profiles", { host: "poko.example.com" })).status).toBe(404);
  });

  it("signs a profile out everywhere when an admin changes its role, email or status", async () => {
    const a = await admin();
    const id = await makeProfile();
    const edit = (json: unknown) => call(`/admin/profiles/${id}`, { method: "PATCH", cookie: a.cookie, json });
    const [laptop, phone] = [await login(id), await login(id)];
    await edit({ name: "Renamed", avatar_color: "#654321" });
    expect([await meStatus(laptop), await meStatus(phone)]).toEqual([200, 200]); // a new name or colour doesn't
    await edit({ role: "admin" });
    expect([await meStatus(laptop), await meStatus(phone)]).toEqual([401, 401]);
    let again = await login(id);
    await edit({ email: "moved@example.com" });
    expect(await meStatus(again)).toBe(401);
    again = await login(id);
    await edit({ active: false });
    expect(await meStatus(again)).toBe(401);
    expect((await call("/auth/dev", { json: { profile_id: id } })).status).toBe(404); // and can't sign in
  });
});

describe("people", () => {
  it("need a valid Google email, unique whatever the case", async () => {
    const a = await admin();
    expect((await call("/admin/profiles", { cookie: a.cookie, json: { name: "X", email: "not-an-email" } })).status).toBe(400);
    const made = await call("/admin/profiles", { cookie: a.cookie, json: { name: "Bea", email: " Bea@Poko.Video " } });
    expect(made.status).toBe(201);
    const bea = ((await call("/profiles", { cookie: a.cookie })).data as { id: number; email: string }[]).find((p) => p.id === made.data.id);
    expect(bea?.email).toBe("bea@poko.video");
    expect((await call("/admin/profiles", { cookie: a.cookie, json: { name: "Bea again", email: "BEA@poko.video" } })).status).toBe(409);
    expect((await call(`/admin/profiles/${a.id}`, { method: "PATCH", cookie: a.cookie, json: { email: "bea@poko.video" } })).status).toBe(409);
  });

  it("can be deleted: signed out, taken off open work and accounts, but named on finished work", async () => {
    await seedPlatforms();
    const a = await admin();
    const m = await member();
    const id = await makeProfile({ name: "Bea", email: "bea.leaving@poko.video" });
    const session = await login(id);
    await call("/admin/brands", { cookie: a.cookie, json: { name: "Delco", entries: [{ platform_id: await platformId("x"), url: "https://x.com/delco", manager_id: id }] } });
    const delco = async () => ((await call("/brands", { cookie: a.cookie })).data as { name: string; accounts: { id: number; manager_id: number | null }[] }[]).find((b) => b.name === "Delco")!.accounts[0];
    const account = (await delco()).id;
    const open = (await call("/posts", { cookie: a.cookie, json: { title: "Open", versions: [{ account_id: account, writer_id: id, creative_id: id }] } })).data.id;
    const done = (await call("/posts", { cookie: a.cookie, json: { title: "Done", versions: [{ account_id: account, writer_id: id, status: "completed" }] } })).data.id;
    const post = async (pid: number) => (await call(`/posts/${pid}`, { cookie: a.cookie })).data;
    const editorVersion = (await post(open)).version;

    expect((await call(`/admin/profiles/${id}`, { method: "DELETE", cookie: m.cookie })).status).toBe(403); // admins only
    expect((await call(`/admin/profiles/${id}`, { method: "DELETE", cookie: a.cookie })).status).toBe(200);

    expect(await meStatus(session)).toBe(401); // signed out at once
    expect((await call("/auth/dev", { json: { profile_id: id } })).status).toBe(404); // and can't sign in
    const people = (await call("/profiles", { cookie: a.cookie })).data as { id: number; name: string; deleted: number; active: number }[];
    expect(people.find((p) => p.id === id)).toMatchObject({ name: "Bea", deleted: 1, active: 0 }); // kept for names on old posts
    expect((await post(open)).versions[0]).toMatchObject({ writer_id: null, creative_id: null }); // open work is unassigned
    expect((await post(open)).version).toBe(editorVersion + 1); // so an open editor reloads instead of putting her back
    expect((await post(done)).versions[0].writer_id).toBe(id); // finished work keeps her
    expect((await delco()).manager_id).toBeNull();
    expect((await call(`/admin/profiles/${id}`, { method: "PATCH", cookie: a.cookie, json: { name: "Back" } })).status).toBe(404);
    expect((await call(`/admin/profiles/${id}`, { method: "DELETE", cookie: a.cookie })).status).toBe(404);
    // her email is free again
    expect((await call("/admin/profiles", { cookie: a.cookie, json: { name: "Bea", email: "bea.leaving@poko.video" } })).status).toBe(201);
  });

  it("can't delete yourself", async () => {
    const a = await admin();
    expect((await call(`/admin/profiles/${a.id}`, { method: "DELETE", cookie: a.cookie })).status).toBe(400);
    expect(await meStatus(a.cookie)).toBe(200);
  });

  it("always keep one active admin", async () => {
    const a = await admin();
    await env.DB.prepare("UPDATE profiles SET active = 0 WHERE role = 'admin' AND id <> ?").bind(a.id).run();
    expect((await call(`/admin/profiles/${a.id}`, { method: "PATCH", cookie: a.cookie, json: { role: "member" } })).status).toBe(400);
    expect((await call(`/admin/profiles/${a.id}`, { method: "PATCH", cookie: a.cookie, json: { active: false } })).status).toBe(400);
    const b = await admin();
    expect((await call(`/admin/profiles/${a.id}`, { method: "PATCH", cookie: b.cookie, json: { role: "member" } })).status).toBe(200);
  });
});

describe("access", () => {
  it("refuses everything without a sign-in", async () => {
    for (const path of ["/me", "/posts", "/brands", "/topics", "/profiles", "/dashboard?from=1&to=2"]) expect((await call(path)).status).toBe(401);
  });

  it("lets admins do content work too, and keeps members out of the settings", async () => {
    const a = await admin();
    const m = await member();
    expect((await call("/posts", { cookie: a.cookie, json: { title: "By an admin", account_ids: [] } })).status).toBe(201);
    expect((await call("/dashboard?from=1&to=2", { cookie: a.cookie })).status).toBe(200);
    expect((await call("/admin/brands", { cookie: m.cookie, json: { name: "x", entries: [] } })).status).toBe(403);
    expect((await call("/admin/topics", { cookie: m.cookie, json: { name: "x" } })).status).toBe(403);
    expect((await call("/admin/profiles", { cookie: m.cookie, json: { name: "x", email: "x@poko.video" } })).status).toBe(403);
    // emails are only shown to admins
    expect(((await call("/profiles", { cookie: m.cookie })).data as { email?: string }[]).every((p) => p.email === undefined)).toBe(true);
  });

  it("answers unknown addresses with 404 for everyone", async () => {
    const a = await admin();
    const m = await member();
    expect((await call("/admin/nope", { cookie: a.cookie })).status).toBe(404);
    expect((await call("/nope", { cookie: m.cookie })).status).toBe(404);
  });

  it("sends security headers", async () => {
    const r = await call("/auth/options");
    expect(r.res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.res.headers.get("x-frame-options")).toBe("DENY");
  });
});
