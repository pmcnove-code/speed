import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachDispatchState,
  classifyClipError,
  createClipState,
  markClipDispatched,
  recoveryForClip,
  restoreClipState,
  setClipPhase,
} from "./clip-state.mjs";

describe("paid clip state machine", () => {
  it("allows bounded free preflight retries before dispatch", () => {
    const state = createClipState("C01");
    assert.equal(recoveryForClip(state, Object.assign(new Error("prompt"), { code: "PROMPT" })).action, "retry-preflight");
    assert.equal(recoveryForClip(state, Object.assign(new Error("attach"), { code: "ATTACH" })).action, "retry-preflight");
    assert.equal(recoveryForClip(state, Object.assign(new Error("settings"), { code: "SETTINGS" })).action, "fail");
    assert.equal(state.dispatchCount, 0);
  });

  it("never regenerates after render stalls or downloads fail", () => {
    const state = markClipDispatched(createClipState("C01"), 123);
    for (const code of ["STALL", "RENDER_TIMEOUT", "DOWNLOAD", "DUPLICATE"]) {
      const next = recoveryForClip(state, Object.assign(new Error(code), { code }));
      assert.notEqual(next.action, "regenerate-content");
      assert.equal(state.dispatchCount, 1);
      assert.equal(state.costCommitted, true);
    }
  });

  it("only allows one extra paid take for a proven current-asset speech error", () => {
    const state = markClipDispatched(createClipState("C02"));
    const ambiguous = recoveryForClip(
      state,
      Object.assign(new Error("wrong file"), { code: "SPEECH", wrongFile: true }),
    );
    assert.equal(ambiguous.action, "retry-acquire");
    assert.equal(state.costCommitted, true);

    const confirmed = recoveryForClip(
      state,
      Object.assign(new Error("Flow misspoke"), { code: "SPEECH", confirmedCurrent: true }),
    );
    assert.equal(confirmed.action, "regenerate-content");
    assert.equal(state.costCommitted, false);
    markClipDispatched(state);
    assert.equal(
      recoveryForClip(
        state,
        Object.assign(new Error("Flow misspoke again"), { code: "SPEECH", confirmedCurrent: true }),
      ).action,
      "fail",
    );
  });

  it("escalates a closed browser for durable resume instead of looping", () => {
    const state = markClipDispatched(createClipState("C03"));
    const error = classifyClipError(new Error("page.waitForTimeout: Target page, context or browser has been closed"));
    assert.equal(error.code, "BROWSER_CLOSED");
    assert.equal(recoveryForClip(state, error).action, "resume-after-restart");
    assert.equal(attachDispatchState(error, state).dispatched, true);
  });

  it("tracks explicit phases", () => {
    const state = createClipState("C04");
    setClipPhase(state, "dispatching");
    assert.equal(state.phase, "dispatching");
    assert.throws(() => setClipPhase(state, "guessing"), /unknown clip phase/i);
  });

  it("treats a crash at the dispatch boundary as possibly paid", () => {
    const state = restoreClipState("C05", {
      phase: "dispatching",
      costCommitted: false,
      dispatchCount: 0,
    });
    assert.equal(state.costCommitted, true);
    assert.equal(state.dispatchCount, 1);
    assert.equal(state.uncertainDispatch, true);
  });

  it("replays the production stall/download/wrong-file loop without a second paid click", () => {
    const state = markClipDispatched(createClipState("C01"), 1);
    const events = [
      { code: "STALL", message: "Flow render stalled (no progress for 2.5 minutes)." },
      { code: "DOWNLOAD", message: "could not pull the MP4 from Flow in 75s" },
      { code: "SPEECH", wrongFile: true, message: "grabbed a previous take" },
      { code: "SPEECH", wrongFile: true, message: "wrong MP4 — looking for the new clip" },
    ];
    const actions = events.map((event) => recoveryForClip(state, Object.assign(new Error(event.message), event)).action);
    assert.deepEqual(actions, ["retry-acquire", "retry-acquire", "retry-acquire", "fail"]);
    assert.equal(state.dispatchCount, 1);
    assert.equal(state.costCommitted, true);
    assert.notEqual(state.phase, "preflight");
  });
});

// Missing reference input cannot be repaired by clicking the same attachment again.
it("stops missing-character preflight without retries or paid dispatch", () => {
  const state = createClipState("C01");
  const decision = recoveryForClip(state, Object.assign(new Error("Upload reference photo"), { code: "CHARACTER_MISSING" }));
  assert.equal(decision.action, "fail");
  assert.equal(state.dispatchCount, 0);
  assert.equal(state.preflightRetries, 0);
});

it('does not buy another take after the submitted media stays unavailable', () => {
  const state=createClipState('C01',{costCommitted:true,dispatchCount:2,contentRetries:1});
  assert.equal(recoveryForClip(state,Object.assign(new Error('failed to load'),{code:'MEDIA_LOAD_FAILED'})).action,'fail');
  assert.equal(state.dispatchCount,2);
});
