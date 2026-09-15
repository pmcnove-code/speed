import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { probeMp4Duration } from "./ffmpeg";

const exec = promisify(execFile);

describe("probeMp4Duration", () => {
  it("reads the real duration before deleting the temp file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "probe-await-"));
    const file = join(dir, "three-frames.mp4");
    try {
      await exec("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=320x240:d=0.125",
        "-frames:v",
        "3",
        file,
      ]);
      const ms = await probeMp4Duration(await readFile(file));
      expect(ms).toBeGreaterThan(50);
      expect(ms).toBeLessThan(2000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
