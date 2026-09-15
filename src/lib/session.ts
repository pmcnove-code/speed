import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionSecret, verifySessionToken, type Session } from "./session-edge";

export { SESSION_COOKIE, verifySessionToken };
export { hashCode, codeMatches } from "./hash";
export type { Session };

export async function createSession(s: Session) {
  const jwt = await new SignJWT(s)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(sessionSecret());
  (await cookies()).set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getSession(): Promise<Session | null> {
  const jwt = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(jwt);
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}
