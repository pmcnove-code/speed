import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFlowFailure, isUsableAccount } from "./rotate.mjs";

function account(overrides = {}) {
  return {
    connected: true,
    status: "connected",
    creditsRemaining: 10,
    ...overrides,
  };
}

describe("Flow account availability", () => {
  it("allows an explicit manual retry with a connected session after unusual activity", () => {
    assert.equal(isUsableAccount(account({ status: "blocked" })), true);
  });

  it("excludes an account only while its resting cooldown is still in the future", () => {
    assert.equal(isUsableAccount(account({ restingUntil: new Date(Date.now() + 60_000).toISOString() })), false);
    assert.equal(isUsableAccount(account({ restingUntil: new Date(Date.now() - 60_000).toISOString() })), true);
  });

  it("classifies the unusual-activity response as blocked", () => {
    assert.equal(
      classifyFlowFailure("Flow paused this Google account for unusual activity."),
      "blocked",
    );
  });
});
