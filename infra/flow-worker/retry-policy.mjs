export const MAX_CLIP_ATTEMPTS=10;
export const JOB_GENERATION_MS=2*60*60*1000;
export const JOB_TIMEOUT_MESSAGE='Flow job reached the 2-hour generation limit. Saved clips are preserved.';
export const CLIP_RETRY_LIMITS=Object.freeze({content:MAX_CLIP_ATTEMPTS-1,replacements:MAX_CLIP_ATTEMPTS-1,retryUnavailable:true});
export function retryDelayMs(retries){return Math.min(120_000,15_000*2**Math.max(0,retries-1));}

export function generationDeadline(startedAt,now=Date.now()){
 const parsed=Date.parse(startedAt||'');
 return (Number.isFinite(parsed)?parsed:now)+JOB_GENERATION_MS;
}

// Keep failed identities as exclusions, never as the next attempt's output.
export function freshAttemptMetadata(previous = {}, failedAssetUrl = '', rejectedHashes = []) {
 return {
  ...previous,
  editHrefsBefore: [...new Set([...(previous.editHrefsBefore || []), ...(previous.editHrefsAfter || []), failedAssetUrl].filter(Boolean))],
  rejectedHashes: [...new Set([...(previous.rejectedHashes || []), ...rejectedHashes])],
  assetId: null, assetUrl: null, assetOpenedAt: null,
  mediaHash: null, networkMedia: null, durationMs: null,
  genAt: null, titlesBefore: [], titlesAfter: [], editHrefsAfter: [],
  playsBefore: 0, playsAfter: 0, mediaBefore: 0, pendingBefore: false,
 };
}
