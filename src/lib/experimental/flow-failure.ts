import { classifyFlowFailure } from "./flow-rotate";

export type FlowFailureKind =
  | "credits"
  | "expired"
  | "blocked"
  | "no_account"
  | "worker_down"
  | "character_missing"
  | "render_unavailable"
  | "timeout"
  | "duplicate"
  | "settings"
  | "attach"
  | "prompt"
  | "empty"
  | "recovery_exhausted"
  | "ui"
  | "other";

export type FlowFailure = {
  kind: FlowFailureKind;
  title: string;
  detail: string;
  action?: { label: string; href: string };
  retryable: boolean;
};

const CODE_TO_KIND: Record<string, FlowFailureKind> = {
  CREDITS: "credits",
  EXPIRED: "expired",
  BLOCKED: "blocked",
  PROJECT_CREDITS_WARNING: "blocked",
  CHARACTER_MISSING: "character_missing",
  GENDER_MISSING: "character_missing",
  RENDER_UNAVAILABLE: "render_unavailable",
  MEDIA_LOAD_FAILED: "render_unavailable",
  TIMEOUT: "timeout",
  DUPLICATE: "duplicate",
  SETTINGS: "settings",
  ATTACH: "attach",
  PROMPT: "prompt",
  NO_START: "ui",
  UI: "ui",
  RECOVERY_EXHAUSTED: "recovery_exhausted",
  VIDEO_MISSING: "render_unavailable",
  CLIPS_INCOMPLETE: "render_unavailable",
};

const KIND_COPY: Record<FlowFailureKind, Omit<FlowFailure, "kind">> = {
  credits: {
    title: "Out of Flow credits",
    detail: "This Google account is out of Flow credits. Add credits or connect another account in Settings.",
    action: { label: "Settings", href: "/settings" },
    retryable: true,
  },
  expired: {
    title: "Flow session expired",
    detail: "Reconnect this Google account in Settings, then regenerate.",
    action: { label: "Settings", href: "/settings" },
    retryable: true,
  },
  blocked: {
    title: "Flow paused this account",
    detail: "Google flagged unusual activity. Wait ~20 minutes or use another account.",
    action: { label: "Settings", href: "/settings" },
    retryable: true,
  },
  no_account: {
    title: "No Flow account ready",
    detail: "Connect a Google account with Flow credits in Settings.",
    action: { label: "Settings", href: "/settings" },
    retryable: true,
  },
  worker_down: {
    title: "Flow worker unavailable",
    detail: "The generation worker isn't reachable. Check the worker container / FLOW_WORKER_URL.",
    action: { label: "Settings", href: "/settings" },
    retryable: true,
  },
  character_missing: {
    title: "No character reference",
    detail: "Add an avatar photo to this persona in Personas, or create the character in Flow.",
    action: { label: "Personas", href: "/personas" },
    retryable: false,
  },
  render_unavailable: {
    title: "Flow render was lost",
    detail: "Flow charged the clip but produced no downloadable video. Regenerate the affected clip.",
    retryable: true,
  },
  timeout: {
    title: "Generation timed out",
    detail: "Flow didn't finish in time. Saved clips are kept — regenerate the rest.",
    retryable: true,
  },
  duplicate: {
    title: "Duplicate clip",
    detail: "Flow returned a repeat of an earlier clip. Regenerate this clip.",
    retryable: true,
  },
  settings: {
    title: "Flow settings unavailable",
    detail: "Flow's composer wouldn't accept the required 9:16/duration settings. Retry shortly.",
    retryable: true,
  },
  attach: {
    title: "Character or voice didn't attach",
    detail: "Flow couldn't attach the character or voice ingredient. Retry.",
    retryable: true,
  },
  prompt: {
    title: "Prompt not accepted",
    detail: "Flow rejected the dialogue text. Retry.",
    retryable: true,
  },
  empty: {
    title: "Empty video",
    detail: "Flow returned an empty file. Regenerate.",
    retryable: true,
  },
  recovery_exhausted: {
    title: "Gave up after retries",
    detail: "Automatic recovery hit its limit. Reconnect the account or regenerate manually.",
    action: { label: "Settings", href: "/settings" },
    retryable: true,
  },
  ui: {
    title: "Flow interface changed",
    detail: "An automation step failed on Flow's UI. Retry; if it persists, reconnect the account.",
    retryable: true,
  },
  other: {
    title: "Generation failed",
    detail: "", // filled per-call with message.slice(0,200)
    retryable: true,
  },
};

export function flowFailure(code: string | null | undefined, message: string): FlowFailure {
  // Step 1: Try direct code → kind mapping
  let kind: FlowFailureKind | undefined;
  if (code && code in CODE_TO_KIND) {
    kind = CODE_TO_KIND[code];
  }


  // Step 2: no direct code mapping (generic FLOW_TERMINAL wrapper included) — sniff the message
  if (!kind) {
    if (/not configured/i.test(message)) {
      kind = "worker_down";
    } else if (/no Flow account/i.test(message)) {
      kind = "no_account";
    } else if (/empty video/i.test(message)) {
      kind = "empty";
    } else {
      // Fall back to classifyFlowFailure for message-based classification
      const classified = classifyFlowFailure(message);
      kind = (classified as FlowFailureKind) || "other";
    }
  }

  // Step 3: Look up copy for this kind
  const copy = KIND_COPY[kind];
  if (kind === "other") {
    return {
      kind,
      title: copy.title,
      detail: message.slice(0, 200),
      retryable: copy.retryable,
    };
  }

  return { kind, ...copy };
}

export function describeFetchError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "An error occurred";
}
