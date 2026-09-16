import {
  pgTable, serial, text, varchar, boolean, integer, timestamp, jsonb, customType, numeric,
} from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const accessCodes = pgTable("access_codes", {
  id: serial("id").primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  code: varchar("code", { length: 160 }),
  label: varchar("label", { length: 64 }).notNull(),
  role: varchar("role", { length: 16 }).notNull().default("member"), // 'admin' | 'member'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const personas = pgTable("personas", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  handle: varchar("handle", { length: 64 }).notNull().unique(), // slug used in prompts/dedup
  audience: text("audience").notNull(),
  tone: text("tone").notNull(),
  backstory: text("backstory").notNull(),
  angle: text("angle").notNull(),
  problem: text("problem").notNull(),
  intensity: varchar("intensity", { length: 16 }).notNull().default("bold"), // calm|bold|aggressive
  instructions: text("instructions"),
  emoji: varchar("emoji", { length: 8 }).notNull().default("🥩"),
  voiceId: varchar("voice_id", { length: 160 }),
  photo: bytea("photo"),
  photoMime: varchar("photo_mime", { length: 64 }),
  photoUpdatedAt: timestamp("photo_updated_at"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const formats = pgTable("formats", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  structure: text("structure").notNull(),
  length: text("length").notNull(),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
});

export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 24 }).notNull(),
  model: varchar("model", { length: 80 }).notNull(),
  countRequested: integer("count_requested").notNull(),
  personaIds: jsonb("persona_ids").$type<number[]>().notNull(),
  formatId: integer("format_id").notNull(),
  situation: text("situation"),
  status: varchar("status", { length: 16 }).notNull().default("queued"), // queued(scripts)|ready(scripts done)|running(videos)|done(validated)|error
  error: text("error"),
  usage: jsonb("usage").$type<{ input_tokens: number; output_tokens: number; total_tokens: number }>(),
  createdBy: varchar("created_by", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  airtableSentAt: timestamp("airtable_sent_at"),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  personaId: integer("persona_id").notNull(),
  hook: text("hook").notNull(),
  script: text("script").notNull(),
  onScreenText: jsonb("on_screen_text").$type<string[]>().notNull().default([]),
  cta: text("cta").notNull().default(""),
  videoBrief: text("video_brief").notNull().default(""),
  disclaimer: text("disclaimer").notNull().default(""),
  angleTag: varchar("angle_tag", { length: 80 }).notNull().default(""),
  alignScore: integer("align_score"),
  guardKept: boolean("guard_kept").notNull().default(true),
  guardReason: text("guard_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const jobEvents = pgTable("job_events", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  stage: varchar("stage", { length: 40 }).notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  ts: timestamp("ts").notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
});

export const personaKnowledge = pgTable("persona_knowledge", {
  id: serial("id").primaryKey(),
  personaId: integer("persona_id").notNull(),
  note: text("note").notNull(),
  sourcePostId: integer("source_post_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Owner-pasted source material (transcripts, notes, articles) used as copy fuel. */
export const knowledgeBase = pgTable("knowledge_base", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body").notNull(),
  digest: text("digest").notNull().default(""),
  sourceUrl: varchar("source_url", { length: 500 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const angleBank = pgTable("angle_bank", {
  id: serial("id").primaryKey(),
  theme: varchar("theme", { length: 64 }).notNull(),
  angle: text("angle").notNull(),
  fits: varchar("fits", { length: 120 }).notNull(), // comma slugs: gut|energy|midlife-women|budget-family|on-the-road|skin
});

export type ReelShot = {
  index: number;
  durationSec: number;
  spoken: string;
  onScreen: string;
  visual: string;
};

export const personaBackgrounds = pgTable("persona_backgrounds", {
  id: serial("id").primaryKey(),
  personaId: integer("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 80 }).notNull(),
  image: bytea("image").notNull(),
  imageMime: varchar("image_mime", { length: 64 }).notNull(),
  selected: boolean("selected").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type PersonaBackground = typeof personaBackgrounds.$inferSelect;

export const subtitleStyles = pgTable("subtitle_styles", {
  id: serial("id").primaryKey(),
  personaId: integer("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  config: jsonb("config").notNull(),
  selected: boolean("selected").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type SubtitleStyle = typeof subtitleStyles.$inferSelect;

export const reelJobs = pgTable("reel_jobs", {
  queuedAt: timestamp("queued_at").notNull().defaultNow(),
  id: serial("id").primaryKey(),
  status: varchar("status", { length: 16 }).notNull().default("queued"), // queued|running|done|error
  stage: varchar("stage", { length: 24 }).notNull().default("script"), // script|shots|clips|stitch
  stageDetail: text("stage_detail").notNull().default(""),
  error: text("error"),
  errorCode: varchar("error_code", { length: 40 }),
  partial: boolean("partial").notNull().default(false),
  postId: integer("post_id"),
  hook: text("hook").notNull(),
  script: text("script").notNull(),
  onScreenText: jsonb("on_screen_text").$type<string[]>().notNull().default([]),
  cta: text("cta").notNull().default(""),
  videoBrief: text("video_brief").notNull().default(""),
  storyboard: jsonb("storyboard").$type<ReelShot[]>(),
  characterGender: varchar("character_gender", { length: 16 }).$type<"male" | "female">(),
  referencePersonaId: integer("reference_persona_id"),
  referenceCharacter: varchar("reference_character", { length: 120 }),
  sceneDirection: jsonb("scene_direction").$type<import("@/lib/experimental/scenes").SceneDirection>(),
  video: bytea("video"),
  videoMime: varchar("video_mime", { length: 64 }),
  durationMs: integer("duration_ms"),
  model: varchar("model", { length: 80 }),
  workerJobId: varchar("worker_job_id", { length: 64 }),
  inputHash: varchar("input_hash", { length: 64 }),
  dispatchState: varchar("dispatch_state", { length: 24 }).notNull().default("pending"),
  dispatchStartedAt: timestamp("dispatch_started_at"),
  dispatchedAt: timestamp("dispatched_at"),
  workerHeartbeatAt: timestamp("worker_heartbeat_at"),
  leaseOwner: varchar("lease_owner", { length: 120 }),
  leaseExpiresAt: timestamp("lease_expires_at"),
  runnerAttempts: integer("runner_attempts").notNull().default(0),
  flowProjectUrl: varchar("flow_project_url", { length: 500 }),
  clipCheckpoint: jsonb("clip_checkpoint").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: varchar("created_by", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  validated: boolean("validated").notNull().default(false),
  validatedAt: timestamp("validated_at"),
  videoLabel: varchar("video_label", { length: 160 }),
});

export const scriptClips = pgTable("script_clips", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  clipNumber: varchar("clip_number", { length: 8 }).notNull(),
  duration: varchar("duration", { length: 4 }).notNull(),
  text: text("text").notNull(),
  wordCount: integer("word_count").notNull(),
  estimatedTimeSec: numeric("estimated_time_sec").notNull(),
  fillRatio: numeric("fill_ratio").notNull(),
  generationPrompt: text("generation_prompt").notNull(),
  internalBreaks: integer("internal_breaks").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});


export type PersonaRow = typeof personas.$inferSelect;
export type Persona = Omit<PersonaRow, "photo">;
export type Format = typeof formats.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type KnowledgeEntry = typeof knowledgeBase.$inferSelect;
export type ReelJobRow = typeof reelJobs.$inferSelect;
export type ReelJob = Omit<ReelJobRow, "video">;

/** All persona columns except the binary photo blob. */
export function personaPublicColumns() {
  const { photo: _photo, ...cols } = getTableColumns(personas);
  return cols;
}

/** Reel job columns except the binary video blob. */
export function reelJobPublicColumns() {
  const { video: _video, ...cols } = getTableColumns(reelJobs);
  return cols;
}
