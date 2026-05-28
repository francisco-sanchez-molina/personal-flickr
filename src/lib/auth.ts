import crypto from "node:crypto";
import type { AstroCookies } from "astro";
import { config } from "./config";

const COOKIE_NAME = "pf_session";
const MAX_AGE_DAYS = 30;

/**
 * Cookie `Secure` flag. We want it ON in production (so the browser refuses
 * to send the session over plain HTTP) and OFF for local dev (where you
 * usually hit `http://localhost`).
 *
 * Auto-detected from NODE_ENV but overridable via COOKIE_SECURE env:
 *   COOKIE_SECURE=true  → always Secure
 *   COOKIE_SECURE=false → never Secure
 *   unset               → Secure iff NODE_ENV=production
 */
function isCookieSecure(): boolean {
  const v = process.env.COOKIE_SECURE;
  if (v === "true") return true;
  if (v === "false") return false;
  return process.env.NODE_ENV === "production";
}

function sign(value: string): string {
  return crypto
    .createHmac("sha256", config.sessionSecret)
    .update(value)
    .digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** issuedAt as ISO date string, signed with HMAC. */
function makeToken(): string {
  const issued = new Date().toISOString();
  return `${issued}.${sign(issued)}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const issued = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!timingSafeEqual(sig, sign(issued))) return false;
  const issuedMs = Date.parse(issued);
  if (Number.isNaN(issuedMs)) return false;
  const ageDays = (Date.now() - issuedMs) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays < MAX_AGE_DAYS;
}

export function isAuthed(cookies: AstroCookies): boolean {
  return verifyToken(cookies.get(COOKIE_NAME)?.value);
}

/**
 * Verify a username + password pair against the env-configured credentials
 * and, on success, issue the session cookie.
 *
 * Both compares are timing-safe to avoid leaking whether the *username*
 * exists vs. the *password* is wrong via response time. The total compare
 * always touches both Buffers regardless of which side mismatched.
 */
export function login(
  cookies: AstroCookies,
  username: string,
  password: string,
): boolean {
  // Pad-to-equal-length pattern is the safe way to compare strings of
  // potentially different lengths without leaking the length difference.
  // We use Node's timingSafeEqual which requires equal-length buffers,
  // so we hash both sides first (HMAC of the secret) — same length out
  // regardless of input.
  const hmac = (s: string) =>
    crypto.createHmac("sha256", config.sessionSecret).update(s).digest();

  const userOk = crypto.timingSafeEqual(hmac(username), hmac(config.username));
  const passOk = crypto.timingSafeEqual(hmac(password), hmac(config.password));
  if (!userOk || !passOk) return false;

  cookies.set(COOKIE_NAME, makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isCookieSecure(),
    path: "/",
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  });
  return true;
}

export function logout(cookies: AstroCookies) {
  cookies.delete(COOKIE_NAME, { path: "/" });
}
