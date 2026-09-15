import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { providerFlags } from "@/lib/llm/provider";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    session,
    providers: await providerFlags(),
  });
}
