const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SIGNED_IN_AS_RE = /signed in as[:\s]+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;

/** Local-parts that are never a signed-in user, on any domain. */
const JUNK_LOCAL =
  /^(legal-notices|legal|support|help|noreply|no-reply|no_reply|mail-noreply|accounts-noreply|donotreply|do-not-reply|mailer-daemon|abuse|postmaster|privacy|copyright|webmaster|press|info|geniettsupport)$/i;

const CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "hey.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "mail.com",
]);

function resetEmailRe() {
  EMAIL_RE.lastIndex = 0;
}

function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/** Google's own mailboxes — never a Flow customer. */
export function isGoogleDotCom(domain: string): boolean {
  return /^(google\.com)$/i.test(domain) || /\.google\.com$/i.test(domain);
}

/** Real user emails only. Never *@google.com (legal-notices, marketing-governance, team inboxes). */
export function tidyEmail(email: string | null | undefined): string {
  let value = String(email || "").trim();
  value = value.replace(/^x22/i, "");
  value = value.replace(/^["'`]+|["'`]+$/g, "");
  return value.trim();
}

export function isAccountEmail(email: string | null | undefined): email is string {
  if (typeof email !== "string") return false;
  const value = tidyEmail(email);
  if (!value || value.length > 254) return false;
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) return false;
  const parts = splitEmail(value);
  if (!parts) return false;
  if (isGoogleDotCom(parts.domain)) return false;
  if (JUNK_LOCAL.test(parts.local)) return false;
  if (/^(support|noreply|no-reply|no_reply)/i.test(parts.local)) return false;
  if (/noreply|no-reply|no_reply/i.test(parts.local)) return false;
  return true;
}

export function displayAccountEmail(email: string | null | undefined): string | null {
  const value = tidyEmail(email);
  return isAccountEmail(value) ? value : null;
}

/** Account label for UI — hide leftover *@google.com / system mailboxes used as a name. */
export function displayAccountLabel(label: string | null | undefined): string | null {
  if (typeof label !== "string") return null;
  const value = label.trim();
  if (!value) return null;
  if (/@/.test(value) && !isAccountEmail(value)) return null;
  return value;
}

export function emailsFromText(text: string | null | undefined): string[] {
  resetEmailRe();
  return [...String(text || "").matchAll(EMAIL_RE)].map((m) => m[0]);
}

/**
 * High-confidence picker line only: "Signed in as you@gmail.com".
 * Rejects *@google.com the same as isAccountEmail.
 */
export function extractSignedInAs(text: string | null | undefined): string | null {
  const match = String(text || "").match(SIGNED_IN_AS_RE);
  return match ? displayAccountEmail(match[1]) : null;
}

/** Lower is better. Prefer Gmail / consumer, then Workspace. Never @google.com. */
export function emailPreference(email: string): number {
  const parts = splitEmail(email.trim());
  const domain = parts?.domain.toLowerCase() ?? "";
  if (CONSUMER_DOMAINS.has(domain)) return 0;
  return 1;
}

function bestAccountEmail(emails: string[]): string | null {
  let best: string | null = null;
  let bestRank = Infinity;
  for (const email of emails) {
    if (!isAccountEmail(email)) continue;
    const rank = emailPreference(email);
    if (rank < bestRank) {
      best = email.trim();
      bestRank = rank;
    }
  }
  return best;
}

/** First real account email across sources. Never *@google.com. */
export function pickAccountEmail(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (Array.isArray(candidate)) {
      const nested = pickAccountEmail(...candidate);
      if (nested) return nested;
      continue;
    }
    if (typeof candidate === "string") {
      const signedIn = extractSignedInAs(candidate);
      if (signedIn) return signedIn;
      if (isAccountEmail(candidate)) return candidate.trim();
      const best = bestAccountEmail(emailsFromText(candidate));
      if (best) return best;
    }
  }
  return null;
}
