import { describe, expect, it } from "vitest";
import {
  buildFlowClipPrompt,
  clipsMatchCopy,
  isVerbatimFromCopy,
  localSplitClips,
  normalizeClips,
} from "./clip-split";
import { clipFits, countSyllables, MAX_SYLLABLES } from "./clip-v33";

describe("localSplitClips v3.3", () => {
  it("revalidates the full quote instead of trusting an undersized supplied duration", () => {
    const script = "A fresh start. I keep my mornings simple. I cook breakfast, step outside, and take a moment to enjoy the day.";
    const clips = normalizeClips([{ spoken: script, durationSec: 4 }], { script, characterName: "African Elder", voiceName: "Charon" });
    expect(clips[0].durationSec).toBe(10);
    expect(clips.map(c => c.spoken).join(" ")).toBe(script);
  });
  it("splits verbatim under the 35-syllable cap", () => {
    const script =
      "Your gut is not lazy. It is inflamed from seed oils and late nights. Fix the plate first. Then energy follows. Meat and fat rebuild you. Stop eating the lie.";
    const clips = localSplitClips({
      hook: "Your gut is not lazy.",
      script,
      characterName: "Farm Woman",
      voiceName: "Farm Woman",
    });
    expect(clips.length).toBeGreaterThanOrEqual(1);
    expect(clips.every((c) => [4, 6, 8, 10].includes(c.durationSec))).toBe(true);
    expect(clips.every((c) => c.hold || clipFits(c.spoken))).toBe(true);
    expect(clips.every((c) => c.hold || countSyllables(c.spoken) <= MAX_SYLLABLES)).toBe(true);
    const spoken = clips.filter((c) => !c.hold).map((c) => c.spoken).join(" ");
    expect(spoken).toContain("inflamed");
    expect(spoken).toContain("Meat and fat");
    expect(clips.some((c) => c.hold)).toBe(false);
  });

  it("does not pad a short hook with silent holds", () => {
    const clips = localSplitClips({
      hook: "Ask me what I eat.",
      script: "Ask me what I eat.",
      characterName: "Farm Woman",
      voiceName: "Farm Woman",
    });
    expect(clips.some((c) => c.hold)).toBe(false);
    expect(clips).toHaveLength(1);
    expect(clips[0]?.spoken).toContain("Ask me what I eat.");
  });

  it("uses the v3.3 prompt on every spoken clip", () => {
    const clips = localSplitClips({
      hook: "Your gut is not lazy.",
      script:
        "Your gut is not lazy. It is inflamed from seed oils and late nights. Fix the plate first. Then energy follows.",
      characterName: "Farm Woman",
      voiceName: "Farm Woman",
    });
    expect(clips[0]?.prompt).toContain("Fictional comedy sketch, educational parody.");
    expect(clips[0]?.prompt).toContain("POSE CONTINUITY LOCK");
    expect(clips[0]?.prompt).toContain(`Speak ONLY these exact words, nothing before, nothing after: "${clips[0]?.spoken}"`);
    const second = clips[1];
    if (second) {
      expect(second.prompt).toContain(second.spoken);
      expect(second.prompt).not.toContain("The character says:");
    }
  });

  it("quotes only the spoken line in the prompt", () => {
    const prompt = buildFlowClipPrompt({
      id: "C02",
      spoken: "The doctor named it: low T.",
      characterName: "Farm Woman",
      voiceName: "Farm Woman",
      index: 2,
      total: 3,
      previousSpoken: "Honey, I've been eating this way since before you were born.",
      videoBrief: "Two-shot contrast: coffee then cooking eggs and liver.",
    });
    expect(prompt).toContain('Speak ONLY these exact words, nothing before, nothing after: "The doctor named it: low T."');
    expect(prompt).not.toContain("Honey, I've been eating");
    expect(prompt).not.toContain("custom voice named Farm Woman");
    expect(prompt).not.toContain("cooking eggs");
    expect(prompt).toContain("Use the attached voice exactly as provided");
  });

  it("speaks the CTA last when it is not already in the script", () => {
    const clips = localSplitClips({
      hook: "Your gut is not lazy.",
      script:
        "Your gut is not lazy. It is inflamed from seed oils and late nights. Fix the plate first. Then energy follows. Meat and fat rebuild you. Stop eating the lie.",
      onScreenText: ["GUT ISN'T LAZY", "FIX THE PLATE", "MEAT AND FAT"],
      cta: "Follow for the protocol.",
      videoBrief: "Kitchen talking-head, daylight",
      characterName: "Farm Woman",
      voiceName: "Farm Woman",
    });
    expect(clips[0]?.onScreen).toBe(clips[0]?.spoken);
    const lastSpoken = [...clips].reverse().find((c) => !c.hold);
    expect(lastSpoken?.spoken).toMatch(/Follow for the protocol/);
    expect(lastSpoken?.ctaBeat).toBe(true);
    expect(
      clipsMatchCopy(clips, {
        hook: "Your gut is not lazy.",
        script:
          "Your gut is not lazy. It is inflamed from seed oils and late nights. Fix the plate first. Then energy follows. Meat and fat rebuild you. Stop eating the lie.",
        cta: "Follow for the protocol.",
      }),
    ).toBe(true);
  });
});

describe("verbatim copy lock", () => {
  it("accepts a contiguous excerpt and rejects a paraphrase", () => {
    const corpus = "your gut is not lazy it is inflamed from seed oils";
    expect(isVerbatimFromCopy("It is inflamed from seed oils.", corpus)).toBe(true);
    expect(isVerbatimFromCopy("Your gut feels tired and swollen.", corpus)).toBe(false);
  });
});
