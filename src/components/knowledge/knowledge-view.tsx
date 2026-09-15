"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Pencil, Lock, BookOpen, ExternalLink, Film } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { KnowledgeSheet, type KnowledgeCreateMode, type KnowledgeListItem } from "./knowledge-sheet";

export type { KnowledgeListItem };

export function KnowledgeView({
  entries,
  isAdmin,
}: {
  entries: KnowledgeListItem[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<KnowledgeListItem | null>(null);
  const [creating, setCreating] = useState<false | KnowledgeCreateMode>(false);
  const [toggling, setToggling] = useState<number | null>(null);

  const activeCount = entries.filter((e) => e.active).length;

  async function toggleActive(entry: KnowledgeListItem, active: boolean) {
    setToggling(entry.id);
    const res = await fetch(`/api/knowledge/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setToggling(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b.error ?? "Failed to update");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {entries.length
              ? `${activeCount} active ${activeCount === 1 ? "entry" : "entries"} feed every generation`
              : "Paste a YouTube link or notes — they become copy fuel for every persona"}
          </p>
        </div>
        {isAdmin ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCreating("youtube")} className="gap-2">
              <Film className="size-4" /> Add YouTube
            </Button>
            <Button onClick={() => setCreating("paste")} className="gap-2">
              <Plus className="size-4" /> Add notes
            </Button>
          </div>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3" /> Member view
          </Badge>
        )}
      </div>

      {!entries.length && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="bg-muted flex size-12 items-center justify-center rounded-full">
              <BookOpen className="text-muted-foreground size-5" />
            </div>
            <div>
              <p className="font-medium">No source material yet</p>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                Drop in a YouTube link or paste a transcript. We’ll distill it and use the specifics in generated scripts.
              </p>
            </div>
            {isAdmin && (
              <div className="mt-2 flex gap-2">
                <Button variant="outline" onClick={() => setCreating("youtube")} className="gap-2">
                  <Film className="size-4" /> Add YouTube
                </Button>
                <Button onClick={() => setCreating("paste")} className="gap-2">
                  <Plus className="size-4" /> Add notes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {entries.map((e, i) => (
          <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Card className={!e.active ? "opacity-60" : ""}>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{e.title}</p>
                    {!e.active && <Badge variant="secondary">off</Badge>}
                  </div>
                  {e.sourceUrl && (
                    <a
                      href={e.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      {e.sourceUrl.replace(/^https?:\/\//, "").slice(0, 72)}
                    </a>
                  )}
                  {e.digest && (
                    <p className="text-muted-foreground mt-2 line-clamp-3 text-sm whitespace-pre-wrap">{e.digest}</p>
                  )}
                  <p className="text-muted-foreground mt-2 text-xs tabular-nums">
                    {e.bodyChars.toLocaleString()} characters
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isAdmin && (
                    <>
                      <Switch
                        checked={e.active}
                        disabled={toggling === e.id}
                        onCheckedChange={(v) => toggleActive(e, v)}
                        aria-label={e.active ? "Turn off" : "Turn on"}
                      />
                      <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditing(e)}>
                        <Pencil className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <KnowledgeSheet
        open={!!creating || !!editing}
        entry={editing}
        createMode={creating || "paste"}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}
