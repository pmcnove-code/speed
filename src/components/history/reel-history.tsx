"use client";

import { useMemo, useState } from "react";
import { Download, Film, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PublicReelJob } from "@/lib/experimental/reel-public";
import { cn } from "@/lib/utils";

const STATUS: Record<string, string> = {
  done: "text-emerald-500 border-emerald-500/40",
  running: "text-orange-500 border-orange-500/40",
  error: "text-red-500 border-red-500/40",
  queued: "text-muted-foreground",
};

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function seconds(ms: number | null | undefined): string {
  if (!ms) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ReelHistory({ reels }: { reels: PublicReelJob[] }) {
  const playable = useMemo(() => reels.filter((row) => row.hasVideo), [reels]);
  const [selectedId, setSelectedId] = useState<number | null>(playable[0]?.id ?? reels[0]?.id ?? null);
  const selected = reels.find((row) => row.id === selectedId) ?? null;
  const videoUrl = selected?.hasVideo ? `/api/experimental/reels/${selected.id}/video` : null;

  if (!reels.length) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-12 text-center text-sm">
          No reels yet — generate one on Experimental.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {selected && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start">
            <div className="bg-black aspect-[9/16] w-full max-w-[280px] shrink-0 overflow-hidden rounded-xl border shadow-sm">
              {videoUrl ? (
                <video
                  key={videoUrl}
                  src={videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="size-full bg-black object-contain"
                />
              ) : (
                <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-sm">
                  <Film className="size-8 opacity-70" />
                  <span>{selected.error || "This job has no playable MP4."}</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">#{selected.id}</span>
                <Badge variant="outline" className={STATUS[selected.status] ?? ""}>
                  {selected.status}
                </Badge>
                {selected.path && <Badge variant="secondary">{selected.path}</Badge>}
              </div>
              <p className="text-sm font-medium">{selected.hook || "Untitled reel"}</p>
              <p className="text-muted-foreground text-xs">
                {seconds(selected.durationMs)}
                {selected.model ? ` · ${selected.model}` : ""}
                {selected.personaName ? ` · ${selected.personaName}` : ""}
                {selected.createdBy ? ` · ${selected.createdBy}` : ""}
                {` · ${when(selected.createdAt)}`}
              </p>
              {selected.script && (
                <ScrollArea className="h-40 rounded-lg border">
                  <p className="whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed">{selected.script}</p>
                </ScrollArea>
              )}
              {videoUrl && (
                <Button asChild className="gap-2">
                  <a href={`${videoUrl}?download=1`}>
                    <Download className="size-4" /> Download MP4
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Reel</TableHead>
              <TableHead>Hook</TableHead>
              <TableHead>Length</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reels.map((row) => {
              const active = row.id === selected?.id;
              return (
                <TableRow
                  key={row.id}
                  className={cn("cursor-pointer", active && "bg-accent")}
                  onClick={() => setSelectedId(row.id)}
                >
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {row.hasVideo ? <Play className="size-3.5 opacity-70" /> : <Film className="size-3.5 opacity-40" />}
                      #{row.id}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm">{row.hook || "—"}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums text-sm">{seconds(row.durationMs)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS[row.status] ?? ""}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-sm">{when(row.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{row.createdBy || "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
