import test from "node:test";
import assert from "node:assert/strict";
import { buildAssHeader, buildCaptionAss, styledEventText } from "./ffmpeg.mjs";
import { subtitleStylePresets, defaultSubtitleStyle } from "../../shared/flow/subtitle-style.mjs";

test("default header keeps today's look: size 54, bottom-center, classic margins", () => {
  const header = buildAssHeader();
  assert.match(header, /Style: Body,Liberation Sans,54,&H00F5F5F5,/);
  // BorderStyle 1, Outline 1.5, Shadow 1, Alignment 2, MarginL/R 100
  assert.match(header, /,1,1\.5,1,2,100,100,\d+,1/);
});

test("legacy subtitleSize and subtitlePosition map onto the default style", () => {
  const header = buildAssHeader(undefined, { subtitleSize: 64, subtitlePosition: "top" });
  assert.match(header, /Style: Body,Liberation Sans,64,/);
  assert.match(header, /,1,1\.5,1,8,100,100,\d+,1/); // alignment 8 = top-center
});

test("hex colors render as &HAABBGGRR with hex alpha", () => {
  const header = buildAssHeader({ fill: { color: "#ffd23f" }, background: { enabled: true, color: "#102030", opacity: 0.5 } });
  assert.match(header, /&H003FD2FF/); // fill: BGR of ffd23f, opaque
  assert.match(header, /&H80302010/); // back: alpha 0x80 from opacity .5
});

test("top-left vs bottom-center alignment and vertical margin", () => {
  const topLeft = buildAssHeader({ position: { vertical: 10, align: "left" } });
  assert.match(topLeft, /,7,100,100,192,1/); // alignment 7, marginV 10% of 1920
  const bottomCenter = buildAssHeader({ position: { vertical: 84, align: "center" } });
  assert.match(bottomCenter, /,2,100,100,307,1/);
});

test("dynamic preset: uppercase text, 64px, bold, pop animation", () => {
  const ass = buildCaptionAss([{ text: "your salad is stealing", durationMs: 4000 }], subtitleStylePresets().dynamic);
  assert.match(ass, /Style: Body,Liberation Sans,64,/);
  assert.match(ass, /,-1,0,0,0,100,100,1,0,1,3,/); // Bold -1, Spacing 1, Outline 3
  assert.match(ass, /\\fscx80\\fscy80\\t\(0,120,\\fscx100\\fscy100\)/);
  assert.match(ass, /YOUR SALAD/); // wordsPerLine 3 pages the 4-word phrase
});

test("karaoke splits words into \\k tags sized by duration", () => {
  const text = styledEventText("meat heals people", { ...defaultSubtitleStyle(), behavior: { ...defaultSubtitleStyle().behavior, animation: "karaoke" } }, 3000);
  assert.equal(text, "{\\k100}meat {\\k100}heals {\\k100}people");
});

test("wordsPerLine 3 splits an eight-word cue into three pages", () => {
  const style = { ...defaultSubtitleStyle(), behavior: { ...defaultSubtitleStyle().behavior, wordsPerLine: 3, animation: "none" } };
  const ass = buildCaptionAss([{ text: "one two three four five six seven eight", durationMs: 8000 }], style);
  const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
  assert.equal(events.length, 3);
  assert.match(events[0], /one two three$/);
});

test("no style falls back to legacy fade toggling", () => {
  assert.equal(styledEventText("hello there", undefined, 1000, true), "{\\fad(60,90)}hello there");
  assert.equal(styledEventText("hello there", undefined, 1000, false), "hello there");
});
