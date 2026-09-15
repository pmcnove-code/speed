"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, Film } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const SHORT_BODY = 2400;

export type KnowledgeListItem = {
  id: number;
  title: string;
  digest: string;
  sourceUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  bodyChars: number;
};

export type KnowledgeCreateMode = "paste" | "youtube";

type Form = { title: string; sourceUrl: string; body: string; youtubeUrl: string; active: boolean };

const EMPTY: Form = { title: "", sourceUrl: "", body: "", youtubeUrl: "", active: true };

export function KnowledgeSheet({
  open,
  entry,
  createMode = "paste",
  onClose,
  onSaved,
}: {
  open: boolean;
  entry: KnowledgeListItem | null;
  createMode?: KnowledgeCreateMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [tab, setTab] = useState<KnowledgeCreateMode>(createMode);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(entry ? "paste" : createMode);
    if (!entry) {
      setForm(EMPTY);
      return;
    }
    setForm({ title: entry.title, sourceUrl: entry.sourceUrl ?? "", body: "", youtubeUrl: "", active: entry.active });
    setLoading(true);
    fetch(`/api/knowledge/${entry.id}`)
      .then(async (res) => {
        const b = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(b.error ?? "Failed to load");
        setForm({
          title: b.entry.title,
          sourceUrl: b.entry.sourceUrl ?? "",
          body: b.entry.body ?? "",
          youtubeUrl: "",
          active: b.entry.active,
        });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [open, entry, createMode]);

  const set = (k: keyof Form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const willDistill = form.body.trim().length > SHORT_BODY;
  const youtubeMode = !entry && tab === "youtube";

  async function savePaste() {
    setSaving(true);
    try {
      const res = await fetch(entry ? `/api/knowledge/${entry.id}` : "/api/knowledge", {
        method: entry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          sourceUrl: form.sourceUrl,
          body: form.body,
          active: form.active,
        }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Save failed");
      toast.success(willDistill ? "Saved and distilled into copy fuel" : "Saved — this will feed the next generation");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveYoutube() {
    setSaving(true);
    try {
      const res = await fetch("/api/knowledge/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: form.youtubeUrl,
          title: form.title,
          active: form.active,
        }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Transcribe failed");
      const via = b.entry?.via === "deepgram" ? "Deepgram" : "captions";
      toast.success(`Transcribed via ${via} — ready for the next generate`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcribe failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!entry) return;
    if (!confirm(`Delete “${entry.title}”?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/knowledge/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Delete failed");
      }
      toast.success("Deleted");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  const canSave = youtubeMode ? Boolean(form.youtubeUrl.trim()) : Boolean(form.title.trim() && form.body.trim());

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{entry ? "Edit knowledge" : youtubeMode ? "Add YouTube" : "New knowledge"}</SheetTitle>
          <SheetDescription>
            {youtubeMode
              ? "Paste a YouTube link. We’ll pull captions, or transcribe the audio with Deepgram if there aren’t any."
              : "Paste a transcript, article, or notes. Long pieces are distilled into copy fuel."}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 px-4 py-8 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4 px-4 py-2">
            {!entry && (
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={tab === "youtube" ? "default" : "outline"} className="gap-1.5" onClick={() => setTab("youtube")}>
                  <Film className="size-4" /> YouTube link
                </Button>
                <Button type="button" size="sm" variant={tab === "paste" ? "default" : "outline"} onClick={() => setTab("paste")}>
                  Paste text
                </Button>
              </div>
            )}

            {youtubeMode ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="kb-yt">YouTube URL</Label>
                  <Input
                    id="kb-yt"
                    value={form.youtubeUrl}
                    onChange={(e) => set("youtubeUrl", e.target.value)}
                    placeholder="https://youtube.com/watch?v=…"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kb-yt-title">Title (optional)</Label>
                  <Input
                    id="kb-yt-title"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="Leave blank to use the video title"
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Long videos can take a few minutes. Captions are used when they exist; otherwise Deepgram transcribes the audio.
                </p>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="kb-title">Title</Label>
                  <Input
                    id="kb-title"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="e.g. Baker podcast — protein & testosterone"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kb-url">Source URL (optional)</Label>
                  <Input
                    id="kb-url"
                    value={form.sourceUrl}
                    onChange={(e) => set("sourceUrl", e.target.value)}
                    placeholder="https://youtube.com/watch?v=…"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="kb-body">Transcript / notes</Label>
                    <span className="text-muted-foreground text-xs tabular-nums">{form.body.length.toLocaleString()} chars</span>
                  </div>
                  <Textarea
                    id="kb-body"
                    rows={16}
                    value={form.body}
                    onChange={(e) => set("body", e.target.value)}
                    placeholder="Paste the full transcript or any source material here…"
                    className="font-mono text-sm"
                  />
                  <p className="text-muted-foreground text-xs">
                    {willDistill
                      ? "This is long — we’ll extract claims, stories, and phrases on save (takes a few seconds)."
                      : "Short notes go in as-is. Longer transcripts get distilled automatically."}
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="kb-active">Active (used in generation)</Label>
              <Switch id="kb-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
            </div>
          </div>
        )}

        <SheetFooter>
          {entry && (
            <Button variant="ghost" className="text-destructive mr-auto gap-2" onClick={remove} disabled={saving}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button onClick={youtubeMode ? saveYoutube : savePaste} disabled={saving || loading || !canSave} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving
              ? youtubeMode
                ? "Transcribing…"
                : willDistill
                  ? "Extracting copy fuel…"
                  : "Saving…"
              : youtubeMode
                ? "Transcribe & add"
                : entry
                  ? "Save"
                  : "Add to knowledge"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
