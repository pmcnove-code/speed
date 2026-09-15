import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { parseProviderId, providerAvailable, resolveModel } from "@/lib/llm/provider";
import { runBatch } from "@/lib/engine/pipeline";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const batches = await db
    .select()
    .from(t.batches)
    .orderBy(desc(t.batches.createdAt))
    .limit(50);

  return NextResponse.json(batches);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      countRequested,
      formatId = 1,
      situation = "",
    } = body;

    if (!countRequested) {
      return NextResponse.json(
        { error: "Missing required field: countRequested" },
        { status: 400 }
      );
    }

    let personaIds: number[] = Array.isArray(body.personaIds) ? body.personaIds.map(Number) : [];
    if (!personaIds.length) {
      const activePersonas = await db.select({ id: t.personas.id }).from(t.personas).where(eq(t.personas.active, true));
      personaIds = activePersonas.map((p) => p.id);
    }
    if (!personaIds.length) {
      return NextResponse.json({ error: "No active avatars to generate for." }, { status: 400 });
    }


    const provider = parseProviderId(body.provider);
    if (!(await providerAvailable(provider))) {
      return NextResponse.json(
        { error: `${provider} is not configured (missing API key).` },
        { status: 400 }
      );
    }
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : await resolveModel(provider);

    const [batch] = await db
      .insert(t.batches)
      .values({
        provider,
        model,
        countRequested: Number(countRequested),
        personaIds,
        formatId: Number(formatId),
        situation,
        status: "queued",
        createdBy: session.label || "user",
      })
      .returning();

    if (!batch) {
      return NextResponse.json({ error: "Failed to create batch" }, { status: 500 });
    }

    // Fire-and-forget: the SSE events endpoint streams progress from job_events.
    void runBatch(batch.id).catch(() => {});

    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    console.error("Error creating batch:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create batch" },
      { status: 500 }
    );
  }
}
