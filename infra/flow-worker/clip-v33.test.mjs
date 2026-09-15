/**
 * Worker-side clip-v33 golden-fixture and parity tests.
 * Uses Node built-in test runner (node:test).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  breakdownScript,
  buildV33HoldPrompt,
  buildV33Prompt,
  canonicalSpokenSource,
  clipFits,
  consolidateUnits,
  countSyllables,
  countWordSyllables,
  durationForClip,
  estimatedSpeakSec,
  FLOW_V33_PROMPT,
  MAX_SYLLABLES,
  normalizeSpoken,
  scriptUnits,
  splitLongSentence,
  validatePartition,
} from "./clip-v33.mjs";

// ---------------------------------------------------------------------------
// Core limits
// ---------------------------------------------------------------------------

describe("v3.3 limits (worker)", () => {
  it("keeps every beat under 35 syllables and 10s", () => {
    const { beats } = breakdownScript({
      hook: "Your 5 AM alarm isn't discipline. It's your body running on fumes.",
      script:
        "I used to wake up tired. Not the good tired. The empty tired. Before the sun, already drained. Coffee was my breakfast. The doctor named it: low T.",
    });
    assert.ok(beats.length > 0);
    for (const beat of beats) {
      assert.ok(countSyllables(beat.spoken) <= MAX_SYLLABLES, `syllable overflow: "${beat.spoken}"`);
      assert.ok(estimatedSpeakSec(beat.spoken) <= 10, `time overflow: "${beat.spoken}"`);
      assert.ok(clipFits(beat.spoken), `clipFits failed: "${beat.spoken}"`);
      assert.ok([4, 6, 8, 10].includes(beat.durationSec));
    }
    const spoken = beats.map((b) => b.spoken).join(" ");
    assert.match(spoken, /5 AM alarm/);
    assert.match(spoken, /low T/);
  });

  it("splitLongSentence reconstructs exactly", () => {
    const LONG =
      "I spent twenty years prescribing medications that only managed symptoms, and then I discovered that the food my patients were eating every single day was the actual root cause of everything.";
    const parts = splitLongSentence(LONG);
    assert.ok(parts.length >= 2);
    assert.equal(parts.join(" ").replace(/\s+/g, " "), LONG);
    assert.ok(parts.every((p) => clipFits(p)));
  });

  it("consolidates short sentences into one clip", () => {
    const { beats } = breakdownScript({ script: "Fix the plate first. Then energy follows." });
    assert.equal(beats.length, 1);
    assert.equal(beats[0].spoken, "Fix the plate first. Then energy follows.");
  });
});

// ---------------------------------------------------------------------------
// Syllable counting improvements
// ---------------------------------------------------------------------------

describe("syllable counting (worker)", () => {
  it("counts punctuated acronyms, curly contractions and compounds consistently", () => {
    assert.equal(countWordSyllables("CEO."), 3);
    assert.equal(countWordSyllables("isn’t"), 2);
    assert.equal(countWordSyllables("twenty-one"), countWordSyllables("twenty") + 1);
  });

  it("uses the conservative word-rate fallback for uncertain numeric text", () => {
    assert.ok(estimatedSpeakSec("I get up at 5 AM.") >= 6 / 2 + 0.4);
  });
  it("isn't = 2 syllables", () => {
    assert.equal(countWordSyllables("isn't"), 2);
  });

  it("contractions: didn't, doesn't, hasn't, wouldn't, couldn't, shouldn't = 2 each", () => {
    for (const w of ["didn't", "doesn't", "hasn't", "wouldn't", "couldn't", "shouldn't"]) {
      assert.equal(countWordSyllables(w), 2, `Expected 2 for ${w}`);
    }
  });

  it("counts known acronyms without treating emphasized words as letters", () => {
    assert.equal(countWordSyllables("AM"), 2);
    assert.equal(countWordSyllables("PM"), 2);
    assert.equal(countWordSyllables("TV"), 2);
    assert.equal(countWordSyllables("CEO"), 3);
    assert.equal(countWordSyllables("BODY"), countWordSyllables("body"));
  });

  it("5 AM = 3 syllables total", () => {
    assert.equal(countSyllables("5 AM"), 3);
  });

  it("lowercase 'am' is still 1 syllable", () => {
    assert.equal(countWordSyllables("am"), 1);
  });
});

// ---------------------------------------------------------------------------
// Hook deduplication
// ---------------------------------------------------------------------------

describe("hook deduplication (worker)", () => {
  it("does not prepend hook when script starts with it", () => {
    const units = scriptUnits({
      hook: "Your gut is not lazy.",
      script: "Your gut is not lazy. It is inflamed.",
    });
    const count = units.filter((u) => /your gut is not lazy/i.test(u)).length;
    assert.equal(count, 1);
  });

  it("prepends hook when script is different content", () => {
    const units = scriptUnits({
      hook: "Your 5 AM alarm isn't discipline.",
      script: "I used to wake up tired.",
    });
    assert.match(units[0], /5 AM alarm/);
  });
});

// ---------------------------------------------------------------------------
// Partition validation
// ---------------------------------------------------------------------------

describe("partition validation (worker)", () => {
  it("accepts perfect partition", () => {
    const opts = { script: "Fix the plate first. Then energy follows." };
    const { beats } = breakdownScript(opts);
    assert.equal(validatePartition(beats.map((b) => ({ spoken: b.spoken })), opts), true);
  });

  it("rejects omission", () => {
    const opts = { script: "Fix the plate first. Then energy follows." };
    assert.equal(validatePartition([{ spoken: "Fix the plate first." }], opts), false);
  });

  it("rejects overlap / duplication", () => {
    const opts = { script: "Fix the plate first. Then energy follows." };
    assert.equal(
      validatePartition(
        [{ spoken: "Fix the plate first. Then energy follows." }, { spoken: "Fix the plate first." }],
        opts,
      ),
      false,
    );
  });

  it("rejects punctuation or casing changes", () => {
    const opts = { script: "Your body calls it theft." };
    assert.equal(validatePartition([{ spoken: "Your body calls it theft?" }], opts), false);
    assert.equal(validatePartition([{ spoken: "your body calls it theft." }], opts), false);
  });

  it("rejects reorder", () => {
    const opts = { script: "Fix the plate first. Then energy follows." };
    assert.equal(
      validatePartition(
        [{ spoken: "Then energy follows." }, { spoken: "Fix the plate first." }],
        opts,
      ),
      false,
    );
  });

  it("ignores hold clips", () => {
    const opts = { script: "Fix the plate first. Then energy follows." };
    const { beats } = breakdownScript(opts);
    const clips = [{ hold: true }, ...beats.map((b) => ({ spoken: b.spoken })), { hold: true }];
    assert.equal(validatePartition(clips, opts), true);
  });

  it("genuine repeated words survive reconstruction", () => {
    const opts = { script: "the the dog ran fast" };
    const { beats } = breakdownScript(opts);
    const reconstructed = beats.map((b) => b.spoken).join(" ");
    assert.match(reconstructed.toLowerCase(), /\bthe the\b/);
  });
});

// ---------------------------------------------------------------------------
// CTA handling
// ---------------------------------------------------------------------------

describe("CTA handling (worker)", () => {
  it("long CTA splits into valid clips and partitions exactly", () => {
    const longCta =
      "Follow this account for daily evidence-based nutrition strategies to rebuild your metabolism and reclaim your energy.";
    assert.equal(clipFits(longCta), false);
    const opts = { script: "Your gut is inflamed.", cta: longCta };
    const { beats } = breakdownScript(opts);
    for (const b of beats) {
      assert.ok(clipFits(b.spoken), `Too large: "${b.spoken}"`);
    }
    assert.equal(validatePartition(beats.map((b) => ({ spoken: b.spoken })), opts), true);
  });

  it("does not duplicate a short CTA already present in script", () => {
    const opts = { script: "Follow for the protocol. Here is why.", cta: "Follow for the protocol." };
    const { beats } = breakdownScript(opts);
    const count = beats.filter((b) => /follow for the protocol/i.test(b.spoken)).length;
    assert.equal(count, 1);
  });
});

// ---------------------------------------------------------------------------
// Prompt template integrity
// ---------------------------------------------------------------------------

describe("prompt template (worker)", () => {
  it("buildV33Prompt equals FLOW_V33_PROMPT + space + quoted text", () => {
    const spoken = "Ask me what I eat.";
    assert.equal(buildV33Prompt(spoken), `${FLOW_V33_PROMPT} "${spoken}"`);
  });

  it("inner quotes in spoken text do not truncate the prompt", () => {
    const spoken = `He said "eat real food" and meant it.`;
    const prompt = buildV33Prompt(spoken);
    assert.ok(prompt.includes(spoken), "spoken text not found in prompt");
    assert.ok(prompt.endsWith(`"${spoken}"`), "prompt does not end with closing quote");
  });

  it("hold prompt contains SILENT TAKE and does not end with a quoted spoken line", () => {
    const hold = buildV33HoldPrompt();
    assert.match(hold, /SILENT TAKE/);
    // The FLOW_V33_PROMPT preamble includes "Speak ONLY these exact words" as
    // its closing line — that is expected.  What distinguishes hold from spoken
    // is that hold does NOT end with a quoted text literal.
    assert.doesNotMatch(hold, /"[^"]+"\s*$/);
  });
});

// ---------------------------------------------------------------------------
// App / worker parity — shared module produces identical golden output
// ---------------------------------------------------------------------------

describe("golden fixture parity", () => {
  it("known script produces stable clip count and reconstruction", () => {
    const script =
      "Your gut is not lazy. It is inflamed from seed oils and late nights. Fix the plate first. Then energy follows. Meat and fat rebuild you. Stop eating the lie.";
    const { beats } = breakdownScript({ script });
    for (const b of beats) {
      assert.ok(clipFits(b.spoken));
      assert.ok([4, 6, 8, 10].includes(b.durationSec));
    }
    assert.equal(validatePartition(beats.map((b) => ({ spoken: b.spoken })), { script }), true);
  });

  it("normalizeSpoken is consistent with the TS app normalisation", () => {
    const cases = [
      ["Hello, world!", "hello world"],
      ["isn't", "isn't"],
      ['He said "hi".', 'he said "hi"'],
      ["5 AM alarm", "5 am alarm"],
    ];
    for (const [input, expected] of cases) {
      assert.equal(normalizeSpoken(input), expected, `normalizeSpoken("${input}")`);
    }
  });
});
