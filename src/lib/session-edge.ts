/**
 * Edge-safe session bits: JWT verify + cookie name only (jose is Edge-compatible).
 * Kept separate from session.ts so middleware doesn't drag node:crypto / next/headers
 * into the Edge runtime.
 */
import { jwtVerify } from "jose";

export const SESSION_COOKIE = "cs_session";
export type Session = { label: string; role: "admin" | "member" };

export const sessionSecret = () =>
  new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-change-me");

export async function verifySessionToken(jwt: string | undefined): Promise<Session | null> {
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, sessionSecret());
    return { label: String(payload.label), role: payload.role === "admin" ? "admin" : "member" };
  } catch {
    return null;
  }
}
