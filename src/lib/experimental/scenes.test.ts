import { describe, expect, it } from "vitest";
import { normalizeSceneDirection, buildScenePrompt } from "./scenes";
import { localSplitClips } from "./clip-split";
import { buildV33Prompt } from "../../../shared/flow/clip-v33.mjs";
import { localSplitClips as workerSplit } from "../../../infra/flow-worker/clips.mjs";

describe("whole-video scene direction", () => {
  it("preserves the original prompt when no setting is supplied", () => {
    expect(normalizeSceneDirection(undefined)).toBeNull();
    expect(normalizeSceneDirection({ setting: "  " })).toBeNull();
    expect(buildScenePrompt("It's morning.", { setting: "", transition: "cut" })).toBe(buildV33Prompt("It's morning."));
  });
  it("keeps scene directions as metadata without overriding the exact reference-lock prompt", () => {
    const script = "I keep my mornings simple. I cook breakfast, step outside, and take a moment to enjoy the day. There is no rush. A little sunlight and a quiet minute help me feel ready for whatever comes next.";
    const sceneDirection = { setting: "A warm kitchen at sunrise", transition: "fade" as const };
    const options = { script, sceneDirection, characterName: "Farm Woman", voiceName: "Farm Woman" };
    const clips = localSplitClips(options);
    expect(clips.length).toBeGreaterThan(1);
    expect(clips.map(c => c.spoken).join(" ")).toBe(script);
    expect(workerSplit(options)).toEqual(clips);
    for (const clip of clips) {
      expect(clip.scene).toEqual(sceneDirection);
      expect(clip.prompt).not.toContain(sceneDirection.setting);
      expect(clip.prompt).toBe(buildV33Prompt(clip.spoken));
      expect(clip.prompt).toContain("POSE CONTINUITY LOCK");
      expect(clip.prompt.endsWith(`Speak ONLY these exact words, nothing before, nothing after: "${clip.spoken}"`)).toBe(true);
      expect(clip.prompt).toContain("The background and setting must match the attached image exactly");
    }
  });
  it("rejects malformed directions and unsupported transitions", () => {
    expect(() => normalizeSceneDirection([])).toThrow();
    expect(() => normalizeSceneDirection({ setting: "a".repeat(1601) })).toThrow();
    expect(() => normalizeSceneDirection({ transition: "spin" })).toThrow();
  });
});
