/**
 * Shared clip pool for concurrent lanes. Each lane pulls its next clip when it
 * finishes one, so a slow or retrying clip no longer holds up the clips that
 * were pre-assigned behind it.
 *
 * Invariants that protect paid work:
 *  - a clip is handed out at most once per pool (no double dispatch);
 *  - a failed clip is never re-queued to another lane;
 *  - a clip checkpointed to a lane on a previous run goes back to that lane
 *    only, because its asset lives in that lane's Flow project.
 */
export function createClipPool(clipIds, { owned = {} } = {}) {
  const ids = [...new Set(clipIds)];
  const known = new Set(ids);
  const ownerOf = new Map();
  for (const [laneId, list] of Object.entries(owned)) {
    for (const id of list || []) {
      if (known.has(id) && !ownerOf.has(id)) ownerOf.set(id, laneId);
    }
  }
  const state = new Map(ids.map((id) => [id, "pending"]));
  const reserved = new Map();

  function firstPending(laneId) {
    for (const id of ids) if (state.get(id) === "pending" && ownerOf.get(id) === laneId) return id;
    for (const id of ids) if (state.get(id) === "pending" && !ownerOf.has(id)) return id;
    return null;
  }

  return {
    /** Sets a clip aside for a lane before it starts, so every lane has work. */
    reserve(laneId) {
      if (reserved.has(laneId)) return reserved.get(laneId);
      const id = firstPending(laneId);
      if (id === null) return null;
      state.set(id, "reserved");
      reserved.set(laneId, id);
      return id;
    },
    /** Returns the lane's next clip id, or null when nothing is left for it. */
    claim(laneId) {
      if (reserved.has(laneId)) {
        const id = reserved.get(laneId);
        reserved.delete(laneId);
        state.set(id, "active");
        return id;
      }
      const id = firstPending(laneId);
      if (id !== null) state.set(id, "active");
      return id;
    },
    done(id) {
      if (state.has(id)) state.set(id, "done");
    },
    fail(id) {
      if (state.has(id)) state.set(id, "failed");
    },
    isDone(id) {
      return state.get(id) === "done";
    },
    doneIds() {
      return ids.filter((id) => state.get(id) === "done");
    },
    counts() {
      const out = { pending: 0, reserved: 0, active: 0, done: 0, failed: 0 };
      for (const s of state.values()) out[s] += 1;
      return out;
    },
  };
}
