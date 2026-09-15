import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";
import { adminCount, hashCode, listAccessCodes, normalizeRole } from "@/lib/access-codes";
import { providerInfos } from "@/lib/llm/provider";
import { airtableConfig, clearAirtableWriteModeCache } from "@/lib/airtable";
import { clearAirtableSchemaCache, ensurePostTableSchema } from "@/lib/airtable-schema";
import { getSetting, publicConfig, saveConfig } from "@/lib/config";

async function payload() {
  return {
    providers: await providerInfos(),
    airtable: await airtableConfig(),
    fields: await publicConfig(),
    codes: await listAccessCodes(),
  };
}

function uniqueCodeError(e: unknown) {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("access_codes_code_hash") || msg.includes("unique")) {
    return NextResponse.json({ error: "that access code is already in use" }, { status: 409 });
  }
  throw e;
}

export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  return NextResponse.json(await payload());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));

  if (b.action === "createCode") {
    if (!b.code || !b.label) return NextResponse.json({ error: "code and label required" }, { status: 400 });
    const role = normalizeRole(b.role);
    const code = String(b.code).trim();
    const label = String(b.label).trim();
    if (!code || !label) return NextResponse.json({ error: "code and label required" }, { status: 400 });
    try {
      await db.insert(t.accessCodes).values({ codeHash: hashCode(code), code, label, role });
    } catch (e) {
      return uniqueCodeError(e);
    }
    return NextResponse.json({ ok: true, codes: await listAccessCodes() });
  }

  if (b.action === "updateCode") {
    const id = Number(b.id);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const existing = (await db.select().from(t.accessCodes).where(eq(t.accessCodes.id, id)))[0];
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    const label = typeof b.label === "string" && b.label.trim() ? b.label.trim() : existing.label;
    const role = b.role === undefined ? existing.role : normalizeRole(b.role);
    const nextCode = typeof b.code === "string" ? b.code.trim() : "";

    if (existing.role === "admin" && role !== "admin" && (await adminCount()) <= 1) {
      return NextResponse.json({ error: "keep at least one admin code" }, { status: 400 });
    }

    const patch: { label: string; role: string; code?: string; codeHash?: string } = { label, role };
    if (nextCode) {
      patch.code = nextCode;
      patch.codeHash = hashCode(nextCode);
    }
    try {
      await db.update(t.accessCodes).set(patch).where(eq(t.accessCodes.id, id));
    } catch (e) {
      return uniqueCodeError(e);
    }
    return NextResponse.json({ ok: true, codes: await listAccessCodes() });
  }

  if (b.action === "deleteCode") {
    const id = Number(b.id);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const existing = (await db.select().from(t.accessCodes).where(eq(t.accessCodes.id, id)))[0];
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (existing.role === "admin" && (await adminCount()) <= 1) {
      return NextResponse.json({ error: "keep at least one admin code" }, { status: 400 });
    }
    await db.delete(t.accessCodes).where(eq(t.accessCodes.id, id));
    return NextResponse.json({ ok: true, codes: await listAccessCodes() });
  }

  if (b.action === "saveConfig") {
    const values = b.values && typeof b.values === "object" ? (b.values as Record<string, string>) : {};
    const before = {
      token: await getSetting("AIRTABLE_TOKEN"),
      baseId: await getSetting("AIRTABLE_BASE_ID"),
      table: await getSetting("AIRTABLE_TABLE"),
    };
    const result = await saveConfig(values);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    const after = {
      token: await getSetting("AIRTABLE_TOKEN"),
      baseId: await getSetting("AIRTABLE_BASE_ID"),
      table: await getSetting("AIRTABLE_TABLE"),
    };
    const airtableChanged =
      before.token !== after.token || before.baseId !== after.baseId || before.table !== after.table;
    clearAirtableSchemaCache();
    clearAirtableWriteModeCache();
    const airtable = await airtableConfig();
    const airtableSchema =
      airtable.ready && airtableChanged ? await ensurePostTableSchema({ force: true, reset: true }) : undefined;
    return NextResponse.json({
      ok: true,
      fields: await publicConfig(),
      providers: await providerInfos(),
      airtable,
      airtableSchema,
    });
  }

  if (b.action === "syncAirtable") {
    clearAirtableSchemaCache();
    clearAirtableWriteModeCache();
    const airtableSchema = await ensurePostTableSchema({ force: true, reset: true });
    return NextResponse.json(
      {
        ok: airtableSchema.ok,
        airtable: await airtableConfig(),
        fields: await publicConfig(),
        airtableSchema,
      },
      { status: airtableSchema.ok ? 200 : 422 },
    );
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
