"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatUsd, type CostReport, type GroupRow, reportForWindow } from "@/lib/cost-report";
import { cn } from "@/lib/utils";

type Window = "all" | "30" | "7";

function shortName(name: string) {
  const parts = name.split(" - ");
  return parts.length > 1 ? parts.slice(1).join(" - ") : name;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums tracking-tight">{value}</CardTitle>
        {hint ? <CardDescription>{hint}</CardDescription> : null}
      </CardHeader>
    </Card>
  );
}

function ShareBar({ share }: { share: number }) {
  return (
    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
      <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }} />
    </div>
  );
}

function GroupTable({ rows, kind }: { rows: GroupRow[]; kind: "model" | "provider" }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{kind === "model" ? "Model" : "Provider"}</TableHead>
          <TableHead className="text-right">Spend</TableHead>
          <TableHead className="text-right">Share</TableHead>
          <TableHead className="text-right">Batches</TableHead>
          <TableHead className="text-right">Posts</TableHead>
          <TableHead className="text-right">$/post</TableHead>
          <TableHead className="text-right">$/batch</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="font-medium capitalize">{r.label}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUsd(r.spend)}</TableCell>
            <TableCell className="w-32">
              <div className="flex items-center gap-2">
                <ShareBar share={r.share} />
                <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">{Math.round(r.share * 100)}%</span>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.batches}</TableCell>
            <TableCell className="text-right tabular-nums">{r.posts}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUsd(r.costPerPost)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUsd(r.costPerBatch)}</TableCell>
            <TableCell className="text-right tabular-nums">{r.totalTokens.toLocaleString()}</TableCell>
          </TableRow>
        ))}
        {!rows.length && (
          <TableRow>
            <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
              No spend in this window.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function CostsView({ report: all }: { report: CostReport }) {
  const [window, setWindow] = useState<Window>("all");
  const report = useMemo(() => reportForWindow(all, window === "all" ? null : Number(window)), [all, window]);
  const maxDay = Math.max(0, ...report.byDay.map((d) => d.spend));

  const windows: { id: Window; label: string }[] = [
    { id: "all", label: "All time" },
    { id: "30", label: "30 days" },
    { id: "7", label: "7 days" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Costs</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Estimated from tokens stored on each batch, using published list rates.
          </p>
        </div>
        <div className="flex gap-2">
          {windows.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWindow(w.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                window === w.id
                  ? "border-orange-500 bg-orange-500/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-orange-500/60",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="border-orange-500/30">
        <CardHeader className="gap-1">
          <CardDescription>Total spend · all time</CardDescription>
          <CardTitle className="text-4xl tabular-nums tracking-tight">{formatUsd(all.totals.spend)}</CardTitle>
          <CardDescription>
            {all.totals.batches} batches · {all.totals.posts} posts · {all.totals.totalTokens.toLocaleString()} tokens
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={window === "all" ? "Spend" : "Spend in window"} value={formatUsd(report.totals.spend)} hint={`${report.totals.batches} batches`} />
        <Kpi label="Per batch" value={formatUsd(report.totals.costPerBatch)} hint={`${report.totals.posts} posts kept`} />
        <Kpi label="Per post" value={formatUsd(report.totals.costPerPost)} hint={`${formatUsd(report.totals.costPerRequested)} per requested`} />
        <Kpi
          label="Tokens"
          value={report.totals.totalTokens.toLocaleString()}
          hint={`${report.totals.inputTokens.toLocaleString()} in · ${report.totals.outputTokens.toLocaleString()} out`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily spend</CardTitle>
          <CardDescription>Each bar is one UTC day.</CardDescription>
        </CardHeader>
        <CardContent>
          {report.byDay.length ? (
            <div className="flex h-40 items-end gap-1">
              {report.byDay.map((d) => (
                <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-orange-500/80"
                    style={{ height: `${maxDay ? Math.max(4, (d.spend / maxDay) * 120) : 4}px` }}
                    title={`${d.day} · ${formatUsd(d.spend)} · ${d.batches} batches`}
                  />
                  <span className="text-muted-foreground hidden text-[10px] sm:block">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">No batches in this window.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden py-0">
          <CardHeader className="pt-6">
            <CardTitle>By model</CardTitle>
            <CardDescription>Spend split across the models you actually ran.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <GroupTable rows={report.byModel} kind="model" />
          </CardContent>
        </Card>
        <Card className="overflow-hidden py-0">
          <CardHeader className="pt-6">
            <CardTitle>By provider</CardTitle>
            <CardDescription>DeepSeek vs Grok vs Venice.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <GroupTable rows={report.byProvider} kind="provider" />
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden py-0">
        <CardHeader className="pt-6">
          <CardTitle>By persona</CardTitle>
          <CardDescription>Batch spend allocated by how many posts each persona kept.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Posts</TableHead>
                <TableHead className="text-right">$/post</TableHead>
                <TableHead className="text-right">Batches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.byPersona.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{shortName(p.name)}</div>
                    <div className="text-muted-foreground font-mono text-xs">{p.handle}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(p.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.posts}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(p.costPerPost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.batches}</TableCell>
                </TableRow>
              ))}
              {!report.byPersona.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    No persona spend yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="overflow-hidden py-0">
        <CardHeader className="pt-6">
          <CardTitle>Per batch</CardTitle>
          <CardDescription>Cost of each generate run, including scoring tokens on newer batches.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Posts</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">$/post</TableHead>
                <TableHead className="text-right">$/requested</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">#{b.id}</TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {b.createdAt.slice(0, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell>
                    <div className="capitalize">{b.provider}</div>
                    <div className="text-muted-foreground font-mono text-xs">{b.model}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        b.status === "done"
                          ? "border-emerald-500/40 text-emerald-500"
                          : b.status === "error"
                            ? "border-red-500/40 text-red-500"
                            : b.status === "ready"
                              ? "border-sky-500/40 text-sky-500"
                              : "text-muted-foreground"
                      }
                    >
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.posts}
                    <span className="text-muted-foreground">/{b.requested}</span>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {b.inputTokens.toLocaleString()} / {b.outputTokens.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatUsd(b.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(b.costPerPost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(b.costPerRequested)}</TableCell>
                </TableRow>
              ))}
              {report.batches.length ? (
                <TableRow className="bg-muted/30 font-medium">
                  <TableCell colSpan={6}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(report.totals.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(report.totals.costPerPost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(report.totals.costPerRequested)}</TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground py-8 text-center">
                    No batches yet — generate a run to see costs.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rates used</CardTitle>
          <CardDescription>
            USD per 1M tokens. Refine and knowledge distill are not stored yet, so they are not in these totals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.rates.length ? (
            <div className="flex flex-wrap gap-3">
              {report.rates.map((r) => (
                <div key={`${r.provider}-${r.model}`} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {r.model} · ${r.inputPerM} in / ${r.outputPerM} out
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Rates appear after the first batch.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
