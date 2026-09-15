import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configureBrain, parseBrainReply, sanitizeGeminiKey, scaleClick, seeAndAct, visionAvailable, visionOfflineReason } from "./brain.mjs";

describe("parseBrainReply", () => {
  it("reads fenced json", () => {
    const step = parseBrainReply('```json\n{"action":"click_text","text":"Characters","x":80,"y":200}\n```');
    assert.equal(step.action, "click_text");
    assert.equal(step.text, "Characters");
    assert.equal(step.x, 80);
  });

  it("reads raw json with extra prose", () => {
    const step = parseBrainReply('Sure.\n{"done":true,"thought":"already attached","action":""}\n');
    assert.equal(step.done, true);
    assert.match(step.thought, /already attached/i);
  });

  it("returns null on garbage", () => {
    assert.equal(parseBrainReply("no json here"), null);
  });

  it("reads drag targets", () => {
    const step = parseBrainReply('{"action":"drag","x":100,"y":200,"x2":400,"y2":600,"thought":"drop on timeline"}');
    assert.equal(step.action, "drag");
    assert.equal(step.x2, 400);
    assert.equal(step.y2, 600);
  });
});

describe("sanitizeGeminiKey", () => {
  it("strips bearer and quotes", () => {
    assert.equal(sanitizeGeminiKey(' Bearer "AIzaTest" '), "AIzaTest");
  });
});

describe("configureBrain", () => {
  it("rejects Vertex express keys for vision", () => {
    const prev = process.env.GEMINI_API_KEY;
    configureBrain({ key: "AQ.not-an-ai-studio-key" });
    assert.equal(visionAvailable(), false);
    assert.match(visionOfflineReason(), /Vertex express/i);
    delete process.env.GEMINI_API_KEY;
    if (prev) process.env.GEMINI_API_KEY = prev;
    configureBrain({ key: prev || "" });
  });
});

describe("seeAndAct", () => {
  it("never calls Gemini and respects isDone", async () => {
    const ok = await seeAndAct({}, { isDone: async () => true });
    assert.equal(ok, true);
    const no = await seeAndAct({}, { isDone: async () => false });
    assert.equal(no, false);
  });
});

describe("scaleClick", () => {
  const vp = { width: 1440, height: 960 };

  it("keeps viewport pixels", () => {
    assert.deepEqual(scaleClick(200, 400, vp), { x: 200, y: 400 });
  });

  it("scales 0-1 fractions", () => {
    assert.deepEqual(scaleClick(0.5, 0.25, vp), { x: 720, y: 240 });
  });

  it("clamps to the viewport", () => {
    const pt = scaleClick(9000, -3, vp);
    assert.ok(pt.x <= 1436);
    assert.ok(pt.y >= 4);
  });
});
