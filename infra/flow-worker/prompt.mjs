/** Unique words Flow must speak (or the silent-take marker). Shared prefixes like "8-second 9:16" do not count. */
export function dialogueFingerprint(prompt) {
  const p = String(prompt || "");
  // Use greedy match so clip text containing inner quotation marks is captured
  // in full rather than truncated at the first inner quote.
  const quoted = p.match(/Speak ONLY these exact words[^"]*"([\s\S]*)"\s*$/i) || p.match(/Speak ONLY these exact words[^"]*"([\s\S]*)"/i);
  if (quoted) return quoted[1].replace(/\s+/g, " ").trim();
  const block = p.match(/<<<\s*([\s\S]*?)\s*>>>/);
  if (block) return block[1].replace(/\s+/g, " ").trim();
  const part = p.match(/part\s+(\d+)\s+of\s+(\d+)/i);
  if (/SILENT TAKE/i.test(p) && part) return `SILENT TAKE part ${part[1]} of ${part[2]}`;
  return "";
}

export function promptLanded(hay, prompt) {
  const key = dialogueFingerprint(prompt);
  if (!key) return false;
  const h = String(hay || "").replace(/\s+/g, " ").trim();
  const expected = String(prompt || "").replace(/\s+/g, " ").trim();
  return Boolean(expected) && h.includes(expected);
}

export function spokenLog(spoken, limit = 72) {
  return String(spoken || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

/** Available asset names may change direction text, never the spoken script. */
export function applyLiveNames(prompt, wanted, live) {
  const source = String(prompt || "");
  const boundary = source.search(/Speak ONLY these exact words|<<<|DIALOGUE/i);
  if (boundary < 0) return source;
  let directions = source.slice(0, boundary);
  for (const [from, to] of [[wanted.character, live.character], [wanted.voice, live.voice]]) {
    if (!from || !to || from === to) continue;
    const escaped = String(from).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    directions = directions.replace(new RegExp(escaped, "gi"), () => to);
  }
  return directions + source.slice(boundary);
}
