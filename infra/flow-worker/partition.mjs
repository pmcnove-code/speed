/**
 * Splits an ordered clip list into contiguous per-account chunks so multiple
 * Flow accounts can generate different parts of the same video in parallel.
 * Contiguous (not round-robin) because each chunk becomes its own Flow
 * project/character setup — clips within a chunk still play in order, they
 * just don't have to wait on clips from a different chunk.
 */
export function partitionClipsForLanes(clips, laneCount) {
  const n = Math.max(1, Math.min(Math.floor(laneCount) || 1, clips.length || 1));
  if (!clips.length) return [];
  if (n <= 1) return [clips];
  const base = Math.floor(clips.length / n);
  const extra = clips.length % n;
  const lanes = [];
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < extra ? 1 : 0);
    if (size > 0) lanes.push(clips.slice(idx, idx + size));
    idx += size;
  }
  return lanes;
}
