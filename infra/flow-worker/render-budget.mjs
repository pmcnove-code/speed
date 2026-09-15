export const RENDER_OBSERVATION_MS = 10 * 60 * 1000;
/** One observation window per submitted take, shared by all download retries. */
export function createRenderBudget() {
  const deadlines = new Map();
  return (clipId, dispatchCount, now = Date.now()) => {
    const key = `${clipId}:${dispatchCount}`;
    if (!deadlines.has(key)) deadlines.set(key, now + RENDER_OBSERVATION_MS);
    return deadlines.get(key);
  };
}
