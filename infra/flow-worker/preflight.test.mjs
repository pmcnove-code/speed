import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FLOW_CLIP_DURATIONS,
  requireClipDuration,
  settingsEvidence,
  settingsMeetContract,
  settingsPanelLooksOpen,
} from "./preflight.mjs";

describe("Flow clip settings contract", () => {
  it("allows only v3.3 durations", () => {
    assert.deepEqual(FLOW_CLIP_DURATIONS, [4, 6, 8, 10]);
    for (const duration of FLOW_CLIP_DURATIONS) {
      assert.equal(requireClipDuration(duration), duration);
    }
    assert.throws(() => requireClipDuration(5), /unsupported clip duration 5s/i);
  });

  it("requires the requested duration instead of accepting a silent fallback", () => {
    const eight = "Video · 720p · 8s crop_9_16 x1";
    assert.equal(settingsMeetContract(eight, 8), true);
    assert.equal(settingsMeetContract(eight, 10), false);
  });

  it("requires portrait, one output, and 720p", () => {
    assert.deepEqual(settingsEvidence("Video · 720p · 10s crop_9_16 x1", 10), {
      duration: true,
      resolution: true,
      portrait: true,
      outputs: true,
    });
    assert.equal(settingsMeetContract("Video · 720p · 10s crop_16_9 x2", 10), false);
  });

  it("does not treat the collapsed composer chip as an open settings panel", () => {
    assert.equal(settingsPanelLooksOpen("Video · 720p · 8s crop_9_16 x1\nSettings trigger"), false);
    assert.equal(settingsPanelLooksOpen("Camera lock\nAspect ratio\n4s 6s 8s 10s"), true);
    assert.equal(settingsPanelLooksOpen("4s 6s 8s 10s Omni Flash"), true);
    assert.equal(settingsPanelLooksOpen("Omni 1.1 Flash\nIngredients\n4s\n6s\n8s\n10s\nOutput count"), true);
    assert.equal(
      settingsPanelLooksOpen("Mode\nVideo type\nAspect ratio\nVideo duration\n4s\n6s\n8s\n10s\nOutput count\nOmni 1.1 Flash"),
      true,
    );
  });
});
