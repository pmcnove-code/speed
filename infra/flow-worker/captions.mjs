const token = value => String(value || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9']/g, "");

export function subtitleText(text) {
  return String(text || "").replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
}

/** Phrase boundaries follow punctuation; timestamps follow recognized speech. */
export function captionPhrases(text, timings = [], durationMs = 8000, maxWords = 6) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const aligned = timings.length === words.length && timings.every((w, i) =>
    token(w.word || w.punctuated_word) === token(words[i]) &&
    Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start &&
    (i === 0 || w.start >= timings[i - 1].start),
  );
  const clauses = [];
  let from = 0;
  words.forEach((word, i) => {
    if (/[,;.!?]["'”’)]*$/.test(word) || i === words.length - 1) {
      clauses.push([from, i + 1]);
      from = i + 1;
    }
  });
  const phrases = [];
  for (const [begin, end] of clauses) {
    const pages = Math.ceil((end - begin) / Math.max(1, maxWords));
    const size = Math.ceil((end - begin) / pages);
    for (let first = begin; first < end; first += size) {
      const last = Math.min(first + size, end);
      const startMs = aligned ? Math.max(0, timings[first].start * 1000 - 40) : durationMs * first / words.length;
      const nextStart = aligned && last < words.length ? timings[last].start * 1000 - 40 : durationMs;
      const endMs = aligned
        ? Math.min(durationMs, timings[last - 1].end * 1000 + 100, nextStart)
        : durationMs * last / words.length - 40;
      if (endMs > startMs) phrases.push({ text: words.slice(first, last).join(" "), startMs, endMs });
    }
  }
  return phrases;
}
