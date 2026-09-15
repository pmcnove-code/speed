import { normalizeCharacterGender } from "../../../../../shared/flow/gender.mjs";
import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { isFlowReady } from "@/lib/experimental/flow-worker";
import { reelJobPublicColumns } from "@/db/schema";
import { reelJobSelect, toPublicReelJob } from "@/lib/experimental/reel-public";
import { selectAvailableReference } from "@/lib/experimental/reference-selection";
import { normalizeSceneDirection } from "@/lib/experimental/scenes";

export const runtime = "nodejs";

function asLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 12);
  if (typeof value === "string") {
    return value
      .split(/\n|\|/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db.select(reelJobSelect()).from(t.reelJobs).orderBy(sql`case when ${t.reelJobs.status} in ('queued','running') then 0 else 1 end`, desc(t.reelJobs.queuedAt)).limit(200);
  return NextResponse.json({ jobs: rows.map((row) => toPublicReelJob(row)) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const flowReady = await isFlowReady();
  if (!flowReady) {
    return NextResponse.json(
      { error: "Sign in to Flow in Settings before generating." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const hook = typeof body.hook === "string" ? body.hook.trim().slice(0, 400) : "";
  const script = typeof body.script === "string" ? body.script.trim().slice(0, 4000) : "";
  const cta = typeof body.cta === "string" ? body.cta.trim().slice(0, 240) : "";
  const videoBrief = typeof body.videoBrief === "string" ? body.videoBrief.trim().slice(0, 800) : "";
  const onScreenText = asLines(body.onScreenText);
  const postId = Number(body.postId) || null;

  if (!hook && !script) {
    return NextResponse.json({ error: "Paste a hook and script, or pick a generated post." }, { status: 400 });
  }

  let sceneDirection;
  let characterGender;
  try {
    characterGender = normalizeCharacterGender(body.characterGender);
    sceneDirection = normalizeSceneDirection(body.sceneDirection);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Check your scene directions." }, { status: 400 });
  }
  if (flowReady && !characterGender) return NextResponse.json({error:"Choose Male or Female for your video character."}, {status:400});
  if ((sceneDirection || characterGender) && !flowReady) {
    return NextResponse.json({ error: "Connect your Flow account in Settings to choose a character gender or scene directions." }, { status: 400 });
  }

  let describedReference = null;
  if (sceneDirection?.characterDescription) {
    const references = await db.select().from(t.personas).where(sql`octet_length(${t.personas.photo}) > 0`);
    describedReference = selectAvailableReference(null, references, characterGender, sceneDirection.characterDescription);
    if (!describedReference) return NextResponse.json({error:"Use a saved character name matching your selected gender. Add its reference photo in Personas if it is missing."}, {status:400});
  }
  const [job] = await db
    .insert(t.reelJobs)
    .values({
      status: "queued",
      stage: flowReady ? "setup" : "script",
      stageDetail: flowReady ? "Flow: queued — waiting for Chrome" : "Queued",
      postId,
      hook: hook || script.split("\n")[0] || "",
      script: script || hook,
      onScreenText,
      cta,
      videoBrief,
      sceneDirection,
      characterGender,
      ...(describedReference ? {referencePersonaId:describedReference.id,referenceCharacter:describedReference.name} : {}),
      createdBy: session.label,
    })
    .returning(reelJobPublicColumns());

  if (!job) return NextResponse.json({ error: "Could not create reel job." }, { status: 500 });

  return NextResponse.json({ ok: true, job: toPublicReelJob(job, false) });
}
