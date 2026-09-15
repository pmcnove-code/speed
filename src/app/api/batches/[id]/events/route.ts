import { and, eq, gt } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Server-Sent Events: polls job_events for this batch and streams new rows until the
// batch reaches a terminal state. Keeps the UI pipeline animation synced to real stages.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });
  const batchId = Number((await params).id);
  if (!batchId) return new Response("bad id", { status: 400 });

  const encoder = new TextEncoder();
  let lastId = 0;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      send("hello", { batchId });

      while (!closed) {
        const events = await db
          .select()
          .from(t.jobEvents)
          .where(and(eq(t.jobEvents.batchId, batchId), gt(t.jobEvents.id, lastId)))
          .orderBy(t.jobEvents.id);

        for (const ev of events) {
          lastId = ev.id;
          send("stage", { stage: ev.stage, detail: ev.detail, ts: ev.ts });
        }

        const terminal = events.find((e) => e.stage === "done" || e.stage === "error");
        if (terminal) {
          send("end", { stage: terminal.stage, detail: terminal.detail });
          break;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      controller.close();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
