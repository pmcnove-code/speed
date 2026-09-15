export function assetIdFromEditUrl(url) {
  const match = String(url || "").match(/\/edit\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : "";
}

export function projectIdFromUrl(url) {
  const match = String(url || "").match(/\/project\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : "";
}

export function normalizeEditAssets(urls = []) {
  const seen = new Set();
  const assets = [];
  for (const raw of urls || []) {
    const url = String(raw || "");
    const id = assetIdFromEditUrl(url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    assets.push({ id, url, projectId: projectIdFromUrl(url) });
  }
  return assets;
}

export function newlyAddedEditAssets(beforeUrls = [], afterUrls = []) {
  const before = new Set(normalizeEditAssets(beforeUrls).map((asset) => asset.id));
  return normalizeEditAssets(afterUrls).filter((asset) => !before.has(asset.id));
}

/**
 * x1 generation must add exactly one edit asset. More than one is ambiguous
 * and no existing/old asset is selected as a fallback.
 */
export function identifyNewEditAsset(beforeUrls = [], afterUrls = [], expectedProjectUrl = "") {
  const expectedProjectId = projectIdFromUrl(expectedProjectUrl);
  const fresh = newlyAddedEditAssets(beforeUrls, afterUrls).filter(
    (asset) => !expectedProjectId || !asset.projectId || asset.projectId === expectedProjectId,
  );
  return fresh.length === 1 ? fresh[0] : null;
}

export function minimumExpectedDurationMs(durationSec) {
  const expected = Number(durationSec);
  if (!Number.isFinite(expected) || expected <= 0) return 3_000;
  return Math.max(3_000, Math.round(expected * 1_000 - 1_500));
}

export function candidateMatchesAsset(candidate, identity = {}) {
  if (!candidate || !identity?.assetId || !identity?.openedAt) return false;
  if (Number(candidate.at || 0) < Number(identity.openedAt)) return false;
  const candidateAssetId = assetIdFromEditUrl(candidate.url || candidate.assetUrl || "");
  if (candidateAssetId && candidateAssetId !== String(identity.assetId).toLowerCase()) return false;
  return true;
}

/** Recover asset URLs even when an earlier network download never saved its edit URL. */
export function checkpointAssetUrl(checkpoint = {}, projectUrl = "") {
  if (assetIdFromEditUrl(checkpoint.assetUrl)) return checkpoint.assetUrl;
  const id = checkpoint.assetId || checkpoint.clipState?.assetId;
  const project = projectIdFromUrl(checkpoint.projectUrl || projectUrl);
  return id && /^[a-z0-9-]+$/i.test(id) && project ? `https://flow.google.com/project/${project}/edit/${id}` : "";
}
