import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { codeMatches, hashCode } from "@/lib/hash";

export type AccessCodeRow = { id: number; label: string; role: string; code: string };

function knownPlaintexts(): string[] {
  return [process.env.ADMIN_ACCESS_CODE, process.env.MEMBER_ACCESS_CODE].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
}

function recoverPlain(hash: string): string {
  return knownPlaintexts().find((c) => codeMatches(c, hash)) ?? "";
}

export async function listAccessCodes(): Promise<AccessCodeRow[]> {
  const rows = await db.select().from(t.accessCodes);
  const out: AccessCodeRow[] = [];
  for (const r of rows) {
    let code = r.code?.trim() ?? "";
    if (!code) {
      code = recoverPlain(r.codeHash);
      if (code) {
        await db.update(t.accessCodes).set({ code }).where(eq(t.accessCodes.id, r.id));
      }
    }
    out.push({ id: r.id, label: r.label, role: r.role, code });
  }
  return out;
}

export function normalizeRole(role: unknown): "admin" | "member" {
  return role === "admin" ? "admin" : "member";
}

export async function adminCount(): Promise<number> {
  const rows = await db.select({ role: t.accessCodes.role }).from(t.accessCodes);
  return rows.filter((r) => r.role === "admin").length;
}

export { hashCode };
