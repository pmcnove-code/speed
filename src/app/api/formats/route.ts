import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, t } from "@/db";

export async function GET() {
  const formats = await db
    .select({ id: t.formats.id, name: t.formats.name, length: t.formats.length, active: t.formats.active })
    .from(t.formats)
    .where(eq(t.formats.active, true))
    .orderBy(asc(t.formats.id));

  return NextResponse.json({ formats });
}
