import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { buildCaptionAss, buildCaptionSrt, concatClips, isPlayableTake, srtTimestamp, transitionFilter } from "./ffmpeg.mjs";

const exec = promisify(execFile);

describe("concatClips", () => {
  it("centers dissolves on actual clip boundaries without overlapping speech", () => {
    const filter = transitionFilter([8000, 10000, 6000], [true, false, true]);
    assert.match(filter, /offset=7\.916666666666667/);
    assert.match(filter, /offset=17\.916666666666668/);
    assert.match(filter, /anullsrc=r=48000:cl=stereo/);
    assert.match(filter, /concat=n=3:v=0:a=1\[audio\]/);
    assert.doesNotMatch(filter, /acrossfade/);
  });
  it("accepts a short scripted reel and preserves both clips", async () => {
    const dir = await mkdtemp(join(tmpdir(), "short-reel-"));
    try {
      const clip = join(dir, "clip.mp4");
      const reel = join(dir, "reel.mp4");
      await exec("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=blue:s=144x256:d=3.5",
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", clip]);
      for (const transition of ["dissolve", "cut", "fade"]) {
        await concatClips([clip, clip], reel, [{ text: "First", transition }, { text: "Second", transition }], {subtitles: transition !== "cut", subtitleSize:42, subtitlePosition:"top", subtitleFade:false});
        const check = await isPlayableTake(reel, { minMs: 6900 });
        assert.equal(check.ok, true, transition);
        assert.ok(check.ms < 7200, `${transition}: ${check.ms}`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("buildCaptionSrt", () => {
  it("times punchy screen lines across clips", () => {
    assert.equal(srtTimestamp(3661001), "01:01:01,001");
    const srt = buildCaptionSrt([
      { text: "GUT ISN'T LAZY", durationMs: 8000 },
      { text: "FIX THE PLATE", durationMs: 8000 },
      { text: "Follow for the protocol.", durationMs: 8000 },
    ]);
    assert.match(srt, /00:00:00,000 --> 00:00:08,000/);
    assert.match(srt, /GUT ISN'T LAZY/);
    assert.match(srt, /00:00:08,000 --> 00:00:16,000/);
    assert.match(srt, /FIX THE PLATE/);
    assert.match(srt, /Follow for the protocol/);
  });
});

describe("buildCaptionAss", () => {
  it("keeps every word of long copy in bounded timed pages", () => {
    const words = Array.from({ length: 25 }, (_, i) => `word${i}`);
    const ass = buildCaptionAss([{ text: words.join(" "), durationMs: 10000 }]);
    const events = ass.split("\n").filter(line => line.startsWith("Dialogue:"));
    assert.equal(events.length, 5);
    assert.match(ass, /WrapStyle: 0/);
    for (const event of events) {
      assert.ok((event.match(/word\d+/g) || []).length <= 6);
      assert.match(event, /\\fad\(60,90\)/);
    }
    assert.deepEqual(events.join(" ").match(/word\d+/g), words);
    assert.match(events.at(-1), /,0:00:09\.96,/);
  });
  it("uses hook / body / CTA styles with fade", () => {
    const ass = buildCaptionAss([
      { text: "GUT ISN'T LAZY", role: "hook", durationMs: 8000 },
      { text: "FIX THE PLATE", role: "body", durationMs: 8000 },
      { text: "Follow for the protocol.", role: "cta", durationMs: 8000 },
    ]);
    assert.match(ass, /Style: Hook,/);
    assert.match(ass, /Style: Cta,/);
    assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:07\.96,Hook,/);
    assert.match(ass, /GUT ISN'T LAZY/);
    assert.match(ass, /,Cta,,0,0,0,,\{\\fad/);
    assert.match(ass, /Follow for the protocol/);
  });
});

describe("isPlayableTake", () => {
  it("rejects junk that is not a video", async () => {
    const dir = await mkdtemp(join(tmpdir(), "take-"));
    const file = join(dir, "stub.mp4");
    try {
      await writeFile(file, Buffer.alloc(63873));
      const check = await isPlayableTake(file);
      assert.equal(check.ok, false);
      assert.match(check.reason, /unreadable|too short/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects a 3-frame preview even when the file is small", async () => {
    const dir = await mkdtemp(join(tmpdir(), "take-"));
    const file = join(dir, "preview.mp4");
    try {
      await exec("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=144x256:d=0.125",
        "-frames:v",
        "3",
        file,
      ]);
      const check = await isPlayableTake(file);
      assert.equal(check.ok, false);
      assert.match(check.reason, /too short/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("accepts a finished take even when the file is under 250KB", async () => {
    const dir = await mkdtemp(join(tmpdir(), "take-"));
    const file = join(dir, "small.mp4");
    try {
      await exec("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=144x256:d=6",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        "40k",
        "-an",
        file,
      ]);
      const check = await isPlayableTake(file);
      assert.equal(check.ok, true);
      assert.ok(check.ms >= 3000);
      assert.ok(check.bytes < 250_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
