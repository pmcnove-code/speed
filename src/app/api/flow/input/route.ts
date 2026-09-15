import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendFlowLoginInput } from "@/lib/experimental/flow-worker";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  try {
    const { id: _id, ...input } = body;
    await sendFlowLoginInput(id, input);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
