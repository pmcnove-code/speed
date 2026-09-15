export const CLIP_PHASES = Object.freeze([
  "preflight",
  "dispatching",
  "rendering",
  "rendered",
  "acquiring",
  "validating",
  "verified",
]);

export function createClipState(id, initial = {}) {
  return {
    id: String(id || ""),
    phase: "preflight",
    costCommitted: false,
    dispatchCount: 0,
    preflightRetries: 0,
    acquisitionRetries: 0,
    contentRetries: 0,
    generationRetries: 0,
    ...initial,
  };
}

export function restoreClipState(id, snapshot = {}) {
  const state = createClipState(id, snapshot || {});
  // "dispatching" is the persisted intent immediately before clicking Flow.
  // After a crash that boundary is unknowable, so resume conservatively as if
  // the paid request may have been accepted and discover/download only.
  if (state.phase === "dispatching" && !state.costCommitted) {
    state.costCommitted = true;
    state.dispatchCount = Math.max(1, Number(state.dispatchCount || 0));
    state.uncertainDispatch = true;
  }
  return state;
}

export function setClipPhase(state, phase) {
  if (!CLIP_PHASES.includes(phase)) throw new Error(`Unknown clip phase: ${phase}`);
  state.phase = phase;
  return state;
}

export function markClipDispatched(state, at = Date.now()) {
  state.phase = "rendering";
  state.costCommitted = true;
  state.dispatchCount += 1;
  state.acquisitionRetries = 0;
  state.dispatchedAt = at;
  return state;
}

export function classifyClipError(error) {
  const err = error && typeof error === "object" ? error : new Error(String(error || "unknown error"));
  if (err.code) return err;
  const message = String(err.message || err);
  if (/target page, context or browser has been closed|page\.(?:waitForTimeout|evaluate).*closed/i.test(message)) {
    err.code = "BROWSER_CLOSED";
  } else if (/timed out|timeout/i.test(message)) {
    err.code = "TIMEOUT";
  } else {
    err.code = "UNKNOWN";
  }
  return err;
}

/**
 * Recovery is deliberately asymmetric around costCommitted:
 * - before dispatch, bounded retries may repeat free composer work;
 * - after dispatch, detector/download failures can only reacquire that take;
 * - a second paid take is allowed only for a proven current-asset content error.
 */
export function recoveryForClip(state, rawError, limits = {}) {
  const error = classifyClipError(rawError);
  const preflightLimit = Number(limits.preflight ?? 2);
  const acquisitionLimit = Number(limits.acquisition ?? 3);
  const contentLimit = Number(limits.content ?? 1);
  const replacementLimit=Number(limits.replacements ?? contentLimit);
  function replace(action){
    if(Number(state.generationRetries||0)>=replacementLimit)return {action:'fail',error};
    state.generationRetries=Number(state.generationRetries||0)+1;
    state.costCommitted=false;state.phase='preflight';state.preflightRetries=0;state.acquisitionRetries=0;
    for (const key of ["mediaHash", "durationMs", "dispatchedAt", "uncertainDispatch"]) delete state[key];
    delete state.assetId;delete state.assetOpenedAt;
    return {action,error};
  }
  if(limits.retryUnavailable && state.costCommitted && ['MEDIA_LOAD_FAILED','RENDER_UNAVAILABLE'].includes(error.code))return replace('regenerate-unavailable');

  if (["CREDITS", "EXPIRED", "BLOCKED", "PROJECT_CREDITS_WARNING", "CHARACTER_MISSING", "GENDER_MISSING", "MEDIA_LOAD_FAILED", "RENDER_UNAVAILABLE", "PROMPT_CONTRACT"].includes(error.code)) {
    return { action: "fail", error };
  }

  if (!state.costCommitted) {
    if (state.preflightRetries < preflightLimit) {
      state.preflightRetries += 1;
      state.phase = "preflight";
      return { action: "retry-preflight", error };
    }
    return { action: "fail", error };
  }

  if (error.code === "SPEECH" && error.confirmedCurrent === true) {
    if (state.contentRetries < contentLimit) {
      state.contentRetries += 1;
      return replace('regenerate-content');
    }
    return { action: "fail", error };
  }

  if (
    [
      "DOWNLOAD",
      "DUPLICATE",
      "SPEECH",
      "STALL",
      "RENDER_TIMEOUT",
      "TIMEOUT",
      "BROWSER_CLOSED",
      "UI",
      "UNKNOWN",
    ].includes(error.code)
  ) {
    if (error.code === "BROWSER_CLOSED") {
      return { action: "resume-after-restart", error };
    }
    if (state.acquisitionRetries < acquisitionLimit) {
      state.acquisitionRetries += 1;
      state.phase = "acquiring";
      return { action: "retry-acquire", error };
    }
  }

  if(limits.retryUnavailable && state.costCommitted && ['DOWNLOAD','DUPLICATE','SPEECH','STALL','RENDER_TIMEOUT'].includes(error.code))return replace('regenerate-unavailable');
  return { action: "fail", error };
}

export function attachDispatchState(error, state) {
  const err = classifyClipError(error);
  if (state.costCommitted || state.dispatchCount > 0) err.dispatched = true;
  err.clipState = { ...state };
  return err;
}
