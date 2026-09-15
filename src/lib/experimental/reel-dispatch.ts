import { createHash } from "node:crypto";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function flowDispatchInputHash(input: Record<string, unknown>): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

export function flowIdempotencyKey(reelJobId: number, inputHash: string): string {
  return `reel:${reelJobId}:${inputHash}`;
}
