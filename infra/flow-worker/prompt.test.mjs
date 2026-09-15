import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dialogueFingerprint, promptLanded } from "./prompt.mjs";

const c01 =
  "8-second 9:16 photoreal talking-head, part 1 of 7. DIALOGUE — speak this and only this. <<< They stripped the fat and called it health. Your body calls it theft. >>>";
const c02 =
  "8-second 9:16 photoreal talking-head, part 2 of 7. DIALOGUE — speak this and only this. <<< In my village, a man's word was his weight. Fat meant strength. >>>";

describe("dialogueFingerprint", () => {
  it("reads the spoken block, not the shared 8-second prefix", () => {
    assert.match(dialogueFingerprint(c01), /stripped the fat/i);
    assert.match(dialogueFingerprint(c02), /in my village/i);
    assert.notEqual(dialogueFingerprint(c01), dialogueFingerprint(c02));
  });
});

describe("dialogueFingerprint v3.3", () => {
  it("reads the quoted speak-only line", () => {
    const p =
      'Fictional comedy sketch, educational parody. Speak ONLY these exact words, nothing before, nothing after: "They stripped the fat and called it health."';
    assert.match(dialogueFingerprint(p), /stripped the fat/i);
  });
});

describe("promptLanded", () => {
  it("does not treat C01 leftover text as C02", () => {
    assert.equal(promptLanded(c01, c02), false);
    assert.equal(promptLanded(c01, c01), true);
    assert.equal(promptLanded(c02, c02), true);
  });

  it("rejects the shared prefix alone", () => {
    assert.equal(promptLanded("8-second 9:16 photoreal talking-head, part 1 of 7.", c02), false);
  });

  it("requires the complete prompt, not only the first 48 dialogue characters", () => {
    const shared = "This deliberately long opening is identical across two separate clip prompts";
    const first = `Fictional comedy sketch. Speak ONLY these exact words, nothing before, nothing after: "${shared} and ends with apples."`;
    const second = `Fictional comedy sketch. Speak ONLY these exact words, nothing before, nothing after: "${shared} and ends with oranges."`;
    assert.equal(promptLanded(first, second), false);
    assert.equal(promptLanded(second, second), true);
  });
});

describe('available character substitution', () => {
  it('never changes names spoken in the exact script', async () => {
    const { applyLiveNames } = await import('./prompt.mjs');
    const prompt = 'Use Latino Dad. Speak ONLY these exact words, nothing before, nothing after: "Latino Dad told me to cook."';
    const result = applyLiveNames(prompt, { character: 'Latino Dad' }, { character: 'African Elder' });
    assert.ok(result.startsWith('Use African Elder.'));
    assert.equal(dialogueFingerprint(result), 'Latino Dad told me to cook.');
  });
});
