import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FLOW_BLOCKED,
  buildVideoGenerateInput,
  directPromptForCharacter,
  flowGenerationTransport,
  flowRpcMode,
  parseBatchExecuteResponse,
  parseProjectInventory,
  parseWorkflowDetail,
  resolveCharacter,
  resolveVoice,
} from "./flow-rpc.mjs";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Wrap JSON in a single length-prefixed batchexecute chunk. */
function wrapChunk(json) {
  const body = JSON.stringify(json);
  return `)]}'\n\n${body.length}\n${body}`;
}

// ─── flowRpcMode ──────────────────────────────────────────────────────────────

describe("flowRpcMode", () => {
  it("extracts at, fSid, bl from WIZ_global_data", () => {
    const mode = flowRpcMode({ SNlM0e: "tok", FdrFJe: "sid", cfb2h: "bl" });
    assert.equal(mode.at, "tok");
    assert.equal(mode.fSid, "sid");
    assert.equal(mode.bl, "bl");
  });

  it("returns nulls for missing or empty WIZ_global_data", () => {
    const mode = flowRpcMode({});
    assert.equal(mode.at, null);
    assert.equal(mode.fSid, null);
    assert.equal(mode.bl, null);
    const none = flowRpcMode(null);
    assert.equal(none.at, null);
  });
});

describe("flowGenerationTransport", () => {
  it("enables only explicit direct-RPC aliases", () => {
    assert.equal(flowGenerationTransport("rpc"), "rpc");
    assert.equal(flowGenerationTransport("API"), "rpc");
    assert.equal(flowGenerationTransport("direct"), "rpc");
  });

  it("defaults unknown or missing values to UI", () => {
    assert.equal(flowGenerationTransport("ui"), "ui");
    assert.equal(flowGenerationTransport("auto"), "ui");
    assert.equal(flowGenerationTransport(undefined), "ui");
  });
});

// ─── buildVideoGenerateInput ──────────────────────────────────────────────────

describe("buildVideoGenerateInput", () => {
  it("has exact one-output R2V wire shape", () => {
    const input = buildVideoGenerateInput({
      prompt: "A doctor speaks to camera",
      durationSec: 8,
      entityId: "entity-aaa",
      voiceId: "charon",
      projectId: "proj-bbb",
      captchaToken: "tok-ccc",
    });

    assert.equal(input.length, 3, "top-level must have 3 elements");

    const [requests, meta, tail] = input;

    // Tail: [UUID_UPPER, 2] — constant 2 even for UI ×1
    assert.equal(tail.length, 2);
    assert.equal(tail[1], 2, "final batch constant must be 2");
    assert.match(String(tail[0]), /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);

    // Meta row: [null,22,null,null,null,projectId,...,[captchaToken,1]]
    assert.equal(meta[1], 22);
    assert.equal(meta[5], "proj-bbb");
    assert.deepEqual(meta[10], ["tok-ccc", 1]);

    // Request inner shape
    const req = requests[0];
    assert.deepEqual(req[0], [null, null, [[["A doctor speaks to camera"]]]]);
    assert.equal(req[2], "abra_r2v_8s");
    assert.equal(req[3], 1);
    assert.deepEqual(req[7], [["charon"]]);
    assert.deepEqual(req[9], [["entity-aaa"]]);

    // UUID fields in request[5]
    const uuidRe = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
    assert.match(String(req[5][4]), uuidRe);
    assert.match(String(req[5][5]), uuidRe);
  });

  it("uses the correct abra_r2v_<n>s duration suffix", () => {
    const i5 = buildVideoGenerateInput({ prompt: "p", durationSec: 5, entityId: "e", projectId: "p", captchaToken: "t" });
    assert.equal(i5[0][0][2], "abra_r2v_5s");

    const i16 = buildVideoGenerateInput({ prompt: "p", durationSec: 16, entityId: "e", projectId: "p", captchaToken: "t" });
    assert.equal(i16[0][0][2], "abra_r2v_16s");
  });

  it("omits the voice ingredient when no voice id is supplied", () => {
    const input = buildVideoGenerateInput({
      prompt: "p",
      durationSec: 8,
      entityId: "e",
      projectId: "p",
      captchaToken: "t",
    });
    assert.equal(input[0][0][7], null);
  });

  it("each call produces fresh UUIDs", () => {
    const a = buildVideoGenerateInput({ prompt: "p", durationSec: 8, entityId: "e", projectId: "p", captchaToken: "t" });
    const b = buildVideoGenerateInput({ prompt: "p", durationSec: 8, entityId: "e", projectId: "p", captchaToken: "t" });
    // Tail UUID should differ between calls (probabilistically)
    assert.notEqual(a[2][0], b[2][0]);
  });
});

// ─── parseBatchExecuteResponse ────────────────────────────────────────────────

describe("parseBatchExecuteResponse", () => {
  it("returns empty array for empty / prefix-only input", () => {
    assert.deepEqual(parseBatchExecuteResponse(""), []);
    assert.deepEqual(parseBatchExecuteResponse(")]}'\n"), []);
    assert.deepEqual(parseBatchExecuteResponse(")]}'\n\n"), []);
  });

  it("parses a successful wrb.fr row", () => {
    const payload = JSON.stringify(["mediaId", "projId", "wfId", "CAE"]);
    const row = ["wrb.fr", "Zzl0ze", payload, null, null, null, "generic"];
    const text = wrapChunk([row]);

    const rows = parseBatchExecuteResponse(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][1], "Zzl0ze");
    assert.equal(rows[0][2], payload);
    assert.equal(rows[0][5], null);
  });

  it("parses multiple wrb.fr rows from a single chunk", () => {
    const rowA = ["wrb.fr", "Zzl0ze", '"payloadA"', null, null, null, "generic"];
    const rowB = ["wrb.fr", "as29s", '"payloadB"', null, null, null, "generic"];
    const text = wrapChunk([rowA, rowB]);

    const rows = parseBatchExecuteResponse(text);
    assert.equal(rows.length, 2);
    assert.equal(rows[0][1], "Zzl0ze");
    assert.equal(rows[1][1], "as29s");
  });

  it("extracts wrb.fr rows nested inside outer arrays", () => {
    const row = ["wrb.fr", "MZZa6b", '"p"', null, null, null, "generic"];
    // Wrapped in an extra outer array (as Google sometimes emits)
    const text = wrapChunk([[row], ["di", []]]);
    const rows = parseBatchExecuteResponse(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][1], "MZZa6b");
  });

  it("exposes unusual-activity error field intact", () => {
    const errField = [
      7,
      null,
      [["type.googleapis.com/google.rpc.ErrorInfo", ["PUBLIC_ERROR_UNUSUAL_ACTIVITY"]]],
    ];
    const row = ["wrb.fr", "MZZa6b", null, null, null, errField, "generic"];
    const text = wrapChunk([row]);

    const rows = parseBatchExecuteResponse(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][2], null);
    assert.ok(JSON.stringify(rows[0][5]).includes("PUBLIC_ERROR_UNUSUAL_ACTIVITY"));
  });

  it("parses two sequential chunks correctly", () => {
    const rowA = ["wrb.fr", "Zzl0ze", '"a"', null, null, null, "generic"];
    const rowB = ["wrb.fr", "as29s", '"b"', null, null, null, "generic"];
    const chunkA = JSON.stringify([rowA]);
    const chunkB = JSON.stringify([rowB]);
    const text = `)]}'\n\n${chunkA.length}\n${chunkA}\n${chunkB.length}\n${chunkB}`;

    const rows = parseBatchExecuteResponse(text);
    assert.equal(rows.length, 2);
    assert.equal(rows[0][1], "Zzl0ze");
    assert.equal(rows[1][1], "as29s");
  });

  it("handles UTF-8 byte lengths that differ from JavaScript string lengths", () => {
    const row = ["wrb.fr", "Zzl0ze", JSON.stringify(["African Élder"]), null, null, null, "generic"];
    const chunk = JSON.stringify([row]);
    const text = `)]}'\n\n${Buffer.byteLength(chunk, "utf8")}\n${chunk}`;
    const rows = parseBatchExecuteResponse(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][1], "Zzl0ze");
  });
});

// ─── parseProjectInventory ────────────────────────────────────────────────────

describe("parseProjectInventory", () => {
  it("returns empty arrays for null/non-array payload", () => {
    assert.deepEqual(parseProjectInventory(null), { media: [], characters: [], voices: [] });
    assert.deepEqual(parseProjectInventory({}), { media: [], characters: [], voices: [] });
    assert.deepEqual(parseProjectInventory([]), { media: [], characters: [], voices: [] });
  });

  it("parses media rows from payload[1]", () => {
    const mediaRow = [
      "media-001",
      null,
      null,
      ["My Video", [1700000000, 0], null, null, "wf-abc", "op-xyz", [1700001000, 0]],
      "proj-001",
      "entity-111",
    ];
    const payload = [null, [mediaRow]];
    const result = parseProjectInventory(payload);

    assert.equal(result.media.length, 1);
    const m = result.media[0];
    assert.equal(m.mediaId, "media-001");
    assert.equal(m.title, "My Video");
    assert.equal(m.createdSec, 1700000000);
    assert.equal(m.workflowId, "wf-abc");
    assert.equal(m.operationId, "op-xyz");
    assert.equal(m.projectId, "proj-001");
    assert.equal(m.entityId, "entity-111");
  });

  it("parses character entity rows from payload[5]", () => {
    const charRow = [
      "proj-001",
      "entity-111",
      null,
      [1, "Doctor", [[[["wf-abc"]]]], [[null, "Alnilam"]], "A gruff surgeon"],
      "thumb-media",
      [512, 512],
      [1700000000, 0],
      [1700001000, 0],
    ];
    const payload = [null, [], null, null, null, [charRow]];
    const result = parseProjectInventory(payload);

    assert.equal(result.characters.length, 1);
    const c = result.characters[0];
    assert.equal(c.entityId, "entity-111");
    assert.equal(c.displayName, "Doctor");
    assert.equal(c.presetVoiceId, "Alnilam");
    assert.equal(c.personalityNotes, "A gruff surgeon");
    assert.equal(c.thumbnailMediaId, "thumb-media");
  });

  it("parses both media and character rows together", () => {
    const mediaRow = ["m1", null, null, ["T", [0, 0], null, null, "wf1", "op1"], "p1", "e1"];
    const charRow = ["p1", "e1", null, [1, "Farm Woman", [], [[null, "Sulafat"]], null], null];
    const payload = [null, [mediaRow], null, null, null, [charRow]];
    const result = parseProjectInventory(payload);

    assert.equal(result.media.length, 1);
    assert.equal(result.media[0].workflowId, "wf1");
    assert.equal(result.characters.length, 1);
    assert.equal(result.characters[0].displayName, "Farm Woman");
    assert.equal(result.characters[0].presetVoiceId, "Sulafat");
  });

  it("parses stock and custom voice rows from the current payload[3]", () => {
    const payload = [
      null,
      [],
      [["not-a-voice", "project-id", "workflow-id"]],
      [
        ["charon", 3, "Charon", ["Male"]],
        ["voice-custom-1", 3, "African Elder", ["Male"]],
      ],
      null,
      [],
    ];
    const result = parseProjectInventory(payload);
    assert.deepEqual(result.voices, [
      { voiceId: "charon", kind: 3, displayName: "Charon" },
      { voiceId: "voice-custom-1", kind: 3, displayName: "African Elder" },
    ]);
  });

  it("accepts the older payload[2] voice location", () => {
    const payload = [
      null,
      [],
      [
        ["charon", 3, "Charon", ["Male"]],
        ["voice-custom-1", 3, "African Elder", ["Male"]],
      ],
      null,
      null,
      [],
    ];
    const result = parseProjectInventory(payload);
    assert.deepEqual(result.voices, [
      { voiceId: "charon", kind: 3, displayName: "Charon" },
      { voiceId: "voice-custom-1", kind: 3, displayName: "African Elder" },
    ]);
  });
});

// ─── parseWorkflowDetail ─────────────────────────────────────────────────────

describe("parseWorkflowDetail", () => {
  it("returns null for null / non-array payload", () => {
    assert.equal(parseWorkflowDetail(null), null);
    assert.equal(parseWorkflowDetail("string"), null);
  });

  it("parses video URL from primary location payload[6][0][8]", () => {
    const videoUrl = "https://storage.googleapis.com/video/abc123.mp4?Expires=99999";
    const payload = [
      "media-001",
      "proj-001",
      "wf-001",
      "CAE",
      null,
      null,
      [
        [null, null, null, null, null, null, null, null, videoUrl, null, null, null, "gemini-pro-video"],
        [null, null, [8.0]],
      ],
    ];

    const detail = parseWorkflowDetail(payload);
    assert.equal(detail.videoUrl, videoUrl);
    assert.equal(detail.model, "gemini-pro-video");
    assert.equal(detail.duration, 8.0);
    assert.equal(detail.mediaId, "media-001");
    assert.equal(detail.workflowId, "wf-001");
  });

  it("falls back to recursive URL search when primary slot is absent", () => {
    const videoUrl = "https://example.com/video/deep/file.mp4";
    const payload = [
      "media-001",
      "proj-001",
      "wf-001",
      "CAE",
      null,
      null,
      [[null, null, null, null, null, null, null, null, null]],
      null,
      null,
      [[[null, videoUrl]]],
    ];

    const detail = parseWorkflowDetail(payload);
    assert.equal(detail.videoUrl, videoUrl);
  });

  it("returns null videoUrl when still processing (no URL yet)", () => {
    const payload = ["m", "p", "wf", "CAE", null, null, [[null, null, null]]];
    const detail = parseWorkflowDetail(payload);
    assert.equal(detail.videoUrl, null);
  });

  it("returns { error: 'BLOCKED' } when unusual activity text is present", () => {
    const payload = [
      "m",
      "p",
      "wf",
      "CAE",
      null,
      null,
      [[null, null, null, null, null, null, null, null, null, null, null, null, null,
        "unusual activity"]],
    ];
    const detail = parseWorkflowDetail(payload);
    assert.deepEqual(detail, { error: "BLOCKED" });
  });
});

// ─── resolveCharacter ─────────────────────────────────────────────────────────

describe("resolveCharacter", () => {
  const chars = [
    { entityId: "ent-001", displayName: "Doctor" },
    { entityId: "ent-002", displayName: "Farm Woman" },
    { entityId: "ent-003", displayName: "Latino Dad" },
  ];

  it("resolves by exact entityId (case-sensitive)", () => {
    assert.equal(resolveCharacter(chars, "ent-002")?.displayName, "Farm Woman");
    assert.equal(resolveCharacter(chars, "ENT-002"), null);
  });

  it("resolves by exact case-insensitive displayName", () => {
    assert.equal(resolveCharacter(chars, "doctor")?.entityId, "ent-001");
    assert.equal(resolveCharacter(chars, "FARM WOMAN")?.entityId, "ent-002");
    assert.equal(resolveCharacter(chars, "Latino Dad")?.entityId, "ent-003");
  });

  it("returns null for a non-matching query", () => {
    assert.equal(resolveCharacter(chars, "nonexistent"), null);
    assert.equal(resolveCharacter(chars, "Doc"), null);  // partial — no partial match
  });

  it("sole-character fallback only when allowSole=true", () => {
    const single = [{ entityId: "ent-001", displayName: "Doctor" }];
    // default: no sole fallback
    assert.equal(resolveCharacter(single, "anything"), null);
    assert.equal(resolveCharacter(single, null), null);
    // explicit allowSole
    assert.equal(resolveCharacter(single, "anything", { allowSole: true })?.entityId, "ent-001");
    assert.equal(resolveCharacter(single, null, { allowSole: true })?.entityId, "ent-001");
  });

  it("never sole-falls-back when more than one character", () => {
    assert.equal(resolveCharacter(chars, "nope", { allowSole: true }), null);
  });

  it("returns null for empty character list", () => {
    assert.equal(resolveCharacter([], "Doctor"), null);
    assert.equal(resolveCharacter(null, "Doctor"), null);
  });
});

describe("resolveVoice", () => {
  const voices = [
    { voiceId: "charon", displayName: "Charon" },
    { voiceId: "custom-voice-id", displayName: "African Elder" },
  ];

  it("uses exact ID or display name in priority order", () => {
    assert.equal(resolveVoice(voices, "CHARON")?.voiceId, "charon");
    assert.equal(resolveVoice(voices, ["missing", "African Elder", "Charon"])?.voiceId, "custom-voice-id");
  });

  it("does not use partial or sole-item fallbacks", () => {
    assert.equal(resolveVoice(voices, "Africa"), null);
    assert.equal(resolveVoice([voices[0]], "missing"), null);
  });
});

// ─── directPromptForCharacter ─────────────────────────────────────────────────

describe("directPromptForCharacter", () => {
  it("replaces single-word custom voice name", () => {
    const prompt = `Use the attached Flow character "Doctor" with the custom voice named Doctor. Same face, same wardrobe.`;
    const result = directPromptForCharacter(prompt, { entityId: "ent-001" });
    assert.ok(result.includes("with its saved character voice"), "should contain replacement");
    assert.ok(!result.includes("custom voice named"), "should not retain original wording");
    assert.ok(result.includes("Same face, same wardrobe"), "trailing text should be intact");
  });

  it("replaces multi-word custom voice name", () => {
    const prompt = `Use the attached Flow character "Farm Woman" with the custom voice named Farm Woman. Do not recast.`;
    const result = directPromptForCharacter(prompt, { entityId: "ent-002" });
    assert.ok(result.includes("with its saved character voice"));
    assert.ok(!result.includes("custom voice named"));
    assert.ok(result.includes("Do not recast"));
  });

  it("handles period delimiter after voice name", () => {
    const prompt = `Character "X" with the custom voice named Alpha. Continue.`;
    const result = directPromptForCharacter(prompt, { entityId: "e" });
    assert.ok(result.startsWith(`Character "X" with its saved character voice.`));
  });

  it("leaves prompts without the pattern intact", () => {
    const prompt = "DIALOGUE — speak this. A great monologue.";
    assert.equal(directPromptForCharacter(prompt, { entityId: "e" }), prompt);
  });

  it("returns prompt string unchanged when character is null/undefined", () => {
    const prompt = "Some prompt with the custom voice named Foo.";
    assert.equal(directPromptForCharacter(prompt, null), prompt);
    assert.equal(directPromptForCharacter(prompt, undefined), prompt);
  });

  it("replaces multiple occurrences in the same prompt", () => {
    const prompt = `A with the custom voice named X. B with the custom voice named Y.`;
    const result = directPromptForCharacter(prompt, { entityId: "e" });
    assert.ok(!result.includes("custom voice named"));
    const matches = result.match(/with its saved character voice/g) || [];
    assert.equal(matches.length, 2);
  });
});

// ─── FLOW_BLOCKED message ─────────────────────────────────────────────────────

describe("FLOW_BLOCKED", () => {
  it("contains the exact product message required by spec", () => {
    assert.ok(typeof FLOW_BLOCKED === "string");
    assert.ok(FLOW_BLOCKED.includes("unusual activity"));
    assert.ok(FLOW_BLOCKED.includes("retrying makes the block last longer"));
    assert.ok(FLOW_BLOCKED.startsWith("Flow paused this Google account"));
  });
});
