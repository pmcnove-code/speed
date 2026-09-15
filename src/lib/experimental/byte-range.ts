export function parseByteRange(
  header: string | null | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;
  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  if (!hasStart && !hasEnd) return null;
  let start: number;
  let end: number;
  if (!hasStart) {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = hasEnd ? Number(match[2]) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    end = Math.min(end, size - 1);
  }
  if (start < 0 || start > end || start >= size) return null;
  return { start, end };
}
