export type FlowAccountStatus = "connected" | "expired" | "no_credits" | "blocked" | "unknown";

export type FlowAccountPick = {
  id: string;
  connected: boolean;
  status: FlowAccountStatus;
  creditsRemaining: number | null;
  lastUsed: string | null;
  restingUntil: string | null;
};

export type FlowAccount = FlowAccountPick & {
  label: string;
  email?: string | null;
  lastError: string | null;
  lastChecked: string | null;
};

export type FlowLogin = {
  active: boolean;
  accountId?: string;
  status?: "starting" | "waiting" | "connected" | "error";
  email?: string | null;
  error?: string | null;
  pageUrl?: string;
  desk?: boolean;
  expiresAt?: number;
  otherAccountId?: string;
};

export type FlowStatus = {
  configured: boolean;
  worker: boolean;
  accounts: FlowAccount[];
  lastPickedId: string | null;
  error?: string;
};

/** Keep connected sessions available for an explicit manual retry, including
 * after a rejection. Stored credits/status are last-seen hints, not a live
 * truth source (Flow's own in-composer state can disagree with the account
 * homepage) — a live generation attempt is the real arbiter, so only a dead
 * (expired) or disconnected session is excluded here. A time-boxed
 * `restingUntil` cooldown is the one exception: it's set only after a
 * confirmed same-wall-every-attempt rate-limit/abuse-hold signal, where
 * immediate retry is proven pointless rather than merely stale. */
export function isUsableAccount(account: FlowAccountPick): boolean {
  if (!account.connected) return false;
  if (account.status === "expired") return false;
  if (account.restingUntil && Date.parse(account.restingUntil) > Date.now()) return false;
  return true;
}

/**
 * Round-robin among accounts that still have credits (or unknown-but-connected).
 * Oldest lastUsed first; lastPickedId is rotated to the end so we do not reuse immediately.
 */
export function orderAccountsForRotate(
  accounts: FlowAccountPick[],
  lastPickedId?: string | null,
): FlowAccountPick[] {
  const usable = accounts.filter(isUsableAccount).sort((a, b) => {
    const ta = a.lastUsed ? Date.parse(a.lastUsed) || 0 : 0;
    const tb = b.lastUsed ? Date.parse(b.lastUsed) || 0 : 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  if (lastPickedId && usable.length > 1 && usable[0]?.id === lastPickedId) {
    const first = usable.shift();
    if (first) usable.push(first);
  }
  return usable;
}

export function classifyFlowFailure(message: string): "credits" | "expired" | "blocked" | "ui" | "other" {
  const msg = message.toLowerCase();
  if (/out of credits|no credits|not enough credits|insufficient credits|credit limit/i.test(msg)) {
    return "credits";
  }
  if (/unusual activity|flow paused this google account/i.test(msg)) return "blocked";
  if (/session expired|sign in|not logged|login required|reconnect/i.test(msg) && /session|sign in|logged|reconnect/i.test(msg)) {
    return /ui changed/i.test(msg) ? "ui" : "expired";
  }
  if (/flow ui changed|could not attach|could not fill the prompt|could not start generate|could not download/i.test(msg)) {
    return "ui";
  }
  if (/session expired/i.test(msg)) return "expired";
  return "other";
}

export function flowReadyFromStatus(status: FlowStatus): boolean {
  return status.worker && status.accounts.some(isUsableAccount);
}
