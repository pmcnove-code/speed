"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Film, Loader2, Send, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PersonaAvatar } from "@/components/personas/persona-avatar";
import { cn } from "@/lib/utils";
import { SendToAirtableButton } from "./send-to-airtable-button";

export type ResultPost = {
  id: number;
  hook: string;
  script: string;
  onScreenText: string[];
  cta: string;
  videoBrief: string;
  angleTag: string;
  alignScore?: number | null;
  persona?: {
    id?: number;
    name: string;
    emoji: string;
    photoUpdatedAt?: string | Date | null;
  } | null;
};

function plainText(p: ResultPost): string {
  return [
    `HOOK: ${p.hook}`,
    ``,
    p.script,
    ``,
    `ON SCREEN: ${p.onScreenText.join(" | ")}`,
    `CTA: ${p.cta}`,
    p.videoBrief ? `\nBRIEF: ${p.videoBrief}` : "",
  ].join("\n");
}

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  const cls =
    score >= 90
      ? "border-emerald-500/40 text-emerald-500"
      : score >= 80
        ? "border-orange-500/40 text-orange-500"
        : "border-red-500/40 text-red-500";
  return (
    <Badge variant="outline" className={cls}>
      {score}% match
    </Badge>
  );
}

function SelectToggle({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border transition",
        checked
          ? "border-orange-500 bg-orange-500 text-white"
          : "border-border text-muted-foreground hover:border-orange-500/60",
      )}
    >
      {checked ? <Check className="size-4" /> : null}
    </button>
  );
}

export function ResultsGrid({
  posts,
  onUpdated,
}: {
  posts: ResultPost[];
  onUpdated?: (post: ResultPost) => void;
}) {
  const [open, setOpen] = useState<ResultPost | null>(null);
  const [copied, setCopied] = useState(false);
  const [refine, setRefine] = useState("");
  const [refining, setRefining] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [bulkSending, setBulkSending] = useState(false);

  const postIds = useMemo(() => posts.map((p) => p.id), [posts]);
  const selectedIds = useMemo(
    () => postIds.filter((id) => selected.has(id)),
    [postIds, selected],
  );
  const allSelected = postIds.length > 0 && selectedIds.length === postIds.length;

  async function copy(p: ResultPost) {
    await navigator.clipboard.writeText(plainText(p));
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  }

  async function runRefine() {
    if (!open || !refine.trim()) return;
    setRefining(true);
    try {
      const res = await fetch(`/api/posts/${open.id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: refine.trim() }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Refine failed");
      const next: ResultPost = {
        ...open,
        ...b.post,
        persona: b.post.persona ?? open.persona,
      };
      setOpen(next);
      onUpdated?.(next);
      setRefine("");
      toast.success("Refined — saved to this persona's knowledge.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refine failed");
    } finally {
      setRefining(false);
    }
  }

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(postIds));
  }

  function clearSelected() {
    setSelected(new Set());
  }

  async function bulkSend() {
    if (!selectedIds.length || bulkSending) return;
    setBulkSending(true);
    try {
      const res = await fetch("/api/airtable/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds: selectedIds }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || b.error) throw new Error(b.error ?? "Airtable send failed");
      toast.success(`Sent ${Number(b.rows ?? 0)} to Airtable`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Airtable send failed");
    } finally {
      setBulkSending(false);
    }
  }

  return (
    <>
      {posts.length > 0 && (
        <div className="bg-background/95 sticky top-16 z-10 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={allSelected ? clearSelected : selectAll}
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              {allSelected ? "Clear" : "Select all"}
            </button>
            <span className="text-muted-foreground text-sm tabular-nums">
              {selectedIds.length
                ? `${selectedIds.length} of ${posts.length} selected`
                : `${posts.length} ${posts.length === 1 ? "copy" : "copies"}`}
            </span>
          </div>
          <Button
            size="sm"
            onClick={bulkSend}
            disabled={!selectedIds.length || bulkSending}
            className="gap-2"
          >
            {bulkSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {bulkSending
              ? "Sending…"
              : selectedIds.length
                ? `Send ${selectedIds.length} to Airtable`
                : "Send to Airtable"}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Card
              className={cn(
                "hover:border-orange-500/50 h-full cursor-pointer transition-colors",
                selected.has(p.id) && "border-orange-500 bg-orange-500/5",
              )}
              onClick={() => {
                setOpen(p);
                setRefine("");
              }}
            >
              <CardContent className="flex h-full flex-col gap-3 pt-6">
                <div className="flex items-center gap-2">
                  <SelectToggle
                    checked={selected.has(p.id)}
                    label={`Select copy: ${p.hook}`}
                    onToggle={() => toggleSelected(p.id)}
                  />
                  <SendToAirtableButton postId={p.id} className="flex-1" />
                </div>
                <div className="flex items-center gap-2">
                  <PersonaAvatar
                    id={p.persona?.id}
                    name={p.persona?.name ?? ""}
                    emoji={p.persona?.emoji ?? "🥩"}
                    photoUpdatedAt={p.persona?.photoUpdatedAt}
                    className="size-8"
                  />
                  <span className="text-muted-foreground truncate text-xs">{p.persona?.name}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <ScoreBadge score={p.alignScore} />
                    {p.angleTag && (
                      <Badge variant="secondary" className="text-[10px]">
                        {p.angleTag}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="line-clamp-2 font-medium">{p.hook}</p>
                <p className="text-muted-foreground line-clamp-4 whitespace-pre-line text-sm">{p.script}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <DialogHeader>
                <div className="mb-1 flex items-center gap-2">
                  <PersonaAvatar
                    id={open.persona?.id}
                    name={open.persona?.name ?? ""}
                    emoji={open.persona?.emoji ?? "🥩"}
                    photoUpdatedAt={open.persona?.photoUpdatedAt}
                    className="size-8"
                  />
                  <span className="text-muted-foreground truncate text-sm">{open.persona?.name}</span>
                  <ScoreBadge score={open.alignScore} />
                </div>
                <DialogTitle className="text-left text-lg leading-snug">{open.hook}</DialogTitle>
                <DialogDescription className="sr-only">Generated post detail</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <section>
                  <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">Script</p>
                  <p className="whitespace-pre-line leading-relaxed">{open.script}</p>
                </section>
                {open.onScreenText.length > 0 && (
                  <section>
                    <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">On-screen text</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {open.onScreenText.map((c, i) => (
                        <Badge key={i} variant="outline">{c}</Badge>
                      ))}
                    </ul>
                  </section>
                )}
                <section className="flex gap-4">
                  <div>
                    <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">CTA</p>
                    <p>{open.cta}</p>
                  </div>
                </section>
                {open.videoBrief && (
                  <section>
                    <p className="text-muted-foreground mb-1 flex items-center gap-1 text-xs font-semibold uppercase">
                      <Film className="size-3" /> Shoot brief
                    </p>
                    <p className="whitespace-pre-line leading-relaxed">{open.videoBrief}</p>
                  </section>
                )}

                <section className="space-y-2 border-t pt-3">
                  <Label htmlFor="refine">Refine</Label>
                  <Textarea
                    id="refine"
                    rows={3}
                    value={refine}
                    onChange={(e) => setRefine(e.target.value)}
                    placeholder="e.g. Make the hook angrier. Name animal fat in the first line."
                  />
                  <p className="text-muted-foreground text-[11px]">
                    This rewrite is saved as knowledge for this persona and used in every later generation.
                  </p>
                  <Button onClick={runRefine} disabled={refining || !refine.trim()} className="w-full gap-2">
                    {refining ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
                    {refining ? "Refining…" : "Refine"}
                  </Button>
                </section>

                <Button variant="outline" onClick={() => copy(open)} className="w-full gap-2">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy post"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
