import { describe, it, expect } from "vitest";
import { estimateUsd, formatUsd, rateFor } from "./cost";
import { buildCostReport } from "./cost-report";

describe("cost rates", () => {
  it("prices grok-4.6 at $2 / $6 per million", () => {
    expect(rateFor("grok", "grok-4.6")).toMatchObject({ inputPerM: 2, outputPerM: 6 });
    expect(estimateUsd("grok", "grok-4.6", { input_tokens: 1_000_000, output_tokens: 1_000_000, total_tokens: 2_000_000 })).toBe(8);
  });

  it("falls back to the provider rate for an unknown model", () => {
    expect(rateFor("deepseek", "mystery-v9").inputPerM).toBe(0.22);
  });

  it("prices a total-only usage record instead of treating it as zero", () => {
    const spend = estimateUsd("grok", "grok-4.6", { input_tokens: 0, output_tokens: 0, total_tokens: 1_000_000 });
    expect(spend).toBeGreaterThan(2);
    expect(spend).toBeLessThan(7);
  });

  it("formats tiny spends with extra decimals", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(1.2)).toBe("$1.20");
  });
});

describe("cost report", () => {
  it("splits batch spend across personas by kept posts", () => {
    const report = buildCostReport(
      [
        {
          id: 1,
          provider: "grok",
          model: "grok-4.6",
          status: "done",
          createdAt: new Date("2026-09-01T12:00:00Z"),
          createdBy: "Owner",
          personaIds: [1, 2],
          countRequested: 2,
          usage: { input_tokens: 500_000, output_tokens: 500_000, total_tokens: 1_000_000 },
        },
      ],
      [
        { batchId: 1, personaId: 1, n: 3 },
        { batchId: 1, personaId: 2, n: 1 },
      ],
      [
        { id: 1, name: "Avatar 1 - Elder", handle: "elder" },
        { id: 2, name: "Avatar 2 - Heart", handle: "heart" },
      ],
    );
    expect(report.totals.spend).toBe(4);
    expect(report.totals.posts).toBe(4);
    expect(report.totals.costPerPost).toBe(1);
    expect(report.byPersona[0]?.handle).toBe("elder");
    expect(report.byPersona[0]?.spend).toBe(3);
    expect(report.byPersona[1]?.spend).toBe(1);
    expect(report.batches[0]?.costPerRequested).toBe(1);
  });
});
