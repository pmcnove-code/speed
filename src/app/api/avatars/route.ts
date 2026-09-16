import { NextResponse } from "next/server";
import { asc, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const personas = await db
      .select({
        id: t.personas.id,
        name: t.personas.name,
        handle: t.personas.handle,
        active: t.personas.active,
        hasPhoto: sql<boolean>`octet_length(${t.personas.photo}) > 0`,
      })
      .from(t.personas)
      .orderBy(asc(t.personas.id));

    const result = await Promise.all(
      personas.map(async (persona) => {
        const backgrounds = await db
          .select({
            id: t.personaBackgrounds.id,
            label: t.personaBackgrounds.label,
            selected: t.personaBackgrounds.selected,
          })
          .from(t.personaBackgrounds)
          .where(sql`${t.personaBackgrounds.personaId} = ${persona.id}`);

        const subtitleStyles = await db
          .select({
            id: t.subtitleStyles.id,
            name: t.subtitleStyles.name,
            selected: t.subtitleStyles.selected,
            config: t.subtitleStyles.config,
          })
          .from(t.subtitleStyles)
          .where(sql`${t.subtitleStyles.personaId} = ${persona.id}`);

        return {
          ...persona,
          backgrounds,
          subtitleStyles,
        };
      })
    );

    return NextResponse.json({ avatars: result });
  } catch (error) {
    console.error("Error fetching avatars:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch avatars" },
      { status: 500 }
    );
  }
}
