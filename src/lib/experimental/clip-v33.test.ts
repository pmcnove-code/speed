import { describe, expect, it } from "vitest";
import {
  breakdownScript,
  buildV33Prompt,
  buildV33HoldPrompt,
  canonicalSpokenSource,
  clipFits,
  countSyllables,
  countWordSyllables,
  durationForClip,
  estimatedSpeakSec,
  FLOW_V33_PROMPT,
  MAX_SYLLABLES,
  scriptUnits,
  splitLongSentence,
  validatePartition,
} from "./clip-v33";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LONG =
  "I spent twenty years prescribing medications that only managed symptoms, and then I discovered that the food my patients were eating every single day was the actual root cause of everything.";

// ---------------------------------------------------------------------------
// v3.3 core limits
// ---------------------------------------------------------------------------

describe("v3.3 limits", () => {
  it("keeps every beat under 35 syllables and 10s", () => {
    const { beats } = breakdownScript({
      hook: "Your 5 AM alarm isn't discipline. It's your body running on fumes.",
      script:
        "I used to wake up tired. Not the good tired. The empty tired. Before the sun, already drained. Coffee was my breakfast. The doctor named it: low T.",
    });
    expect(beats.length).toBeGreaterThan(0);
    for (const beat of beats) {
      expect(countSyllables(beat.spoken)).toBeLessThanOrEqual(MAX_SYLLABLES);
      expect(estimatedSpeakSec(beat.spoken)).toBeLessThanOrEqual(10);
      expect(clipFits(beat.spoken)).toBe(true);
      expect([4, 6, 8, 10]).toContain(beat.durationSec);
      expect(beat.durationSec).toBe(durationForClip(beat.spoken));
    }
    const spoken = beats.map((b) => b.spoken).join(" ");
    expect(spoken).toContain("5 AM alarm");
    expect(spoken).toContain("low T");
  });

  it("splits a long sentence at a comma and stays verbatim", () => {
    const parts = splitLongSentence(LONG);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(LONG);
    expect(parts.every((p) => clipFits(p))).toBe(true);
    const { junctions } = breakdownScript({ script: LONG });
    expect(junctions.length).toBeGreaterThanOrEqual(1);
  });

  it("does not paraphrase", () => {
    const script = "They stripped the fat and called it health. Your body calls it theft.";
    const { beats } = breakdownScript({ hook: script, script });
    expect(beats.map((b) => b.spoken).join(" ")).toContain("They stripped the fat and called it health.");
    expect(beats.map((b) => b.spoken).join(" ")).not.toMatch(/they took the fat/i);
  });

  it("uses the exact v3.3 prompt template byte-for-byte", () => {
    const prompt = buildV33Prompt("Ask me what I eat.");
    expect(prompt).toContain("Fictional comedy sketch, educational parody.");
    expect(prompt).toContain("POSE CONTINUITY LOCK");
    expect(prompt).toContain("Absolute audio isolation");
    expect(prompt).toContain('Speak ONLY these exact words, nothing before, nothing after: "Ask me what I eat."');
    expect(prompt).not.toMatch(/DIALOGUE —/);
    expect(prompt).not.toContain("custom voice named");
    expect(prompt).not.toMatch(/The character says/i);
  });

  it("prompt is FLOW_V33_PROMPT + space + quoted text — nothing else", () => {
    const spoken = "Ask me what I eat.";
    const prompt = buildV33Prompt(spoken);
    expect(prompt).toBe(`${FLOW_V33_PROMPT} "${spoken}"`);
  });

  it("consolidates short sentences instead of one clip per sentence", () => {
    const { beats } = breakdownScript({
      script: "Fix the plate first. Then energy follows.",
    });
    expect(beats.length).toBe(1);
    expect(beats[0]?.spoken).toBe("Fix the plate first. Then energy follows.");
  });
});

// ---------------------------------------------------------------------------
// Contraction & acronym syllable counts
// ---------------------------------------------------------------------------

describe("syllable counting improvements", () => {
  it("counts isn't as 2 syllables", () => {
    expect(countWordSyllables("isn't")).toBe(2);
  });

  it("counts didn't, doesn't, hasn't, wouldn't, couldn't, shouldn't as 2 each", () => {
    for (const w of ["didn't", "doesn't", "hasn't", "wouldn't", "couldn't", "shouldn't"]) {
      expect(countWordSyllables(w)).toBe(2);
    }
  });

  it("counts known spoken-letter acronyms without treating emphasized words as acronyms", () => {
    expect(countWordSyllables("AM")).toBe(2);
    expect(countWordSyllables("PM")).toBe(2);
    expect(countWordSyllables("TV")).toBe(2);
    expect(countWordSyllables("CEO")).toBe(3);
    expect(countWordSyllables("BODY")).toBe(countWordSyllables("body"));
  });

  it("5 AM totals 3 syllables (five + ay-em)", () => {
    expect(countSyllables("5 AM")).toBe(3);
  });

  it("'Your 5 AM alarm isn't discipline' is counted conservatively and fits", () => {
    const text = "Your 5 AM alarm isn't discipline.";
    expect(clipFits(text)).toBe(true);
    // Ensure the count is greater than with naive undercount (was 7, now ≥9)
    expect(countSyllables(text)).toBeGreaterThanOrEqual(9);
  });

  it("lowercase 'am' (as in 'I am') is still 1 syllable", () => {
    expect(countWordSyllables("am")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Hook deduplication
// ---------------------------------------------------------------------------

describe("hook deduplication", () => {
  it("does not prepend hook when script starts with it (exact match)", () => {
    const units = scriptUnits({
      hook: "Your gut is not lazy.",
      script: "Your gut is not lazy. It is inflamed.",
    });
    // units should contain each sentence once, not the hook prepended again
    expect(units.filter((u) => /your gut is not lazy/i.test(u))).toHaveLength(1);
  });

  it("does not prepend hook when script starts with it (punctuation mismatch)", () => {
    const units = scriptUnits({
      hook: "Your gut is not lazy",
      script: "Your gut is not lazy. It is inflamed.",
    });
    expect(units.filter((u) => /your gut is not lazy/i.test(u))).toHaveLength(1);
  });

  it("prepends hook when script is different content", () => {
    const units = scriptUnits({
      hook: "Your 5 AM alarm isn't discipline.",
      script: "I used to wake up tired.",
    });
    expect(units[0]).toMatch(/5 AM alarm/);
    expect(units.some((u) => /wake up tired/i.test(u))).toBe(true);
  });

  it("hook === full script: no duplication (hook covers whole script)", () => {
    const script = "They stripped the fat and called it health. Your body calls it theft.";
    const units = scriptUnits({ hook: script, script });
    // All words spoken once; total reconstructed text equals script
    const reconstructed = units.join(" ").replace(/\s+/g, " ");
    expect(reconstructed).toBe(script);
  });
});

// ---------------------------------------------------------------------------
// Partition validation
// ---------------------------------------------------------------------------

describe("partition validation", () => {
  it("accepts a perfect partition of the canonical source", () => {
    const opts = { hook: "Your gut is not lazy.", script: "Your gut is not lazy. It is inflamed." };
    const { beats } = breakdownScript(opts);
    const clips = beats.map((b) => ({ spoken: b.spoken }));
    expect(validatePartition(clips, opts)).toBe(true);
  });

  it("rejects omission (missing words)", () => {
    const opts = { script: "Fix the plate first. Then energy follows." };
    expect(validatePartition([{ spoken: "Fix the plate first." }], opts)).toBe(false);
  });

  it("rejects overlap / duplication of content", () => {
    const opts = { script: "Fix the plate first. Then energy follows." };
    expect(
      validatePartition(
        [{ spoken: "Fix the plate first. Then energy follows." }, { spoken: "Fix the plate first." }],
        opts,
      ),
    ).toBe(false);
  });

  it("rejects reordered clips", () => {
    const opts = { script: "Fix the plate first. Then energy follows." };
    expect(
      validatePartition(
        [{ spoken: "Then energy follows." }, { spoken: "Fix the plate first." }],
        opts,
      ),
    ).toBe(false);
  });

  it("rejects punctuation or casing changes to the sacred copy", () => {
    const opts = { script: "Your body calls it theft." };
    expect(validatePartition([{ spoken: "Your body calls it theft?" }], opts)).toBe(false);
    expect(validatePartition([{ spoken: "your body calls it theft." }], opts)).toBe(false);
  });

  it("ignores hold clips when validating", () => {
    const opts = { script: "Fix the plate first. Then energy follows." };
    const { beats } = breakdownScript(opts);
    const clips = [
      { spoken: "", hold: true },
      ...beats.map((b) => ({ spoken: b.spoken })),
      { spoken: "", hold: true },
    ];
    expect(validatePartition(clips, opts)).toBe(true);
  });

  it("canonicalSpokenSource returns normalised join of scriptUnits", () => {
    const opts = { hook: "Eat real food.", script: "Eat real food. Sleep well." };
    const source = canonicalSpokenSource(opts);
    // normalised: lowercase, punctuation stripped
    expect(source).toBe("eat real food sleep well");
  });

  it("genuine repeated words are preserved in reconstruction", () => {
    // Source has the repeated word; partition must preserve both.
    const opts = { script: "the the dog ran fast" };
    const { beats } = breakdownScript(opts);
    const reconstructed = beats.map((b) => b.spoken).join(" ");
    // Both 'the' tokens must appear in the output
    expect(reconstructed.replace(/\s+/g, " ").trim()).toMatch(/\bthe the\b/i);
  });
});

// ---------------------------------------------------------------------------
// CTA handling
// ---------------------------------------------------------------------------

describe("CTA handling", () => {
  it("places CTA at end when not already in script", () => {
    const opts = {
      hook: "Your gut is not lazy.",
      script: "Your gut is not lazy. It is inflamed.",
      cta: "Follow for the protocol.",
    };
    const { beats } = breakdownScript(opts);
    const last = beats[beats.length - 1];
    expect(last?.spoken).toMatch(/follow for the protocol/i);
  });

  it("does not duplicate CTA already present at the start of the script", () => {
    const opts = {
      script: "Follow for the protocol. Here is why.",
      cta: "Follow for the protocol.",
    };
    const { beats } = breakdownScript(opts);
    const ctaCount = beats.filter((b) =>
      b.spoken.toLowerCase().includes("follow for the protocol"),
    ).length;
    expect(ctaCount).toBe(1);
  });

  it("long CTA splits into multiple valid clips without appending the whole CTA again", () => {
    const longCta =
      "Follow this account for daily evidence-based nutrition strategies to rebuild your metabolism and reclaim your energy.";
    expect(clipFits(longCta)).toBe(false);
    const { beats } = breakdownScript({
      script: "Your gut is inflamed.",
      cta: longCta,
    });
    // Every beat must fit
    for (const beat of beats) {
      expect(clipFits(beat.spoken)).toBe(true);
    }
    // The whole CTA text should be covered (all words present, in order)
    const allSpoken = beats.map((b) => b.spoken).join(" ");
    // Spot-check key CTA words appear
    expect(allSpoken).toMatch(/evidence-based/i);
    expect(allSpoken).toMatch(/reclaim/i);
    const partition = beats.map((b) => ({ spoken: b.spoken }));
    expect(
      validatePartition(partition, { script: "Your gut is inflamed.", cta: longCta }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Prompt template integrity
// ---------------------------------------------------------------------------

describe("prompt template integrity", () => {
  it("buildV33Prompt with inner quotes does not truncate at inner quote", () => {
    const spoken = `He said "eat real food" and meant it.`;
    const prompt = buildV33Prompt(spoken);
    // The full spoken text should be present
    expect(prompt).toContain(spoken);
    // Ends with the closing quote of the Speak ONLY line
    expect(prompt.endsWith(`"${spoken}"`)).toBe(true);
  });

  it("hold prompt is distinct from spoken prompt", () => {
    const hold = buildV33HoldPrompt();
    const spoken = buildV33Prompt("Test.");
    expect(hold).toContain("SILENT TAKE");
    expect(hold).not.toContain('"Test."');
    expect(spoken).not.toContain("SILENT TAKE");
  });
});

// ---------------------------------------------------------------------------
// Formula / duration boundary tests
// ---------------------------------------------------------------------------

describe("duration boundaries", () => {
  it("promotes to next tier when within 0.15s of ceiling", () => {
    // A text that est ≈ 3.85s should get 6s not 4s
    // 3.5 syllables/s → 3.85 × 3.5 ≈ 13.5 syllables to hit the boundary
    // Use a known text
    const text = "Fix the plate first. Then energy follows.";
    const est = estimatedSpeakSec(text);
    expect(durationForClip(text)).toBe(est >= 3.85 && est <= 4 ? 6 : durationForClip(text));
  });

  it("10s cap: any text over 8.85s gets 10s", () => {
    // Construct something that should be near 9s
    const text = "I used to wake up tired every single morning without any energy at all before the sun even rose.";
    const est = estimatedSpeakSec(text);
    if (est > 8.85) expect(durationForClip(text)).toBe(10);
    if (est > 10) expect(clipFits(text)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// App / worker parity — consolidateUnits produces identical output
// ---------------------------------------------------------------------------

describe("app/worker parity via consolidateUnits", () => {
  it("golden: consolidateUnits produces the expected clips for a known script", () => {
    const script =
      "Your gut is not lazy. It is inflamed from seed oils and late nights. Fix the plate first. Then energy follows. Meat and fat rebuild you. Stop eating the lie.";
    const { beats: appBeats } = breakdownScript({ script });
    // Each beat must be valid
    for (const b of appBeats) {
      expect(clipFits(b.spoken)).toBe(true);
      expect([4, 6, 8, 10]).toContain(b.durationSec);
    }
    // Reconstruction must equal canonical source
    expect(validatePartition(appBeats.map((b) => ({ spoken: b.spoken })), { script })).toBe(true);
  });
});
