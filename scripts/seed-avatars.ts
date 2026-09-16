/** Seeds the four demo avatars from the design reference: portrait photos,
 * labeled backgrounds, and subtitle styles. Idempotent — skips personas that
 * already exist by name. Images come from Unsplash (stable public photo ids)
 * with pravatar/picsum fallbacks. Run: npx tsx scripts/seed-avatars.ts */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { subtitleStylePresets } from "../shared/flow/subtitle-style.mjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://copy:copy@localhost:5440/copystudio" });
const db = drizzle(pool, { schema });
const t = schema;

const unsplash = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?w=${w}&q=75&fm=jpg&fit=crop`;

const BACKGROUND_URLS: Record<string, string[]> = {
  Gym: [unsplash("1534438327276-14e5300c3a48", 900), "https://picsum.photos/seed/gym/900/600"],
  Office: [unsplash("1497366754035-f200968a6e72", 900), "https://picsum.photos/seed/office/900/600"],
  Home: [unsplash("1586023492125-27b2c045efd7", 900), "https://picsum.photos/seed/home/900/600"],
  Studio: [unsplash("1598488035139-bdbb2231ce04", 900), "https://picsum.photos/seed/studio/900/600"],
  Outdoor: [unsplash("1501785888041-af3ef285b470", 900), "https://picsum.photos/seed/outdoor/900/600"],
};

const AVATARS = [
  {
    name: "Alex Carter", handle: "alex-carter",
    portraits: [unsplash("1472099645785-5658abf4ff4e", 700), "https://i.pravatar.cc/700?img=12"],
    backgrounds: ["Gym", "Office", "Home", "Studio"], selectedBackground: "Gym",
    styles: ["classic", "dynamic", "minimal"] as const,
  },
  {
    name: "Sophie Martin", handle: "sophie-martin",
    portraits: [unsplash("1494790108377-be9c29b29330", 700), "https://i.pravatar.cc/700?img=47"],
    backgrounds: ["Office", "Home", "Studio"], selectedBackground: "Office",
    styles: ["classic", "dynamic", "minimal", "elegant"] as const,
  },
  {
    name: "Marcus Lee", handle: "marcus-lee",
    portraits: [unsplash("1506794778202-cad84cf45f1d", 700), "https://i.pravatar.cc/700?img=59"],
    backgrounds: ["Home", "Office", "Outdoor", "Studio"], selectedBackground: "Home",
    styles: ["classic", "dynamic", "minimal"] as const,
  },
  {
    name: "Emily Chen", handle: "emily-chen",
    portraits: [unsplash("1438761681033-6461ffad8d80", 700), "https://i.pravatar.cc/700?img=44"],
    backgrounds: ["Studio", "Home", "Office"], selectedBackground: "Studio",
    styles: ["classic", "dynamic", "minimal"] as const,
  },
];

async function fetchImage(urls: string[]): Promise<{ bytes: Buffer; mime: string }> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`${res.status} for ${url}`);
      const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
      if (!/^image\//.test(mime)) throw new Error(`not an image: ${mime}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 2_000) throw new Error(`suspiciously small (${bytes.length}B)`);
      return { bytes, mime };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main() {
  const presets = subtitleStylePresets();
  for (const spec of AVATARS) {
    const [existing] = await db.select({ id: t.personas.id }).from(t.personas).where(eq(t.personas.name, spec.name));
    if (existing) {
      console.log(`skip ${spec.name} (exists as #${existing.id})`);
      continue;
    }
    const portrait = await fetchImage(spec.portraits);
    const [persona] = await db.insert(t.personas).values({
      name: spec.name,
      handle: spec.handle,
      audience: "Health-curious short-form viewers",
      tone: "Direct, warm, credible",
      backstory: `${spec.name} presents carnivore-lifestyle stories on camera.`,
      angle: "Personal transformation through diet",
      problem: "Modern diets leave people tired and unwell",
      voiceId: null,
      photo: portrait.bytes,
      photoMime: portrait.mime,
      photoUpdatedAt: new Date(),
      active: true,
    }).returning({ id: t.personas.id });
    console.log(`created ${spec.name} → persona #${persona.id} (portrait ${portrait.bytes.length}B ${portrait.mime})`);

    for (const label of spec.backgrounds) {
      const image = await fetchImage(BACKGROUND_URLS[label]);
      await db.insert(t.personaBackgrounds).values({
        personaId: persona.id,
        label,
        image: image.bytes,
        imageMime: image.mime,
        selected: label === spec.selectedBackground,
      });
      console.log(`  background ${label} (${image.bytes.length}B)`);
    }

    for (const [i, key] of spec.styles.entries()) {
      await db.insert(t.subtitleStyles).values({
        personaId: persona.id,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        config: presets[key],
        selected: i === 0,
      });
    }
    console.log(`  styles: ${spec.styles.join(", ")}`);
  }
  const check = await db.select({ id: t.personas.id, name: t.personas.name }).from(t.personas);
  console.log(`done — ${check.length} personas total`);
  await pool.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
