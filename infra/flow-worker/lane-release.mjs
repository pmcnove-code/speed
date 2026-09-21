/**
 * Releases each Flow account the moment its last lane finishes, instead of
 * holding every account until the whole video is done, so a video waiting
 * behind it can start on the freed capacity.
 *
 * Each account is released at most once. A second release would free an
 * account another video has claimed in the meantime.
 */
export function createLaneRelease({ lanes, realIdOf, release }) {
  const remaining = new Map();
  const released = new Set();
  for (const lane of lanes) {
    const id = realIdOf(lane.accountId);
    remaining.set(id, (remaining.get(id) || 0) + 1);
  }

  function releaseOnce(id) {
    if (released.has(id)) return false;
    released.add(id);
    release(id);
    return true;
  }

  return {
    /** Returns the real account id if this was its last lane and it was released now, else null. */
    laneFinished(laneId) {
      const id = realIdOf(laneId);
      if (!remaining.has(id)) return null;
      const left = remaining.get(id) - 1;
      remaining.set(id, Math.max(0, left));
      return left <= 0 && releaseOnce(id) ? id : null;
    },
    /** Final safety net for accounts that are still held. */
    releaseAll(ids) {
      for (const id of ids) releaseOnce(id);
    },
    isReleased(id) {
      return released.has(id);
    },
  };
}
