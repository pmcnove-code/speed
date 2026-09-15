import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFlowAssetChrome, rankAvailableCharacters, rankAvailableVoices, resolveFlowVoice } from "./voices.mjs";

describe("rankAvailableVoices", () => {
  it("uses the named custom voice when Flow already has it", () => {
    const elder = resolveFlowVoice({ handle: "elder-emeka" });
    assert.equal(rankAvailableVoices(elder, ["Charon", "African Elder", "Alnilam"])[0], "African Elder");
  });

  it("falls back to the closest stock voice by gender and pitch", () => {
    const elder = resolveFlowVoice({ handle: "elder-emeka" });
    assert.equal(rankAvailableVoices(elder, ["Achernar", "Aoede", "Charon", "Alnilam"])[0], "Charon");
    assert.equal(rankAvailableVoices(elder, ["Achernar", "Aoede", "Alnilam"])[0], "Alnilam");

    const ohio = resolveFlowVoice({ voiceName: "Ohio Mom" });
    assert.equal(rankAvailableVoices(ohio, ["Charon", "Alnilam", "Achernar"])[0], "Achernar");
  });

  it("matches Flow labels like Achird Male, friendly, mid pitch", () => {
    const elder = resolveFlowVoice({ handle: "elder-emeka" });
    assert.equal(
      rankAvailableVoices(elder, ["Achird Male, friendly, mid pitch", "Aoede Female, warm"])[0],
      "Achird Male, friendly, mid pitch",
    );
  });
});

describe("rankAvailableCharacters", () => {
  it("uses the named character when Flow already has it", () => {
    const elder = resolveFlowVoice({ handle: "elder-emeka" });
    assert.equal(rankAvailableCharacters(elder, ["Copy Studio", "African Elder"])[0], "African Elder");
  });

  it("picks a real library character instead of a missing custom name", () => {
    const elder = resolveFlowVoice({ handle: "elder-emeka" });
    assert.equal(rankAvailableCharacters(elder, ["Copy Studio"])[0], "Copy Studio");
    assert.deepEqual(rankAvailableCharacters(elder, []), []);
  });

  it("prefers a same-gender character when the wanted name is missing", () => {
    const elder = resolveFlowVoice({ handle: "elder-emeka" });
    assert.equal(rankAvailableCharacters(elder, ["Farm Woman", "Street Doctor"])[0], "Street Doctor");
  });

  it("ignores Flow chrome like Category navigation", () => {
    const elder = resolveFlowVoice({ handle: "elder-emeka" });
    assert.equal(isFlowAssetChrome("Category navigation"), true);
    assert.equal(isFlowAssetChrome("Select project"), true);
    assert.equal(isFlowAssetChrome("Charon Male, informative, lower pitch"), false);
    assert.deepEqual(rankAvailableCharacters(elder, ["Category navigation", "Select project"]), []);
    assert.equal(rankAvailableCharacters(elder, ["Category navigation", "Copy Studio"])[0], "Copy Studio");
  });
});
