/**
 * Idempotent seed: access codes (from env), formats, personas, and the angle bank.
 * Personas upsert on handle so re-running updates briefs. Formats/angles skip if present.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, t } from "../src/db";
import { hashCode } from "../src/lib/hash";
import { PERSONA_SEEDS } from "./personas.seed";
import { ANGLE_BANK } from "./angles.seed";

async function seedCodes() {
  const admin = process.env.ADMIN_ACCESS_CODE;
  const member = process.env.MEMBER_ACCESS_CODE;
  const rows: { code: string; label: string; role: "admin" | "member" }[] = [];
  if (admin) rows.push({ code: admin, label: "Owner (admin)", role: "admin" });
  if (member) rows.push({ code: member, label: "Team member", role: "member" });
  for (const r of rows) {
    await db
      .insert(t.accessCodes)
      .values({ codeHash: hashCode(r.code), code: r.code, label: r.label, role: r.role })
      .onConflictDoUpdate({
        target: t.accessCodes.codeHash,
        set: { code: r.code },
      });
  }
  console.log(`access codes: ${rows.length} ensured`);
}

const FORMATS = [
  {
    name: "talking-to-camera-story",
    structure: "hook -> a small personal moment/story -> the one shift -> soft CTA",
    length: "15-30s, ~70-100 spoken words",
    notes: "no editing tricks, single-take feel, clips stitched one after another",
  },
  {
    name: "myth-flip",
    structure: "state a common belief -> gently flip it with lived experience/opinion -> what worked for me -> CTA",
    length: "12-22s, ~60-90 spoken words",
    notes: "punchy, one myth per post, never preachy",
  },
  {
    name: "day-of-eating",
    structure: "hook -> what I actually ate today, beat by beat -> how I felt -> CTA",
    length: "15-30s, ~70-100 spoken words",
    notes: "concrete foods, times of day, prices or context on screen; the niche workhorse format",
  },
  {
    name: "question-hook",
    structure: "open on the exact question people ask me -> my honest answer from experience -> CTA",
    length: "12-20s, ~55-85 spoken words",
    notes: "one recurring skeptical question per reel",
  },
];

async function seedFormats() {
  for (const f of FORMATS) {
    const existing = await db.select().from(t.formats).where(sql`${t.formats.name} = ${f.name}`);
    if (!existing.length) await db.insert(t.formats).values(f);
  }
  console.log(`formats: ${FORMATS.length} ensured`);
}

async function seedPersonas() {
  for (const p of PERSONA_SEEDS) {
    await db
      .insert(t.personas)
      .values(p)
      .onConflictDoUpdate({
        target: t.personas.handle,
        set: {
          name: p.name,
          audience: p.audience,
          tone: p.tone,
          backstory: p.backstory,
          angle: p.angle,
          problem: p.problem,
          intensity: p.intensity,
          instructions: p.instructions ?? null,
          emoji: p.emoji,
        },
      });
  }
  console.log(`personas: ${PERSONA_SEEDS.length} upserted`);
}

async function seedAngles() {
  const count = await db.select({ n: sql<number>`count(*)` }).from(t.angleBank);
  if (Number(count[0]?.n ?? 0) > 0) {
    console.log("angle bank: already populated, skipping");
    return;
  }
  await db.insert(t.angleBank).values(ANGLE_BANK);
  console.log(`angle bank: ${ANGLE_BANK.length} rows inserted`);
}

async function main() {
  await seedCodes();
  await seedFormats();
  await seedPersonas();
  await seedAngles();
  console.log("seed complete");
  await db.$client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
