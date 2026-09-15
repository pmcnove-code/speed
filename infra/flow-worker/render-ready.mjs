/** Grid readiness is only permission to inspect; an opened new asset is still required. */
export function renderReadyToOpen(snapshot, playsBefore = 0) {
  return !snapshot.generating && snapshot.pending === 0 &&
    !(snapshot.percents || []).some(percent => percent < 100) &&
    snapshot.playReady === true && snapshot.playCount > playsBefore;
}

/** Only a new failed tile belongs to this submission; old failures are ignored. */
export function newRenderFailure(snapshot, titlesBefore = []) {
  const old = new Set(titlesBefore.map(tile => String(tile.name || tile).trim().toLowerCase()));
  return (snapshot.failedTiles || []).find(tile => tile.name && !old.has(tile.name.trim().toLowerCase())) || null;
}
