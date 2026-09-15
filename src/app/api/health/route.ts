import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, t } from "@/db";
import {
  flowWorkerConfigured,
  getFlowStatus,
} from "@/lib/experimental/flow-worker";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  let runnerHeartbeat: string | null = null;
  try {
    await db.execute(sql`select 1`);
    database = true;
    const [runner] = await db
      .select({ value: t.appSettings.value })
      .from(t.appSettings)
      .where(eq(t.appSettings.key, "reel_runner_heartbeat"))
      .limit(1);
    const parsed = runner?.value ? JSON.parse(runner.value) : null;
    runnerHeartbeat = typeof parsed?.at === "string" ? parsed.at : null;
  } catch {
    database = false;
  }

  const configured = flowWorkerConfigured();
  const flow = configured ? await getFlowStatus() : null;
  const worker = configured ? Boolean(flow?.worker) : true;
  const runnerFresh = runnerHeartbeat
    ? Date.now() - new Date(runnerHeartbeat).getTime() < 60_000
    : false;
  const ok = database && worker;

  return NextResponse.json(
    {
      ok,
      database,
      flowWorker: worker,
      runner: runnerFresh,
      runnerHeartbeat,
    },
    { status: ok ? 200 : 503 },
  );
}
