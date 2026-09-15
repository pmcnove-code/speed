import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db.select().from(t.batches).orderBy(desc(t.batches.id)).limit(50);
  return NextResponse.json({ batches: rows });
}
