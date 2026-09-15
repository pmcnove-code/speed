export type PlaywrightCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  url?: string;
};

export type PlaywrightStorageState = {
  cookies: PlaywrightCookie[];
  origins?: { origin: string; localStorage: { name: string; value: string }[] }[];
};

function asCookie(raw: unknown): PlaywrightCookie | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const name = typeof c.name === "string" ? c.name : typeof c.Name === "string" ? c.Name : "";
  const value = typeof c.value === "string" ? c.value : typeof c.Value === "string" ? c.Value : "";
  if (!name || !value) return null;
  const domain = typeof c.domain === "string" ? c.domain : typeof c.Domain === "string" ? c.Domain : undefined;
  const path = typeof c.path === "string" ? c.path : typeof c.Path === "string" ? c.Path : "/";
  const cookie: PlaywrightCookie = { name, value, path };
  if (domain) cookie.domain = domain;
  else if (typeof c.url === "string") cookie.url = c.url;
  else cookie.domain = ".google.com";
  if (typeof c.expires === "number") cookie.expires = c.expires;
  if (typeof c.httpOnly === "boolean") cookie.httpOnly = c.httpOnly;
  if (typeof c.secure === "boolean") cookie.secure = c.secure;
  if (c.sameSite === "Strict" || c.sameSite === "Lax" || c.sameSite === "None") cookie.sameSite = c.sameSite;
  return cookie;
}

/** Accept Playwright storageState or a cookie-export array. Never logs cookie values. */
export function parseStorageState(raw: unknown): { ok: true; state: PlaywrightStorageState } | { ok: false; error: string } {
  let parsed = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return { ok: false, error: "Paste a Playwright storageState.json (or cookie export)." };
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "Session JSON is not valid JSON." };
    }
  }
  if (Array.isArray(parsed)) {
    const cookies = parsed.map(asCookie).filter((c): c is PlaywrightCookie => Boolean(c));
    if (!cookies.length) return { ok: false, error: "Cookie export had no usable name/value pairs." };
    return { ok: true, state: { cookies, origins: [] } };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Session must be a Playwright storageState object or a cookie array." };
  }
  const obj = parsed as Record<string, unknown>;
  const list = Array.isArray(obj.cookies) ? obj.cookies : [];
  const cookies = list.map(asCookie).filter((c): c is PlaywrightCookie => Boolean(c));
  if (!cookies.length) {
    return { ok: false, error: "storageState.cookies is empty — log into Flow in a browser and export storageState.json." };
  }
  const origins = Array.isArray(obj.origins) ? obj.origins : [];
  return { ok: true, state: { cookies, origins: origins as PlaywrightStorageState["origins"] } };
}
