"use client";

import { Fragment, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { ResultsGrid, type ResultPost } from "@/components/generate/results-grid";
import { formatUsd } from "@/lib/cost";

type Row = {
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

const STATUS: Record<string, string> = {
  done: "text-emerald-500 border-emerald-500/40",
  ready: "text-sky-500 border-sky-500/40",
  running: "text-orange-500 border-orange-500/40",
  error: "text-red-500 border-red-500/40",
  queued: "text-muted-foreground",
};

export function HistoryTable({ batches, totalSpend = 0 }: { batches: Row[]; totalSpend?: number }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [posts, setPosts] = useState<ResultPost[]>([]);
  const [loading, setLoading] = useState(false);

  async function toggle(id: number) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setLoading(true);
    const data = await fetch(`/api/batches/${id}`).then((r) => r.json());
    setPosts(data.posts ?? []);
    setLoading(false);
  }

  return (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Batch</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">In / out</TableHead>
            <TableHead className="text-right">Spend</TableHead>
            <TableHead>By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((b) => (
            <Fragment key={b.id}>
              <TableRow className="cursor-pointer" onClick={() => toggle(b.id)}>
                <TableCell>
                  <ChevronRight className={`size-4 transition ${openId === b.id ? "rotate-90" : ""}`} />
                </TableCell>
                <TableCell className="font-medium">#{b.id}</TableCell>
                <TableCell className="capitalize">{b.provider}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {b.countRequested}/persona × {b.personaCount}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS[b.status] ?? ""}>
                    {b.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  <div>{(b.inputTokens || Math.max(0, b.totalTokens - b.outputTokens)).toLocaleString()} in</div>
                  <div className="text-muted-foreground">{b.outputTokens.toLocaleString()} out</div>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatUsd(b.spend)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{b.createdBy}</TableCell>
              </TableRow>
              {openId === b.id && (
                <TableRow>
                  <TableCell colSpan={8} className="bg-muted/20 p-4">
                    {loading ? (
                      <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Loader2 className="size-4 animate-spin" /> Loading posts…
                      </div>
                    ) : posts.length ? (
                      <ResultsGrid
                        posts={posts}
                        onUpdated={(next) => setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
                      />
                    ) : (
                      <p className="text-muted-foreground text-sm">No posts in this batch.</p>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
          {batches.length ? (
            <TableRow className="bg-muted/30 font-medium">
              <TableCell colSpan={6}>Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatUsd(totalSpend)}</TableCell>
              <TableCell />
            </TableRow>
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground py-10 text-center">
                No batches yet — generate your first on the Generate tab.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
