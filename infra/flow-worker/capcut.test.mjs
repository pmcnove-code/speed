import assert from "node:assert/strict";
import { test } from "node:test";
import { editingSpec } from "./capcut.mjs";

test("CapCut timeline preserves speech duration and renders punctuation-free phrase captions", () => {
  const spec = editingSpec(["/tmp/a.mp4", "/tmp/b.mp4"], [8000, 10000], [
    { text: "Step outside, it's time.", transition: "cut" },
    { text: "Come with me!", transition: "fade" },
  ]);
  assert.deepEqual(spec.tracks[0].items.map(c => [c.start,c.duration]), [[0,8],[8,10]]);
  assert.equal(spec.operations[0].target, "clip0");
  assert.equal(spec.operations[0].slug, "black-fade");
  assert.equal(spec.tracks[1].items.map(c => c.text).join(" "), "Step outside it's time Come with me");
  assert.ok(spec.tracks[1].items.every(c => c.start >= 0 && c.start+c.duration <= 18));
});

test("CapCut rejects unknown transitions and missing durations before executing", () => {
  assert.throws(() => editingSpec(["/tmp/a"], [null], []), /duration/);
  assert.throws(() => editingSpec(["/tmp/a"], [8000], [{ transition: "shell command" }]), /transition/);
});

test("subtitles off omits the empty text track required by the real CLI compiler", () => {
  const spec=editingSpec(["/tmp/a.mp4"],[8000],[{text:"Every word stays spoken"}],{subtitles:false});
  assert.equal(spec.tracks.length,1);
  assert.equal(spec.tracks[0].type,"video");
});
