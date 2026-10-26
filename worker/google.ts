import { createRemoteJWKSet, jwtVerify } from "jose";

// Sign in with Google (OpenID Connect, authorization code flow with PKCE).

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** A random value for state, nonce and the PKCE verifier. */
export const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

/** The S256 PKCE challenge for a verifier. */
export async function challengeFor(verifier: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** Where to send the browser to sign in. `prompt` lets people pick which Google account to use. */
export function authUrl(p: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string }) {
  const q = new URLSearchParams({
    client_id: p.clientId, redirect_uri: p.redirectUri, response_type: "code", scope: "openid email profile",
    state: p.state, nonce: p.nonce, code_challenge: p.challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return `${AUTH_URL}?${q}`;
}

/**
 * Swaps the code Google sent back for an ID token, and returns its email once the token checks out:
 * signed by Google, issued to this app for this sign-in, and the email verified. Throws otherwise.
 */
export async function verifiedEmail(p: { clientId: string; clientSecret: string; code: string; redirectUri: string; verifier: string; nonce: string }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code: p.code, redirect_uri: p.redirectUri,
      client_id: p.clientId, client_secret: p.clientSecret, code_verifier: p.verifier,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  const { id_token } = await res.json<{ id_token?: string }>();
  if (!id_token) throw new Error("Google sent no ID token");
  const { payload } = await jwtVerify(id_token, googleKeys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: p.clientId,
  });
  if (payload.nonce !== p.nonce) throw new Error("ID token is for a different sign-in");
  if (payload.email_verified !== true || typeof payload.email !== "string") throw new Error("Google account email isn't verified");
  return payload.email.toLowerCase();
}
