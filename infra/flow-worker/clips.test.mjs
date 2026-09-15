import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clipFits, countSyllables, MAX_SYLLABLES } from "./clip-v33.mjs";
import { isVerbatimFromCopy, localSplitClips, normalizeClips } from "./clips.mjs";

describe("localSplitClips v3.3", () => {
  it("stays under 35 syllables and does not force 8s", () => {
    const clips = localSplitClips({
      hook: "Your gut is not lazy.",
      script:
        "Your gut is not lazy. It is inflamed from seed oils and late nights. Fix the plate first. Then energy follows. Meat and fat rebuild you. Stop eating the lie.",
      characterName: "Farm Woman",
      voiceName: "Farm Woman",
    });
    assert.ok(clips.every((c) => [4, 6, 8, 10].includes(c.durationSec)));
    assert.ok(clips.every((c) => c.hold || countSyllables(c.spoken) <= MAX_SYLLABLES));
    assert.ok(clips.every((c) => c.hold || clipFits(c.spoken)));
    assert.match(clips[0].prompt, /Fictional comedy sketch, educational parody/);
    assert.match(clips[0].prompt, /Speak ONLY these exact words/);
  });

  it("does not add visual holds on a short script", () => {
    const clips = localSplitClips({
      hook: "Ask me what I eat.",
      script: "Ask me what I eat.",
      characterName: "Farm Woman",
      voiceName: "Farm Woman",
    });
    assert.equal(clips.some((c) => c.hold), false);
    assert.equal(clips.length, 1);
    assert.match(clips[0].prompt, /Ask me what I eat/);
    assert.doesNotMatch(clips[0].prompt, /DIALOGUE —/);
  });
});

describe("normalizeClips", () => {
  it("increases a supplied duration that cannot cover the complete quote", () => {
    const script = "A fresh start. I keep my mornings simple. I cook breakfast, step outside, and take a moment to enjoy the day.";
    const clips = normalizeClips([{ spoken: script, durationSec: 4 }], { script });
    assert.equal(clips[0].durationSec, 10);
    assert.equal(clips.map(c => c.spoken).join(" "), script);
  });
  it("keeps a verbatim incoming beat", () => {
    const clips = normalizeClips([{ spoken: "Ask me what I eat.", durationSec: 6, prompt: "" }], {
      hook: "Ask me what I eat.",
      script: "Ask me what I eat.",
      characterName: "Farm Woman",
      voiceName: "Farm Woman",
    });
    assert.equal(clips.filter((c) => !c.hold).length, 1);
    assert.equal(clips[0].spoken, "Ask me what I eat.");
  });

  it("lands hook captions and a spoken CTA", () => {
    const clips = normalizeClips([{ spoken: "Ask me what I eat.", durationSec: 8, prompt: "" }], {
      hook: "Ask me what I eat.",
      script: "Ask me what I eat.",
      onScreenText: ["ASK ME WHAT I EAT"],
      cta: "Follow for more.",
      characterName: "Farm Woman",
      voiceName: "Farm Woman",
    });
    assert.equal(clips.length, 1);
    assert.equal(clips[0].onScreen, "Ask me what I eat. Follow for more.");
    const lastSpoken = [...clips].reverse().find((c) => !c.hold);
    assert.match(lastSpoken.spoken, /Follow for more/);
    assert.equal(lastSpoken.ctaBeat, true);
    assert.match(lastSpoken.prompt, /Speak ONLY these exact words/);
  });

  it("rebuilds from the script when incoming spoken is a paraphrase", () => {
    const clips = normalizeClips([{ spoken: "Your stomach feels tired today.", durationSec: 8, prompt: "" }], {
      hook: "Ask me what I eat.",
      script: "Ask me what I eat.",
      characterName: "Farm Woman",
      voiceName: "Farm Woman",
    });
    assert.ok(clips.every((c) => c.hold || /ask me what i eat/i.test(c.spoken)));
    assert.ok(clips.every((c) => !/stomach feels tired/i.test(c.spoken)));
  });
});

describe("verbatim copy lock", () => {
  it("rejects paraphrases", () => {
    assert.equal(isVerbatimFromCopy("It is inflamed from seed oils.", "your gut is not lazy it is inflamed from seed oils"), true);
    assert.equal(isVerbatimFromCopy("Your gut feels tired and swollen.", "your gut is not lazy it is inflamed from seed oils"), false);
  });
});

describe("captions", () => {
  it("burns words from that clip's spoken line", () => {
    const clips = localSplitClips({
      hook: "Low T isn't a diagnosis.",
      script:
        "Low T isn't a diagnosis. Oatmeal is not a diet. Hormones are built from cholesterol. You need a ribeye.",
      onScreenText: ["PILLS DON'T FIX PLATES", "SALAD ISN'T FUEL"],
      cta: "Save this.",
      characterName: "African Elder",
      voiceName: "African Elder",
    });
    for (const clip of clips.filter((c) => !c.hold)) {
      assert.equal(clip.onScreen, clip.spoken);
      assert.ok(clip.onScreen.length);
    }
  });
});
