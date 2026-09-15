import { describe, expect, it } from "vitest";
import { localStoryboard, parseStoryboardJson, shotsToSrt, srtTimestamp } from "./storyboard";

describe("localStoryboard", () => {
  it("puts the hook first and keeps 1–3 shots", () => {
    const shots = localStoryboard({
      hook: "Your gut is not lazy.",
      script: "Your gut is not lazy. It is inflamed from seed oils and late nights. Fix the plate first. Then energy follows.",
      onScreenText: ["GUT ISN'T LAZY", "FIX THE PLATE"],
      cta: "Follow for the protocol.",
      videoBrief: "Kitchen talking head",
    });
    expect(shots[0]?.spoken).toContain("gut");
    expect(shots.length).toBeGreaterThanOrEqual(1);
    expect(shots.length).toBeLessThanOrEqual(3);
    expect(shots.reduce((s, sh) => s + sh.durationSec, 0)).toBeGreaterThanOrEqual(6);
  });
});

describe("parseStoryboardJson", () => {
  it("falls back when JSON is junk", () => {
    const fallback = localStoryboard({
      hook: "Hook",
      script: "Body line.",
      onScreenText: [],
      cta: "",
      videoBrief: "",
    });
    expect(parseStoryboardJson("not json", fallback)).toEqual(fallback);
  });

  it("reads a valid shots array", () => {
    const shots = parseStoryboardJson(
      '{"shots":[{"durationSec":8,"spoken":"Hello","onScreen":"HI","visual":"close up"}]}',
      [],
    );
    expect(shots).toEqual([{ index: 1, durationSec: 8, spoken: "Hello", onScreen: "HI", visual: "close up" }]);
  });
});

describe("srt", () => {
  it("formats timestamps and stacked cues", () => {
    expect(srtTimestamp(3661001)).toBe("01:01:01,001");
    const srt = shotsToSrt([
      { index: 1, durationSec: 8, spoken: "a", onScreen: "HOOK", visual: "" },
      { index: 2, durationSec: 10, spoken: "b", onScreen: "BODY", visual: "" },
    ]);
    expect(srt).toContain("00:00:00,000 --> 00:00:08,000");
    expect(srt).toContain("HOOK");
    expect(srt).toContain("00:00:08,000 --> 00:00:18,000");
  });
});
