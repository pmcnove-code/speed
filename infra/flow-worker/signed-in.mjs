/** True when this URL is Google’s actual sign-in / 2FA, not a leftover GIS iframe. */
export function isGoogleLoginUrl(url) {
  const u = String(url || "");
  if (!/accounts\.google\.com|ServiceLogin/i.test(u)) return false;
  if (/\/gsi\/|oauth2\/iframe|RotateCookiesPage|CheckCookiePage/i.test(u)) return false;
  return /signin|ServiceLogin|identifier|challenge|pwd|totp|weauth|speedbump|consent|accountchooser/i.test(u);
}

/** Flow rate-limit / abuse banner — stop retrying or Google holds the account. */
export function looksFlowBlocked(text) {
  const value = String(text || "");
  return /unusual activity/i.test(value) ||
    (/can(?:not|'t) create videos? right now/i.test(value) && /help cent(?:re|er)/i.test(value));
}

/** Google login / interstitial — never treat as Flow home. */
export function looksSignedOut(url, text) {
  if (isGoogleLoginUrl(url)) return true;
  const t = String(text || "");
  if (/email or phone|forgot email|sign in with google|choose an account|use your google account/i.test(t)) {
    return true;
  }
  if (/to continue to\b/i.test(t) && /sign in/i.test(t)) return true;
  return /sign in to continue/i.test(t) && /sign in/i.test(t);
}

/** Flow app URL only — not accounts.google.com, not a flash of google.com. */
export function isFlowAppUrl(url) {
  const u = String(url || "");
  if (/accounts\.google\.com|ServiceLogin|signin\/v2|CheckCookie|oauth/i.test(u)) return false;
  // /about is Flow's public marketing/pricing page, not the signed-in app.
  // An invalid session gets bounced here, and that page's own feature/plan
  // copy (e.g. "Ingredients to Video") can otherwise false-positive match
  // looksLoggedInToFlow's app-UI keywords.
  if (/flow\.google(?:\.com)?\/about(?:[/?]|$)/i.test(u)) return false;
  return /labs\.google\/fx\/tools\/flow|flow\.google(?:\.com)?(?:\/|$|\?)/i.test(u);
}

/** Inside a project (`/project/id`) where the prompt box lives. */
export function isFlowProjectUrl(url) {
  return /flow\.google(?:\.com)?\/project\//i.test(String(url || ""));
}

/**
 * True only when we are on Flow and the project UI is up
 * (New project / prompt / Ingredients) — not a marketing page, footer email, or login interstitial.
 */
export function looksLoggedInToFlow(url, text) {
  if (!isFlowAppUrl(url)) return false;
  if (looksSignedOut(url, text)) return false;
  const t = String(text || "");
  if (!t.trim()) return false;
  if (/email or phone|sign in with google|forgot email|choose an account/i.test(t)) return false;
  return /(?:^|\b)new project\b|your projects|add a prompt|enter a prompt|\bingredients\b|what do you want to create|start creating|all media/i.test(
    t,
  );
}
