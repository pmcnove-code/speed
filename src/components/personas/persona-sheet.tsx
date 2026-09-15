"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Persona } from "@/db/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PersonaAvatar } from "./persona-avatar";

type Form = {
  name: string;
  audience: string;
  tone: string;
  backstory: string;
  angle: string;
  problem: string;
  intensity: string;
  instructions: string;
  emoji: string;
  active: boolean;
};

const EMPTY: Form = {
  name: "",
  audience: "",
  tone: "",
  backstory: "",
  angle: "",
  problem: "",
  intensity: "bold",
  instructions: "",
  emoji: "🥩",
  active: true,
};

export function PersonaSheet({
  open,
  persona,
  onClose,
  onSaved,
}: {
  open: boolean;
  persona: Persona | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
    setRemovePhoto(false);
    if (persona) {
      setForm({
        name: persona.name,
        audience: persona.audience,
        tone: persona.tone,
        backstory: persona.backstory,
        angle: persona.angle,
        problem: persona.problem,
        intensity: persona.intensity,
        instructions: persona.instructions ?? "",
        emoji: persona.emoji,
        active: persona.active,
      });
    } else {
      setForm(EMPTY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset preview when the sheet target changes
  }, [persona, open]);

  const set = (k: keyof Form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  function onPick(file: File | undefined) {
    if (!file) return;
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRemovePhoto(false);
  }

  async function uploadPhoto(id: number, file: File) {
    const fd = new FormData();
    fd.append("photo", file);
    const res = await fetch(`/api/personas/${id}/photo`, { method: "POST", body: fd });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? "Photo upload failed");
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(persona ? `/api/personas/${persona.id}` : "/api/personas", {
        method: persona ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      const id: number = body.persona?.id ?? persona?.id;
      if (removePhoto && persona) {
        await fetch(`/api/personas/${persona.id}/photo`, { method: "DELETE" });
      } else if (pendingFile && id) {
        await uploadPhoto(id, pendingFile);
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const field = (k: keyof Form, label: string, rows = 2) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea rows={rows} value={form[k] as string} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  const hasPhoto = !removePhoto && (!!previewUrl || !!persona?.photoUpdatedAt);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{persona ? "Edit persona" : "New persona"}</SheetTitle>
          <SheetDescription>
            Briefs are injected into every prompt. Write them in the avatar's own voice.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 py-2">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label>Photo</Label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group relative"
                title="Upload photo"
              >
                <PersonaAvatar
                  id={persona?.id}
                  name={form.name || "Persona"}
                  emoji={form.emoji}
                  photoUpdatedAt={removePhoto ? null : persona?.photoUpdatedAt}
                  previewUrl={previewUrl}
                  className="size-16"
                />
                <span className="bg-background/80 absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition group-hover:opacity-100">
                  <Camera className="size-4" />
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0])}
              />
            </div>
            <div className="w-20 space-y-1.5">
              <Label>Emoji</Label>
              <Input value={form.emoji} onChange={(e) => set("emoji", e.target.value)} className="text-center text-lg" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
          </div>
          {hasPhoto && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground -mt-2 gap-1"
              onClick={() => {
                if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
                setPendingFile(null);
                setPreviewUrl(null);
                setRemovePhoto(true);
              }}
            >
              <Trash2 className="size-3.5" /> Remove photo
            </Button>
          )}

          {field("audience", "Audience")}
          {field("tone", "Voice & tone")}
          {field("backstory", "Backstory", 3)}
          {field("angle", "Core angle")}
          {field("problem", "Problem they lean on")}

          <div className="space-y-1.5">
            <Label>Intensity</Label>
            <Select value={form.intensity} onValueChange={(v) => set("intensity", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calm">Calm</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Standing instructions (optional)</Label>
            <Textarea rows={3} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="active">Active (included in “generate all”)</Label>
            <Switch id="active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
          </div>
        </div>

        <SheetFooter>
          <Button onClick={save} disabled={saving || !form.name} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {persona ? "Save changes" : "Create persona"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
