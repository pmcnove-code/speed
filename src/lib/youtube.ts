/** YouTube URL parsing and caption/transcript text helpers — no I/O. */

const ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeId(raw: string): string | null {
  const trimmed = raw.trim();
  if (ID_RE.test(trimmed)) return trimmed;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0]?.slice(0, 11);
      return id && ID_RE.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      if (v && ID_RE.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      if ((parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") && parts[1] && ID_RE.test(parts[1])) {
        return parts[1];
      }
    }
  } catch {
    /* fall through */
  }
  const m = trimmed.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}

export function canonicalYouTubeUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

type CaptionEvent = { segs?: Array<{ utf8?: string }> };

export function transcriptFromCaptionJson3(raw: unknown): string {
  const events = (raw as { events?: CaptionEvent[] })?.events;
  if (!Array.isArray(events)) return "";
  const lines: string[] = [];
  for (const ev of events) {
    if (!ev?.segs?.length) continue;
    const bit = ev.segs.map((s) => s.utf8 ?? "").join("");
    if (bit.trim()) lines.push(bit.replace(/\n+/g, " ").trim());
  }
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

export function transcriptFromVtt(vtt: string): string {
  const lines = vtt
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      if (!t || t.startsWith("WEBVTT") || t.startsWith("NOTE") || t.startsWith("Kind:") || t.startsWith("Language:")) return false;
      if (/^\d+$/.test(t)) return false;
      if (/-->/.test(t)) return false;
      return true;
    })
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

/** Parse { transcript: string | [{text}] } payloads from caption relays. */
export function transcriptFromRelayPayload(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as { transcript?: unknown; text?: unknown };
  const t = o.transcript ?? o.text;
  if (typeof t === "string") return t.replace(/\s+/g, " ").trim();
  if (Array.isArray(t)) {
    const bits = t.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) {
        const text = (item as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    });
    return bits.join(" ").replace(/\s+/g, " ").trim();
  }
  return "";
}

export function transcriptFromDeepgram(data: unknown): string {
  const root = data as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{
          transcript?: string;
          paragraphs?: { transcript?: string };
        }>;
      }>;
    };
  };
  const alt = root?.results?.channels?.[0]?.alternatives?.[0];
  const para = alt?.paragraphs?.transcript?.trim();
  if (para) return para;
  return (alt?.transcript ?? "").trim();
}
