import { describe, it, expect } from "vitest";
import { buildUserPrompt, parsePosts } from "./prompts";
import { dedupe, isNearDuplicate, similarity } from "./dedup";

function post(hook: string, script: string, on_screen_text: string[] = []) {
  return { hook, script, on_screen_text, cta: "", video_brief: "", angle_tag: "" };
}

describe("parsePosts", () => {
  it("parses a clean JSON array", () => {
    const posts = parsePosts(
      JSON.stringify([
        { hook: "h1", script: "s1", on_screen_text: ["a", "b"], cta: "c", video_brief: "v", angle_tag: "t" },
      ]),
    );
    expect(posts).toHaveLength(1);
    expect(posts[0].on_screen_text).toEqual(["a", "b"]);
  });

  it("strips markdown fences and surrounding prose", () => {
    const raw = 'Sure! Here you go:\n```json\n[{"hook":"h","script":"s"}]\n```';
    const posts = parsePosts(raw);
    expect(posts).toHaveLength(1);
    expect(posts[0].hook).toBe("h");
  });

  it("normalizes string on_screen_text to array and drops hookless posts", () => {
    const posts = parsePosts(JSON.stringify([
      { hook: "h", script: "s", on_screen_text: "line1\nline2" },
      { hook: "", script: "s2" },
    ]));
    expect(posts).toHaveLength(1);
    expect(posts[0].on_screen_text).toEqual(["line1", "line2"]);
  });

  it("throws when no array present", () => {
    expect(() => parsePosts("I cannot help with that")).toThrow();
  });

  it("accepts a single post object without an array wrapper", () => {
    const posts = parsePosts(JSON.stringify({ hook: "h", script: "s", onScreenText: ["a"] }));
    expect(posts).toHaveLength(1);
    expect(posts[0].hook).toBe("h");
    expect(posts[0].on_screen_text).toEqual(["a"]);
  });
});

describe("dedupe", () => {
  it("drops exact duplicate hook+script", () => {
    const a = post(
      "Your salad is lying to you",
      "You're not eating clean.\nYou're eating plants that wreck your gut.\nI swapped the bowl for steak.",
    );
    const { kept, rejected } = dedupe([a], [a]);
    expect(kept).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("drops a close paraphrase of hook+script", () => {
    const a = post(
      "Your salad is lying to you",
      "You're not eating clean.\nYou're eating plants that wreck your gut.\nI swapped the bowl for steak.\nAfternoons came back.",
    );
    const b = post(
      "That salad has been lying to you",
      "You aren't eating clean.\nYou are eating plants that wreck your gut.\nI swapped the bowl for a steak.\nMy afternoons came back.",
    );
    expect(isNearDuplicate(a, b)).toBe(true);
    const { kept, rejected } = dedupe([b], [a]);
    expect(kept).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("keeps a paraphrase when uniqueness dropping is off", () => {
    const a = post(
      "Your salad is lying to you",
      "You're not eating clean.\nYou're eating plants that wreck your gut.\nI swapped the bowl for steak.\nAfternoons came back.",
    );
    const b = post(
      "That salad has been lying to you",
      "You aren't eating clean.\nYou are eating plants that wreck your gut.\nI swapped the bowl for a steak.\nMy afternoons came back.",
    );
    expect(isNearDuplicate(a, b)).toBe(true);
    const { kept, rejected } = dedupe([b], [a], false);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toEqual(b);
    expect(rejected).toHaveLength(0);
  });

  it("drops a reordered-claim paraphrase", () => {
    const a = post(
      "Breakfast was the problem",
      "I slammed oatmeal at 7.\nCrashed by ten.\nEggs and beef fixed it.",
    );
    const b = post(
      "The problem was breakfast",
      "Oatmeal at 7am used to be my thing.\nI crashed by 10.\nEggs and beef fixed that.",
    );
    expect(isNearDuplicate(a, b)).toBe(true);
    expect(dedupe([b], [a]).kept).toHaveLength(0);
  });

  it("keeps clearly distinct copy", () => {
    const salad = post(
      "Your salad is lying to you",
      "You're not eating clean.\nYou're eating plants that wreck your gut.\nI swapped the bowl for steak.",
    );
    const nap = post(
      "I stopped napping at 2pm",
      "Used to vanish after lunch.\nSteak at noon changed that.\nNo more couch. Just work.",
    );
    expect(isNearDuplicate(salad, nap)).toBe(false);
    const { kept, rejected } = dedupe([salad, nap], []);
    expect(kept).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });

  const FACE_CLOSER = "If it didn't have a face, I don't eat it.";

  it("drops two scripts that share the same last line", () => {
    const a = post(
      "Honey I don't eat anything that smiles back",
      "They keep handing me a bowl of leaves.\nCall it clean.\nCall it wellness.\nI smile and pass it on.\n" + FACE_CLOSER,
    );
    const b = post(
      "My grandmama didn't raise a rabbit",
      "Church potluck tried me again.\nAll those casseroles with no name.\nI asked where the animal went.\nThey looked at me funny.\n" + FACE_CLOSER,
    );
    expect(isNearDuplicate(a, b)).toBe(true);
    const { kept, rejected } = dedupe([b], [a]);
    expect(kept).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("drops a near-paraphrase closer", () => {
    const a = post(
      "Honey I don't eat anything that smiles back",
      "They keep handing me a bowl of leaves.\nCall it clean.\nI smile and pass it on.\n" + FACE_CLOSER,
    );
    const b = post(
      "My grandmama didn't raise a rabbit",
      "Church potluck tried me again.\nI asked where the animal went.\nIf it didn't have a face I won't eat it",
    );
    expect(isNearDuplicate(a, b)).toBe(true);
    expect(dedupe([b], [a]).kept).toHaveLength(0);
  });

  it("keeps a distinct closer against the face punchline", () => {
    const a = post(
      "Honey I don't eat anything that smiles back",
      "They keep handing me a bowl of leaves.\nCall it clean.\nI smile and pass it on.\n" + FACE_CLOSER,
    );
    const b = post(
      "I stopped napping at 2pm",
      "Used to vanish after lunch.\nSteak at noon changed that.\nSave this. Then look at your breakfast.",
    );
    expect(isNearDuplicate(a, b)).toBe(false);
    expect(dedupe([a, b], []).kept).toHaveLength(2);
  });

  it("drops a shared sentence in the middle of otherwise different scripts", () => {
    const a = post(
      "Honey I don't eat anything that smiles back",
      "Church ladies mean well.\n" + FACE_CLOSER + "\nThen I walk home with leftover ham.\nThat's the whole religion.",
    );
    const b = post(
      "Breakfast used to wreck my afternoon",
      "Oatmeal at seven used to be my thing.\n" + FACE_CLOSER + "\nEggs and a ribeye fixed the crash.\nI work straight through now.",
    );
    expect(isNearDuplicate(a, b)).toBe(true);
    expect(dedupe([b], [a]).kept).toHaveLength(0);
  });

  it("drops similar wording of a sentence anywhere in the copy", () => {
    const a = post(
      "Honey I don't eat anything that smiles back",
      "Potluck Sunday got awkward.\nPlants never looked me in the eye so I stopped pretending they were dinner.\nI packed leftover brisket instead.",
    );
    const b = post(
      "I quit crashing after lunch",
      "Oatmeal used to flatten me by ten.\nPlants never looked me in the eye and I quit pretending they were supper.\nA steak at noon fixed the fog.",
    );
    expect(isNearDuplicate(a, b)).toBe(true);
    expect(dedupe([b], [a]).kept).toHaveLength(0);
  });

  it("keeps a closer collision when uniqueness dropping is off", () => {
    const a = post(
      "Honey I don't eat anything that smiles back",
      "They keep handing me a bowl of leaves.\n" + FACE_CLOSER,
    );
    const b = post(
      "My grandmama didn't raise a rabbit",
      "Church potluck tried me again.\n" + FACE_CLOSER,
    );
    expect(isNearDuplicate(a, b)).toBe(true);
    const { kept, rejected } = dedupe([b], [a], false);
    expect(kept).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it("drops near-duplicate hooks inside a batch and keeps the distinct one", () => {
    const { kept, rejected } = dedupe(
      [
        post("Your salad is lying to you", "s"),
        post("Your salad is lying to you!", "s"),
        post("I stopped napping at 2pm", "s"),
      ],
      [],
    );
    expect(kept).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(kept.map((p) => p.hook)).toContain("I stopped napping at 2pm");
  });

  it("respects the existing-hooks avoid list", () => {
    const { kept } = dedupe([post("Breakfast was the problem", "s")], ["breakfast was the problem"]);
    expect(kept).toHaveLength(0);
  });

  it("similarity is symmetric-ish and bounded", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("abc", "xyz")).toBeLessThan(0.5);
  });
});

describe("uniqueness prompt", () => {
  it("tells the model paraphrases of avoided hooks and scripts will be dropped", () => {
    const user = buildUserPrompt(3, [
      { hook: "Your salad is lying to you", script: "Plants wrecked my gut.\nSteak fixed it." },
    ]);
    expect(user).toMatch(/close paraphrases/i);
    expect(user).toMatch(/closer/i);
    expect(user).toMatch(/shared or\s+near-paraphrase sentence/i);
    expect(user).toContain("HOOK: Your salad is lying to you");
    expect(user).toContain("Plants wrecked my gut");
  });
});

describe("knowledge bank prompt block", () => {
  it("returns empty when there are no cards", async () => {
    const { knowledgeBankBlock } = await import("./knowledge");
    expect(knowledgeBankBlock([])).toBe("");
  });

  it("includes every title and shrinks briefs so the bank stays bounded", async () => {
    const { knowledgeBankBlock, BANK_CHAR_BUDGET } = await import("./knowledge");
    const huge = "x".repeat(6_000);
    const cards = ["A", "B", "C", "D", "E"].map((n) => ({ title: `Video ${n}`, digest: huge }));
    const block = knowledgeBankBlock(cards);
    expect(block).toContain("KNOWLEDGE BANK");
    expect(block).toContain("5 owner sources");
    for (const n of ["A", "B", "C", "D", "E"]) expect(block).toContain(`Video ${n}`);
    expect(block.length).toBeLessThan(BANK_CHAR_BUDGET + 2_000);
  });
});

describe("airtable field mapping", () => {
  it("writes Avatar, Copy, Model, Tokens — not Name/Notes", async () => {
    const { unknownFieldName, buildPostFields, formatCopy, avatarName, splitOutputTokens, groupPostsForAirtable } = await import("@/lib/airtable");
    const {
      REQUIRED_POST_FIELDS,
      isSchemaPermissionError,
      SCHEMA_SCOPE_ERROR,
      fieldsToDelete,
      sortFieldsForDelete,
      schemaGaps,
      isFieldDeleteUnsupported,
      isDuplicateFieldError,
    } = await import("@/lib/airtable-schema");

    expect(unknownFieldName('Unknown field name: "Avatar"')).toBe("Avatar");
    expect(
      unknownFieldName('{"error":{"type":"UNKNOWN_FIELD_NAME","message":"Unknown field name: \\"Avatar\\""}}'),
    ).toBe("Avatar");
    expect(avatarName("Rosa Perez", "rosa")).toBe("Rosa Perez");
    expect(avatarName("", "rosa")).toBe("rosa");
    expect(avatarName("  ", "")).toBe("");

    const copy = formatCopy({
      hook: "Skip the cleanse",
      script: "I tried it.\nGut said no.",
      on_screen_text: ["SKIP IT", "GUT SAID NO"],
      cta: "Follow for more",
    });
    expect(copy).toBe("Skip the cleanse\n\nI tried it.\nGut said no.\n\nFollow for more");
    expect(copy).not.toMatch(/ON SCREEN|VIDEO BRIEF|ANGLE|Notes|Persona:/);
    expect(formatCopy({ hook: "Same line", script: "Same line\nThen more" })).toBe("Same line\nThen more");
    expect(formatCopy({ hook: "Hook only", script: "", cta: "Follow for more" })).toBe("Hook only\n\nFollow for more");

    const fields = buildPostFields(
      { persona: "Rosa Perez", model: "grok-4.6", outputTokens: 412 },
      { hook: "Skip the cleanse", script: "I tried it.", on_screen_text: ["skip it"], cta: "follow" },
    );
    expect(fields).toEqual({
      Avatar: "Rosa Perez",
      Copy: "Skip the cleanse\n\nI tried it.\n\nfollow",
      Model: "grok-4.6",
      Tokens: 412,
    });
    expect(fields).not.toHaveProperty("Name");
    expect(fields).not.toHaveProperty("Notes");
    expect(fields).not.toHaveProperty("Status");

    const { buildLegacyFields, notesWithMeta, dropStatus } = await import("@/lib/airtable");
    const legacy = buildLegacyFields(
      { persona: "Rosa Perez", model: "grok-4.6", outputTokens: 412 },
      { hook: "Skip the cleanse", script: "I tried it.", on_screen_text: ["skip it"], cta: "follow" },
    );
    expect(legacy).toEqual({
      Name: "Rosa Perez",
      Notes: "Skip the cleanse\n\nI tried it.\n\nfollow\n\n— grok-4.6 · 412 tokens",
      Status: "draft",
    });
    expect(dropStatus(legacy)).toEqual({
      Name: "Rosa Perez",
      Notes: "Skip the cleanse\n\nI tried it.\n\nfollow\n\n— grok-4.6 · 412 tokens",
    });
    expect(notesWithMeta("body", "grok-4.6", 0)).toBe("body\n\n— grok-4.6");
    expect(notesWithMeta("body", "", 12)).toBe("body\n\n— 12 tokens");
    expect(notesWithMeta("body", "", 0)).toBe("body");

    expect(splitOutputTokens(100, 3)).toEqual([34, 33, 33]);
    expect(splitOutputTokens(5, 2)).toEqual([3, 2]);
    expect(splitOutputTokens(0, 2)).toEqual([0, 0]);
    expect(splitOutputTokens(10, 0)).toEqual([]);

    const grouped = groupPostsForAirtable([
      {
        batchId: 1,
        hook: "h1",
        script: "s1",
        cta: "c",
        personaName: "Rosa Perez",
        personaHandle: "rosa",
        model: "grok-4.6",
        batchOutputTokens: 100,
      },
      {
        batchId: 1,
        hook: "h2",
        script: "s2",
        personaName: "Rosa Perez",
        personaHandle: "rosa",
        model: "grok-4.6",
        batchOutputTokens: 100,
      },
      {
        batchId: 2,
        hook: "h3",
        script: "s3",
        personaName: "Coach Ken",
        personaHandle: "ken",
        model: "deepseek-chat",
        batchOutputTokens: 5,
      },
    ]);
    expect(grouped).toHaveLength(2);
    const rosa = grouped.find((g) => g.persona === "Rosa Perez");
    const ken = grouped.find((g) => g.persona === "Coach Ken");
    expect(rosa?.model).toBe("grok-4.6");
    expect(rosa?.posts.map((p) => p.outputTokens)).toEqual([50, 50]);
    expect(ken?.posts).toHaveLength(1);
    expect(ken?.posts[0]?.outputTokens).toBe(5);
    expect(ken?.model).toBe("deepseek-chat");

    expect(REQUIRED_POST_FIELDS.map((f) => f.name)).toEqual(["Avatar", "Copy", "Model", "Tokens"]);
    expect(REQUIRED_POST_FIELDS.find((f) => f.name === "Tokens")).toMatchObject({ type: "number", options: { precision: 0 } });
    expect(isSchemaPermissionError(403, '{"error":{"type":"INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND"}}')).toBe(true);
    expect(SCHEMA_SCOPE_ERROR).toMatch(/schema\.bases:write/);
    expect(
      fieldsToDelete({
        primaryFieldId: "fldName",
        fields: [
          { id: "fldName", name: "Name", type: "singleLineText" },
          { id: "fldNotes", name: "Notes", type: "multilineText" },
          { id: "fldStatus", name: "Status", type: "singleSelect" },
          { id: "fldAtt", name: "Attachments", type: "multipleAttachments" },
          { id: "fldSum", name: "Attachment Summary", type: "count" },
          { id: "fldCopy", name: "Copy", type: "multilineText" },
        ],
      }).map((f) => f.name),
    ).toEqual(["Notes", "Status", "Attachments", "Attachment Summary"]);
    expect(
      sortFieldsForDelete([
        { id: "fldAtt", name: "Attachments", type: "multipleAttachments" },
        { id: "fldSum", name: "Attachment Summary", type: "aiText" },
        { id: "fldNotes", name: "Notes", type: "multilineText" },
      ]).map((f) => f.name),
    ).toEqual(["Attachment Summary", "Notes", "Attachments"]);
    expect(
      schemaGaps({
        primaryFieldId: "fldAv",
        fields: [
          { id: "fldAv", name: "Avatar", type: "singleLineText" },
          { id: "fldNotes", name: "Notes", type: "multilineText" },
        ],
      }),
    ).toEqual({ missing: ["Copy", "Model", "Tokens"], extras: ["Notes"] });
    expect(isFieldDeleteUnsupported(404, '{"error":"NOT_FOUND"}')).toBe(true);
    expect(isFieldDeleteUnsupported(200, "{}")).toBe(false);
    expect(isDuplicateFieldError(422, '{"error":{"message":"DUPLICATE_FIELD_NAME"}}')).toBe(true);
    expect(isDuplicateFieldError(403, SCHEMA_SCOPE_ERROR)).toBe(false);
  });
});

describe("config validation", () => {
  it("accepts an Airtable app id and rejects junk", async () => {
    const { validateConfigValue, maskSecret, parseAirtableRef, normalizeConfigValues } = await import("@/lib/config");
    expect(validateConfigValue("AIRTABLE_BASE_ID", "appABCDEF12345678")).toBeNull();
    expect(validateConfigValue("AIRTABLE_BASE_ID", "appA5eyVaJKYhFPTx/tbl8skI3MeMAsHsYG")).toBeNull();
    expect(validateConfigValue("AIRTABLE_BASE_ID", "https://airtable.com/appA5eyVaJKYhFPTx/tbl8skI3MeMAsHsYG")).toBeNull();
    expect(validateConfigValue("AIRTABLE_BASE_ID", "not-a-base")).toMatch(/app/);
    expect(parseAirtableRef("appA5eyVaJKYhFPTx/tbl8skI3MeMAsHsYG")).toEqual({
      baseId: "appA5eyVaJKYhFPTx",
      tableId: "tbl8skI3MeMAsHsYG",
    });
    expect(
      parseAirtableRef("https://airtable.com/appA5eyVaJKYhFPTx/tbl8skI3MeMAsHsYG/viwABCDE12345678?blocks=hide"),
    ).toEqual({
      baseId: "appA5eyVaJKYhFPTx",
      tableId: "tbl8skI3MeMAsHsYG",
      viewId: "viwABCDE12345678",
    });
    expect(parseAirtableRef("https://www.airtable.com/appA5eyVaJKYhFPTx")).toEqual({
      baseId: "appA5eyVaJKYhFPTx",
    });
    expect(normalizeConfigValues({ AIRTABLE_BASE_ID: "appA5eyVaJKYhFPTx/tbl8skI3MeMAsHsYG" })).toEqual({
      AIRTABLE_BASE_ID: "appA5eyVaJKYhFPTx",
      AIRTABLE_TABLE: "tbl8skI3MeMAsHsYG",
    });
    expect(
      normalizeConfigValues({
        AIRTABLE_BASE_ID: "https://airtable.com/appA5eyVaJKYhFPTx/tbl8skI3MeMAsHsYG/viwABCDE12345678",
        AIRTABLE_TABLE: "Posts",
      }),
    ).toEqual({
      AIRTABLE_BASE_ID: "appA5eyVaJKYhFPTx",
      AIRTABLE_TABLE: "tbl8skI3MeMAsHsYG",
    });
    expect(validateConfigValue("GEN_CHUNK", "9")).toMatch(/1–8/);
    expect(validateConfigValue("GEN_TEMPERATURE", "0.9")).toBeNull();
    expect(validateConfigValue("GEN_UNIQUE_DROP", "0")).toBeNull();
    expect(validateConfigValue("GEN_UNIQUE_DROP", "false")).toBeNull();
    expect(validateConfigValue("GEN_UNIQUE_DROP", "maybe")).toMatch(/1 \(drop/);
    const { parseEnabled } = await import("@/lib/config");
    expect(parseEnabled("", true)).toBe(true);
    expect(parseEnabled("0")).toBe(false);
    expect(parseEnabled("off")).toBe(false);
    expect(parseEnabled("1")).toBe(true);
    expect(maskSecret("patY6lp1cynlj4Bt2xxxx")).toMatch(/patY…xxxx/);
  });
});

describe("provider ids", () => {
  it("parses known providers and defaults to deepseek", async () => {
    const { parseProviderId } = await import("@/lib/llm/provider");
    expect(parseProviderId("grok")).toBe("grok");
    expect(parseProviderId("venice")).toBe("venice");
    expect(parseProviderId("nope")).toBe("deepseek");
  });
});

describe("youtube helpers", () => {
  it("parses watch, short, and youtu.be URLs", async () => {
    const { parseYouTubeId, canonicalYouTubeUrl } = await import("@/lib/youtube");
    const id = "dQw4w9WgXcQ";
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${id}`)).toBe(id);
    expect(parseYouTubeId(`https://youtu.be/${id}?t=12`)).toBe(id);
    expect(parseYouTubeId(`https://youtube.com/shorts/${id}`)).toBe(id);
    expect(parseYouTubeId("not a url")).toBeNull();
    expect(canonicalYouTubeUrl(id)).toContain(id);
  });

  it("flattens caption json3 and vtt into plain text", async () => {
    const { transcriptFromCaptionJson3, transcriptFromVtt, transcriptFromDeepgram } = await import("@/lib/youtube");
    expect(
      transcriptFromCaptionJson3({
        events: [{ segs: [{ utf8: "Hello" }, { utf8: " world" }] }, { segs: [{ utf8: "Next." }] }],
      }),
    ).toBe("Hello world Next.");
    expect(
      transcriptFromVtt(`WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello <c>world</c>\n`),
    ).toBe("Hello world");
    expect(
      transcriptFromDeepgram({
        results: { channels: [{ alternatives: [{ transcript: "hi", paragraphs: { transcript: "Hi there." } }] }] },
      }),
    ).toBe("Hi there.");
  });

  it("reads string or segment transcript payloads from caption relays", async () => {
    const { transcriptFromRelayPayload } = await import("@/lib/youtube");
    expect(transcriptFromRelayPayload({ transcript: "Fasting  is useful." })).toBe("Fasting is useful.");
    expect(transcriptFromRelayPayload({ transcript: [{ text: "Hello" }, { text: "world" }] })).toBe("Hello world");
    expect(transcriptFromRelayPayload({ text: "plain" })).toBe("plain");
    expect(transcriptFromRelayPayload({})).toBe("");
  });
});
