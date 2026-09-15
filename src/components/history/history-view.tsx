"use client";

import { useState } from "react";
import { HistoryTable } from "@/components/history/history-table";
import { ReelHistory } from "@/components/history/reel-history";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/cost";
import type { PublicReelJob } from "@/lib/experimental/reel-public";

type BatchRow = {
  id: number;
  provider: string;
  model: string;
  countRequested: number;
  personaCount: number;
  status: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  spend: number;
  createdBy: string;
  createdAt: string;
};

export function HistoryView({
  batches,
  reels,
  batchCount,
  reelCount,
  playableCount,
  totalSpend,
  copySpend,
}: {
  batches: BatchRow[];
  reels: PublicReelJob[];
  batchCount: number;
  reelCount: number;
  playableCount: number;
  totalSpend: number;
  copySpend: number;
}) {
  const [tab, setTab] = useState<"reels" | "copy">(playableCount || reelCount ? "reels" : "copy");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {tab === "reels"
              ? `${playableCount} playable of ${reelCount} reel jobs`
              : `Last ${batches.length} of ${batchCount} generation batches`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex rounded-lg border p-0.5">
            <Button size="sm" variant={tab === "reels" ? "default" : "ghost"} onClick={() => setTab("reels")}>
              Reels
            </Button>
            <Button size="sm" variant={tab === "copy" ? "default" : "ghost"} onClick={() => setTab("copy")}>
              Copy
            </Button>
          </div>
          {tab === "copy" && (
            <div className="text-right">
              <div className="text-muted-foreground text-xs uppercase tracking-wide">Total spend</div>
              <div className="text-2xl font-semibold tabular-nums">{formatUsd(totalSpend)}</div>
            </div>
          )}
        </div>
      </div>
      {tab === "reels" ? (
        <ReelHistory reels={reels} />
      ) : (
        <HistoryTable batches={batches} totalSpend={copySpend} />
      )}
    </div>
  );
}
