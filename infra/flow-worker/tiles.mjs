/** New Flow All-media tiles are portrait ~141×250. Old filter required width ≥ 160 and skipped them. */
export function isGridClipTile(r) {
  if (!r) return false;
  const w = Number(r.width);
  const h = Number(r.height);
  const left = Number(r.left ?? r.x ?? 0);
  const top = Number(r.top ?? r.y ?? 0);
  if (w < 100 || w > 480) return false;
  if (h < 140 || h > 780) return false;
  if (left < 70 || top < 36) return false;
  return h > w * 0.9;
}

const TITLE_CHROME = new Set([
  "man",
  "person",
  "character",
  "elder",
  "speaker",
  "speaking",
  "discussing",
  "delivering",
  "dialogue",
  "video",
  "production",
  "script",
  "about",
  "with",
  "from",
  "this",
  "that",
  "copy",
  "studio",
]);

export function foldClipTitle(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/5\s*a\.?\s*m\.?/g, "5am")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Flow auto-titles clips ("Person speaking about morning alarm") instead of the spoken line. */
export function scoreAutoTitle(title, spoken) {
  const t = foldClipTitle(title);
  const s = foldClipTitle(spoken);
  if (!t || !s) return 0;
  if (t.includes(s.slice(0, 22)) || s.includes(t.slice(0, 22))) return 20;
  const spokenWords = s.split(" ").filter((w) => w.length >= 4);
  const titleWords = t.split(" ").filter((w) => w.length >= 4 && !TITLE_CHROME.has(w));
  const hits = new Set([
    ...spokenWords.filter((w) => t.includes(w)),
    ...titleWords.filter((w) => s.includes(w)),
  ]);
  return hits.size;
}

export function newClipTitles(before, after) {
  const seen = new Set((before || []).map((t) => foldClipTitle(typeof t === "string" ? t : t.name)));
  return (after || []).filter((t) => !seen.has(foldClipTitle(typeof t === "string" ? t : t.name)));
}

/** Click into the thumbnail, not the tiny play/title strip under it. */
export function clickPointFromPlayBadge(box) {
  if (!box || box.width < 2 || box.height < 2) return null;
  if (box.height < 40) {
    return {
      x: box.x + Math.max(box.width, 24) * 0.5,
      y: Math.max(48, box.y - 90),
    };
  }
  if (box.width < 80) {
    return { x: box.x + 110, y: box.y + box.height * 0.42 };
  }
  return { x: box.x + box.width * 0.5, y: box.y + box.height * 0.42 };
}
