import { displayAccountEmail } from "./flow-identity";
import { flowReadyFromStatus, type FlowAccount, type FlowLogin, type FlowStatus } from "./flow-rotate";
import { parseStorageState } from "./flow-session";

export type { FlowAccount, FlowAccountStatus, FlowLogin, FlowStatus } from "./flow-rotate";
export { flowReadyFromStatus };

export type FlowJob = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  stage: string;
  stageDetail: string;
  error: string | null;
  errorCode?: string | null;
  accountId: string | null;
  accountLabel: string | null;
  hasVideo: boolean;
  clipsReady?: boolean;
  recoveryRevision?: number;
  partialClips?: boolean;
  queueAhead?: number;
  inputHash?: string | null;
  heartbeatAt?: string | null;
  projectUrl?: string | null;
  clipId?: string | null;
  clipState?: Record<string, unknown> | null;
};

function workerUrl(): string {
  return (process.env.FLOW_WORKER_URL ?? "").trim().replace(/\/$/, "");
}

function workerSecret(): string {
  return (process.env.FLOW_WORKER_SECRET ?? "").trim();
}

export function flowWorkerConfigured(): boolean {
  return Boolean(workerUrl() && workerSecret());
}

async function workerFetch(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const base = workerUrl();
  const secret = workerSecret();
  if (!base || !secret) throw new Error("Flow worker is not configured.");
  const headers = new Headers(init.headers);
  headers.set("x-flow-secret", secret);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
}

function emptyStatus(error?: string): FlowStatus {
  return { configured: flowWorkerConfigured(), worker: false, accounts: [], lastPickedId: null, error };
}

export async function getFlowStatus(): Promise<FlowStatus> {
  if (!flowWorkerConfigured()) return emptyStatus("FLOW_WORKER_URL and FLOW_WORKER_SECRET are not set.");
  try {
    const res = await workerFetch("/accounts", { method: "GET" }, 4000);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return emptyStatus(typeof body.error === "string" ? body.error : `Worker HTTP ${res.status}`);
    }
    const body = (await res.json()) as { accounts?: FlowAccount[]; lastPickedId?: string | null };
    const accounts = Array.isArray(body.accounts) ? body.accounts : [];
    return {
      configured: true,
      worker: true,
      accounts: accounts.map((account) => ({ ...account, email: displayAccountEmail(account.email) })),
      lastPickedId: body.lastPickedId ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return emptyStatus(message.includes("Timeout") || message.includes("abort") ? "Flow worker is not reachable." : message);
  }
}

export async function isFlowReady(): Promise<boolean> {
  return flowReadyFromStatus(await getFlowStatus());
}

export async function createFlowAccount(label: string): Promise<FlowStatus> {
  const res = await workerFetch("/accounts", { method: "POST", body: JSON.stringify({ label }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not add Flow account.");
  return getFlowStatus();
}

export async function updateFlowAccount(id: string, patch: { label?: string }): Promise<FlowStatus> {
  const res = await workerFetch(`/accounts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not update Flow account.");
  return getFlowStatus();
}

export async function removeFlowAccount(id: string): Promise<FlowStatus> {
  const res = await workerFetch(`/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not remove Flow account.");
  return getFlowStatus();
}

export async function saveFlowSession(id: string, raw: unknown): Promise<FlowStatus> {
  const parsed = parseStorageState(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  const res = await workerFetch(`/accounts/${encodeURIComponent(id)}/session`, {
    method: "POST",
    body: JSON.stringify(parsed.state),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not save Flow session.");
  return getFlowStatus();
}

export async function disconnectFlowSession(id: string): Promise<FlowStatus> {
  const res = await workerFetch(`/accounts/${encodeURIComponent(id)}/session`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not disconnect Flow session.");
  return getFlowStatus();
}

export async function probeFlowAccount(id: string): Promise<FlowStatus> {
  const res = await workerFetch(`/accounts/${encodeURIComponent(id)}/probe`, { method: "POST" }, 45_000);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not probe Flow session.");
  return getFlowStatus();
}

function publicLogin(login: FlowLogin | undefined): FlowLogin {
  if (!login) return { active: false };
  return { ...login, email: displayAccountEmail(login.email) };
}

export async function startFlowLogin(id: string): Promise<FlowLogin> {
  const res = await workerFetch(`/accounts/${encodeURIComponent(id)}/login`, { method: "POST" }, 120_000);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not start Flow sign-in.");
  return publicLogin(body.login);
}

export async function getFlowLogin(id: string): Promise<FlowLogin> {
  const res = await workerFetch(`/accounts/${encodeURIComponent(id)}/login`, { method: "GET" }, 8_000);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not read Flow sign-in.");
  return publicLogin(body.login);
}

export async function stopFlowLogin(id: string): Promise<void> {
  const res = await workerFetch(`/accounts/${encodeURIComponent(id)}/login`, { method: "DELETE" }, 15_000);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not stop Flow sign-in.");
  }
}

export async function confirmFlowLogin(id: string): Promise<FlowLogin> {
  const res = await workerFetch(
    `/accounts/${encodeURIComponent(id)}/login`,
    { method: "POST", body: JSON.stringify({ action: "confirm" }) },
    60_000,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not save Flow sign-in.");
  return publicLogin(body.login);
}

export async function fetchFlowLoginFrame(id: string): Promise<Buffer | null> {
  const res = await workerFetch(`/accounts/${encodeURIComponent(id)}/login/frame`, { method: "GET" }, 12_000);
  if (res.status === 204) return null;
  if (!res.ok) throw new Error("Could not capture Flow sign-in.");
  return Buffer.from(await res.arrayBuffer());
}

export async function sendFlowLoginInput(id: string, body: Record<string, unknown>): Promise<void> {
  const res = await workerFetch(
    `/accounts/${encodeURIComponent(id)}/login/input`,
    { method: "POST", body: JSON.stringify(body) },
    8_000,
  );
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Could not send sign-in input.");
  }
}

export async function submitFlowJob(input: {
  idempotencyKey: string;
  reelJobId: number;
  characterGender?: "male" | "female";
  hook: string;
  script: string;
  captions: string[];
  onScreenText?: string[];
  cta?: string;
  videoBrief?: string;
  sceneDirection?: import("./scenes").SceneDirection | null;
  personaId?: number | null;
  personaName?: string;
  personaHandle?: string;
  voiceName?: string;
  avatarUrl?: string;
  brainKey?: string;
  brainProject?: string;
  brainModel?: string;
  deepgramKey?: string;
  deepgramModel?: string;
  geminiKey?: string;
  geminiModel?: string;
  clips?: {
    id: string;
    spoken: string;
    prompt: string;
    durationSec: number;
    onScreen?: string;
    hold?: boolean;
    ctaBeat?: boolean;
  }[];
}): Promise<FlowJob> {
  const res = await workerFetch(
    "/jobs",
    {
      method: "POST",
      headers: { "x-idempotency-key": input.idempotencyKey },
      body: JSON.stringify(input),
    },
    20_000,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Flow worker rejected the job.");
  return body.job as FlowJob;
}

export async function getFlowJob(id: string): Promise<FlowJob> {
  const res = await workerFetch(`/jobs/${encodeURIComponent(id)}`, { method: "GET" }, 10_000);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Flow job not found.");
  return body.job as FlowJob;
}

export async function downloadFlowVideo(id: string): Promise<Buffer> {
  const res = await workerFetch(`/jobs/${encodeURIComponent(id)}/video`, { method: "GET" }, 180_000);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Flow video is not ready.");
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function flowEditRequest(workerJobId: string, suffix = "", body?: unknown): Promise<Response> {
  return workerFetch(`/jobs/${encodeURIComponent(workerJobId)}/edits${suffix}`, body === undefined
    ? {method:"GET"} : {method:"POST",body:JSON.stringify(body)}, suffix.endsWith("/video") ? 180_000 : 20_000);
}

export async function flowClipsRequest(workerJobId:string,clipId?:string):Promise<Response> {
  return workerFetch(`/jobs/${encodeURIComponent(workerJobId)}/clips${clipId?`/${encodeURIComponent(clipId)}/video`:''}`,{method:'GET'},clipId?180_000:30_000);
}

export async function regenerateFlowClips(workerJobId:string,requestId:string,clipId?:string):Promise<Response> {
 return workerFetch(`/jobs/${encodeURIComponent(workerJobId)}/clips/regenerate`,{method:'POST',body:JSON.stringify({requestId,...(clipId?{clipId}:{})})},30_000);
}
