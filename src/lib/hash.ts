/**
 * Access-code hashing — Node crypto only (no next/headers, no jose), so it's safe to
 * import from standalone scripts (seed) as well as server code.
 */
import { scryptSync, timingSafeEqual } from "crypto";

export function hashCode(code: string): string {
  // static salt is acceptable here: codes are high-entropy shared secrets, not user passwords
  return scryptSync(code.normalize(), "copy-studio-v2", 32).toString("hex");
}

export function codeMatches(code: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(code), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
