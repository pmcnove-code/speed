import { NextResponse } from "next/server";
import { db, t } from "@/db";
import { codeMatches, createSession } from "@/lib/session";

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({ code: "" }));
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Enter an access code." }, { status: 400 });
  }
  const rows = await db.select().from(t.accessCodes);
  const match = rows.find((r) => codeMatches(code, r.codeHash));
  if (!match) {
    return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
  }
  await createSession({ label: match.label, role: match.role === "admin" ? "admin" : "member" });
  return NextResponse.json({ ok: true, label: match.label, role: match.role });
}
