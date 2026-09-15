import assert from "node:assert/strict";
import { it } from "node:test";
import { captionPhrases, subtitleText } from "./captions.mjs";

it("keeps step outside together and follows actual speech, including pauses", () => {
  const text = "I cook breakfast, step outside, and take a moment to enjoy the day.";
  const words = text.split(" ").map((word, i) => ({ word, start: 2 + i * 0.4, end: 2.3 + i * 0.4 }));
  const phrases = captionPhrases(text, words, 10000);
  assert.ok(phrases.some(p => p.text === "step outside,"));
  assert.equal(subtitleText("Don’t rush, it's fine. [Really!] — café & tea?"), "Don't rush it's fine Really café tea");
  assert.equal(phrases[0].startMs, 1960);
  assert.equal(phrases.map(p => p.text).join(" "), text);
  assert.ok(phrases.every((p, i) => p.endMs > p.startMs && (!i || p.startMs >= phrases[i - 1].endMs)));
});

it("does not use timestamps belonging to different words", () => {
  const phrases = captionPhrases("A fresh start.", [{ word: "wrong", start: 99, end: 100 }], 4000);
  assert.equal(phrases[0].startMs, 0);
  assert.ok(phrases[0].endMs <= 4000);
});
