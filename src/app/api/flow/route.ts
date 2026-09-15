import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createFlowAccount,
  disconnectFlowSession,
  getFlowLogin,
  getFlowStatus,
  probeFlowAccount,
  removeFlowAccount,
  saveFlowSession,
  startFlowLogin,
  stopFlowLogin,
  confirmFlowLogin,
  updateFlowAccount,
} from "@/lib/experimental/flow-worker";

export const runtime = "nodejs";
export const maxDuration = 180;

async function requireAdmin() {
  const session = await getSession();
  if (session?.role !== "admin") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "admin only" }, { status: 403 });
  return NextResponse.json(await getFlowStatus());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "createAccount") return NextResponse.json(await createFlowAccount(String(b.label ?? "")));
    if (b.action === "updateAccount") {
      return NextResponse.json(await updateFlowAccount(String(b.id ?? ""), { label: b.label }));
    }
    if (b.action === "removeAccount") return NextResponse.json(await removeFlowAccount(String(b.id ?? "")));
    if (b.action === "saveSession") return NextResponse.json(await saveFlowSession(String(b.id ?? ""), b.storageState));
    if (b.action === "disconnect") return NextResponse.json(await disconnectFlowSession(String(b.id ?? "")));
    if (b.action === "probe") return NextResponse.json(await probeFlowAccount(String(b.id ?? "")));
    if (b.action === "startLogin") {
      const login = await startFlowLogin(String(b.id ?? ""));
      return NextResponse.json({ login, ...(await getFlowStatus()) });
    }
    if (b.action === "loginStatus") {
      const login = await getFlowLogin(String(b.id ?? ""));
      return NextResponse.json({ login, ...(await getFlowStatus()) });
    }
    if (b.action === "stopLogin") {
      await stopFlowLogin(String(b.id ?? ""));
      return NextResponse.json({ login: { active: false }, ...(await getFlowStatus()) });
    }
    if (b.action === "confirmLogin") {
      const login = await confirmFlowLogin(String(b.id ?? ""));
      return NextResponse.json({ login, ...(await getFlowStatus()) });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
