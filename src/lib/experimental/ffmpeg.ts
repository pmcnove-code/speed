import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", (e) => reject(new Error(`${cmd} missing or failed to start: ${e.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(out || err);
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-900) || out.slice(-400)}`));
    });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function probeDurationMs(file: string): Promise<number | null> {
  try {
    const out = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const sec = Number(out.trim());
    return Number.isFinite(sec) ? Math.round(sec * 1000) : null;
  } catch {
    return null;
  }
}

export async function probeMp4Duration(bytes: Buffer): Promise<number | null> {
  if (!bytes?.length) return null;
  const dir = await mkdtemp(join(tmpdir(), "reel-probe-"));
  const file = join(dir, "probe.mp4");
  try {
    await writeFile(file, bytes);
    return await probeDurationMs(file);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

