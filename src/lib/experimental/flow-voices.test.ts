import { describe, expect, it } from "vitest";
import { resolveFlowVoice, rankAvailableVoices, rankAvailableCharacters } from "./flow-voices";

describe("resolveFlowVoice", () => {
  it("maps Copy Studio handles to editor-guide characters", () => {
    expect(resolveFlowVoice({ handle: "farm-mabel" }).character).toBe("Farm Woman");
    expect(resolveFlowVoice({ handle: "elder-emeka" }).character).toBe("African Elder");
    expect(resolveFlowVoice({ handle: "coach-andre" }).character).toBe("Street Doctor");
    expect(resolveFlowVoice({ handle: "papa-diego" }).character).toBe("Latino Dad");
    expect(resolveFlowVoice({ handle: "diane-midlife-reset" }).character).toBe("Suburban Mom");
    expect(resolveFlowVoice({ handle: "colette-de-paris" }).character).toBe("Parisian Woman");
    expect(resolveFlowVoice({ handle: "mei-quiet-glow" }).character).toBe("Hong Kong Woman");
    expect(resolveFlowVoice({ handle: "road-hank" }).character).toBe("Trucker");
    expect(resolveFlowVoice({ handle: "marcus-meat-first" }).character).toBe("Doctor");
    expect(resolveFlowVoice({ handle: "rosa-gut-calm" }).character).toBe("Suburban Mom");
  });

  it("honors an explicit voice name and Ohio Mom", () => {
    expect(resolveFlowVoice({ voiceName: "Ohio Mom" }).baseVoice).toBe("Achernar");
    expect(resolveFlowVoice({ name: "Ohio Mom" }).character).toBe("Ohio Mom");
    expect(resolveFlowVoice({ voiceName: "Farm Woman" }).baseVoice).toBe("Sulafat");
  });

  it("uses the listed Gemini base voices", () => {
    expect(resolveFlowVoice({ handle: "coach-andre" }).baseVoice).toBe("Sadachbia");
    expect(resolveFlowVoice({ handle: "elder-emeka" }).baseVoice).toBe("Charon");
    expect(resolveFlowVoice({ handle: "marcus-meat-first" }).type).toBe("Male");
    expect(resolveFlowVoice({ handle: "farm-mabel" }).type).toBe("Female");
    expect(resolveFlowVoice({ handle: "marcus-meat-first" }).sampleDialogue).toMatch(/Most doctors won't say this/i);
    expect(resolveFlowVoice({ handle: "elder-emeka" }).sampleDialogue).toMatch(/My father ate this way/i);
    expect(resolveFlowVoice({ handle: "rosa-gut-calm" }).sampleDialogue).toMatch(/ninety-eight pounds/i);
  });

  it("picks the closest stock voice when the custom name is missing", () => {
    const elder = resolveFlowVoice({ handle: "elder-emeka" });
    const stock = ["Achernar", "Aoede", "Charon", "Alnilam", "Sulafat"];
    expect(rankAvailableVoices(elder, stock)[0]).toBe("Charon");
    expect(rankAvailableVoices(elder, ["Achernar", "Aoede", "Alnilam"])[0]).toBe("Alnilam");

    const ohio = resolveFlowVoice({ voiceName: "Ohio Mom" });
    expect(rankAvailableVoices(ohio, ["Charon", "Alnilam", "Achernar", "Aoede"])[0]).toBe("Achernar");
    expect(rankAvailableVoices(ohio, ["African Elder", "Aoede", "Charon"])[0]).toBe("Aoede");
    expect(rankAvailableVoices(elder, ["Achird Male, friendly, mid pitch", "Aoede"])[0]).toBe(
      "Achird Male, friendly, mid pitch",
    );
  });

  it("picks a Flow library character instead of a missing custom name", () => {
    const elder = resolveFlowVoice({ handle: "elder-emeka" });
    expect(rankAvailableCharacters(elder, ["Copy Studio", "African Elder"])[0]).toBe("African Elder");
    expect(rankAvailableCharacters(elder, ["Copy Studio"])[0]).toBe("Copy Studio");
    expect(rankAvailableCharacters(elder, ["Farm Woman", "Street Doctor"])[0]).toBe("Street Doctor");
    expect(rankAvailableCharacters(elder, [])).toEqual([]);
  });
});
