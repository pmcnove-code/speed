import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { personaPublicColumns } from "@/db/schema";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "persona";
}

export async function GET() {
  const rows = await db.select(personaPublicColumns()).from(t.personas).orderBy(asc(t.personas.id));
  return NextResponse.json({ personas: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const required = ["name", "audience", "tone", "backstory", "angle", "problem"];
  for (const f of required) if (!b[f]) return NextResponse.json({ error: `${f} is required` }, { status: 400 });

  const intensity = ["calm", "bold", "aggressive"].includes(b.intensity) ? b.intensity : "bold";
  const handle = b.handle ? slugify(b.handle) : slugify(b.name) + "-" + Math.random().toString(36).slice(2, 6);

  const [row] = await db
    .insert(t.personas)
    .values({
      name: b.name,
      handle,
      audience: b.audience,
      tone: b.tone,
      backstory: b.backstory,
      angle: b.angle,
      problem: b.problem,
      intensity,
      instructions: b.instructions || null,
      emoji: b.emoji || "🥩",
      active: b.active !== false,
    })
    .returning(personaPublicColumns());
  return NextResponse.json({ persona: row });
}
