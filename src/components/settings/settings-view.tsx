"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Plus, Loader2, Eye, EyeOff, Pencil, Trash2, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PublicField, ConfigGroup, SettingSource } from "@/lib/config";
import { FlowAccounts } from "@/components/settings/flow-accounts";
import { flowReadyFromStatus, type FlowStatus } from "@/lib/experimental/flow-rotate";

type ProviderInfo = { available: boolean; main: string };
type AirtableInfo = { token: boolean; baseId: string; table: string; ready: boolean };
type AccessCode = { id: number; label: string; role: string; code: string };

const GROUPS: { id: ConfigGroup; title: string; description: string }[] = [
  {
    id: "venice",
    title: "Venice",
    description: "Uncensored generation. Paste a new key and Save — it applies on the next batch.",
  },
  {
    id: "deepseek",
    title: "DeepSeek",
    description: "Used when you pick DeepSeek on Generate. Needs a key before it can be selected.",
  },
  {
    id: "grok",
    title: "Grok",
    description: "xAI Grok 4.6 — punchy voice for reel copy. Paste a key from console.x.ai.",
  },
  {
    id: "gemini",
    title: "Gemini",
    description: "Official Gemini Omni API for Experimental reels — not Google Flow credits.",
  },
  {
    id: "experimental",
    title: "Google Flow",
    description: "Sign in to Flow once per Google account. Avatar becomes a reusable Flow character + custom voice; Ingredients + Omni Flash + x1; generate 720p, download the clip.",
  },
  {
    id: "airtable",
    title: "Airtable",
    description: "Paste the Airtable URL. We split app/tbl and reset the table to Avatar, Copy, Model, Tokens. Posts are sent only when you click Send to Airtable.",
  },
  {
    id: "transcription",
    title: "Deepgram",
    description: "Transcribes YouTube videos that have no captions. Paste a YouTube link on the Knowledge page.",
  },
  {
    id: "generation",
    title: "Generation",
    description: "How each model call is sized. Smaller chunks are slower but more reliable.",
  },
];

function sourceLabel(source: SettingSource): string {
  if (source === "db") return "saved here";
  if (source === "env") return "from env";
  if (source === "default") return "default";
  return "not set";
}

function formFromFields(fields: PublicField[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, f.value]));
}

export function SettingsView({
  providers,
  codes,
  airtable,
  fields: initialFields,
}: {
  providers: { venice: ProviderInfo; deepseek: ProviderInfo; grok: ProviderInfo };
  codes: AccessCode[];
  airtable: AirtableInfo;
  fields: PublicField[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [form, setForm] = useState(() => formFromFields(initialFields));
  const [providerState, setProviderState] = useState(providers);
  const [airtableState, setAirtableState] = useState(airtable);
  const [codeList, setCodeList] = useState(codes);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [role, setRole] = useState("member");
  const [showNew, setShowNew] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editRole, setEditRole] = useState("member");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [flow, setFlow] = useState<FlowStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/flow")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled && body && typeof body === "object") setFlow(body as FlowStatus);
      })
      .catch(() => {
        if (!cancelled) {
          setFlow({ configured: false, worker: false, accounts: [], lastPickedId: null, error: "Could not load Flow status." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<ConfigGroup, PublicField[]>();
    for (const f of fields) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return map;
  }, [fields]);

  function setValue(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveConfig() {
    setSavingCfg(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveConfig", values: form }),
    });
    setSavingCfg(false);
    if (res.ok) {
      const b = await res.json();
      if (Array.isArray(b.fields)) {
        setFields(b.fields);
        setForm(formFromFields(b.fields));
      }
      if (b.providers) setProviderState(b.providers);
      if (b.airtable) setAirtableState(b.airtable);
      toast.success("Saved — next generate / Airtable write uses these values");
      const schema = b.airtableSchema as {
        ok?: boolean;
        error?: string;
        created?: string[];
        deleted?: string[];
        renamed?: string[];
        missing?: string[];
        kept?: string[];
      } | undefined;
      if (schema && (schema.ok === false || schema.error || schema.missing?.length)) {
        toast.error(schema.error ?? `Airtable columns incomplete: ${(schema.missing ?? []).join(", ") || "unknown"}`);
      } else if (schema && (schema.created?.length || schema.deleted?.length || schema.renamed?.length)) {
        const bits = [
          schema.renamed?.length ? `renamed ${schema.renamed.join(", ")}` : "",
          schema.deleted?.length ? `removed ${schema.deleted.join(", ")}` : "",
          schema.created?.length ? `created ${schema.created.join(", ")}` : "",
        ].filter(Boolean);
        toast.success(`Airtable table ready (${bits.join("; ")}).`);
      }
      router.refresh();
    } else {
      const b = await res.json().catch(() => ({}));
      toast.error(b.error ?? "Failed");
    }
  }

  async function syncAirtable() {
    setSyncing(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "syncAirtable" }),
    });
    setSyncing(false);
    const b = await res.json().catch(() => ({}));
    if (b.airtable) setAirtableState(b.airtable);
    if (Array.isArray(b.fields)) {
      setFields(b.fields);
      setForm(formFromFields(b.fields));
    }
    const schema = b.airtableSchema as {
      ok?: boolean;
      error?: string;
      created?: string[];
      deleted?: string[];
      renamed?: string[];
      missing?: string[];
      kept?: string[];
    } | undefined;
    if (!res.ok || schema?.ok === false || schema?.error || schema?.missing?.length) {
      const leftover =
        schema?.kept?.length && !schema.error?.includes(schema.kept[0] ?? "")
          ? ` Leftover: ${schema.kept.join(", ")}.`
          : "";
      toast.error((schema?.error ?? b.error ?? "Airtable sync failed") + leftover);
      return;
    }
    const bits = [
      schema?.renamed?.length ? `renamed ${schema.renamed.join(", ")}` : "",
      schema?.deleted?.length ? `removed ${schema.deleted.join(", ")}` : "",
      schema?.created?.length ? `created ${schema.created.join(", ")}` : "",
    ].filter(Boolean);
    toast.success(
      bits.length ? `Table reset (${bits.join("; ")}).` : "Airtable columns are ready (Avatar, Copy, Model, Tokens)",
    );
    router.refresh();
  }

  function applyCodes(next: AccessCode[]) {
    setCodeList(next);
    router.refresh();
  }

  async function postCode(body: Record<string, unknown>, okMsg: string, id?: number) {
    if (id) setBusyId(id);
    else setSaving(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (id) setBusyId(null);
    else setSaving(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(b.error ?? "Failed");
      return false;
    }
    if (Array.isArray(b.codes)) applyCodes(b.codes);
    toast.success(okMsg);
    return true;
  }

  async function createCode() {
    if (await postCode({ action: "createCode", code, label, role }, "Access code created")) {
      setCode("");
      setLabel("");
      setShowNew(false);
    }
  }

  function startEdit(row: AccessCode) {
    setEditing(row.id);
    setEditLabel(row.label);
    setEditCode(row.code);
    setEditRole(row.role);
  }

  async function saveEdit(id: number) {
    if (
      await postCode(
        { action: "updateCode", id, label: editLabel, code: editCode, role: editRole },
        "Access code updated",
        id,
      )
    ) {
      setEditing(null);
      setRevealed((prev) => new Set(prev).add(id));
    }
  }

  async function removeCode(row: AccessCode) {
    if (!confirm(`Remove access for “${row.label}”? They won’t be able to log in with that code.`)) return;
    await postCode({ action: "deleteCode", id: row.id }, "Access code removed", row.id);
  }

  function toggleReveal(id: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyCode(row: AccessCode) {
    if (!row.code) return;
    await navigator.clipboard.writeText(row.code);
    setCopied(row.id);
    toast.success("Copied");
    window.setTimeout(() => setCopied((cur) => (cur === row.id ? null : cur)), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Keys and models live here. Save once — no redeploy. Database URL and session secret stay in the server env.
        </p>
      </div>

      {GROUPS.map((g) => {
        const groupFields = grouped.get(g.id) ?? [];
        const ready =
          g.id === "venice" || g.id === "deepseek" || g.id === "grok"
            ? providerState[g.id].available
            : g.id === "airtable"
              ? airtableState.ready
              : g.id === "transcription"
                ? (grouped.get("transcription") ?? []).some((f) => f.key === "DEEPGRAM_API_KEY" && f.set)
                : g.id === "gemini"
                  ? (grouped.get("gemini") ?? []).some((f) => f.key === "GEMINI_API_KEY" && f.set)
                  : g.id === "experimental"
                    ? Boolean(flow && flowReadyFromStatus(flow))
                    : true;
        return (
          <Card key={g.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{g.title}</CardTitle>
                  <CardDescription>{g.description}</CardDescription>
                </div>
                {g.id === "experimental" ? (
                  flow && flowReadyFromStatus(flow) ? (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                      <CheckCircle2 className="mr-1 size-3" /> session present
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                      <XCircle className="mr-1 size-3" /> session not present
                    </Badge>
                  )
                ) : (
                  g.id !== "generation" &&
                  (ready ? (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                      <CheckCircle2 className="mr-1 size-3" /> ready
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                      <XCircle className="mr-1 size-3" /> needs setup
                    </Badge>
                  ))
                )}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {groupFields.map((f) => (
                <div
                  key={f.key}
                  className={
                    f.key === "AIRTABLE_BASE_ID" || f.key === "GEMINI_CLOUD_PROJECT"
                      ? "sm:col-span-2"
                      : undefined
                  }
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <Label htmlFor={f.key}>{f.label}</Label>
                    <span className="text-muted-foreground font-mono text-[11px]">{sourceLabel(f.source)}</span>
                  </div>
                  <Input
                    id={f.key}
                    type={f.secret ? "password" : "text"}
                    autoComplete={f.secret ? "new-password" : "off"}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    placeholder={
                      f.secret
                        ? f.set
                          ? `${f.hint} — leave blank to keep`
                          : f.placeholder
                        : f.placeholder
                    }
                    className="font-mono"
                  />
                  {f.help && <p className="text-muted-foreground mt-1 text-xs">{f.help}</p>}
                </div>
              ))}
              {g.id === "experimental" && <FlowAccounts flow={flow} onChange={setFlow} />}
              {g.id === "airtable" && (
                <div className="flex flex-col gap-3 sm:col-span-2">
                  <p className="text-muted-foreground text-xs">
                    Paste a full Airtable URL in Base ID. Sync resets the table to Avatar, Copy, Model,
                    Tokens (primary stays; leftover columns go). PAT needs schema.bases:read and
                    schema.bases:write. Finished posts are not sent automatically — use Send to Airtable
                    on Generate or History.
                  </p>
                  <div>
                    <Button type="button" variant="outline" onClick={syncAirtable} disabled={syncing || savingCfg} className="gap-2">
                      {syncing && <Loader2 className="size-4 animate-spin" />}
                      Sync columns
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex justify-end">
        <Button onClick={saveConfig} disabled={savingCfg} className="gap-2">
          {savingCfg && <Loader2 className="size-4 animate-spin" />}
          Save keys & config
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Access codes</CardTitle>
          <CardDescription>Reveal, copy, edit, or remove login codes. Only admins see this page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {codeList.map((c) => {
              const open = revealed.has(c.id);
              const busy = busyId === c.id;
              if (editing === c.id) {
                return (
                  <div key={c.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label>Label</Label>
                      <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Code</Label>
                      <Input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        placeholder={c.code ? undefined : "set a new code to reveal later"}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Role</Label>
                      <Select value={editRole} onValueChange={setEditRole}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">member</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => saveEdit(c.id)} disabled={busy || !editLabel} className="gap-2">
                        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="min-w-24 font-medium">{c.label}</span>
                  <Badge variant={c.role === "admin" ? "default" : "secondary"}>{c.role}</Badge>
                  <span className="text-muted-foreground min-w-0 flex-1 font-mono text-xs">
                    {c.code ? (open ? c.code : "••••••••") : "not stored — edit to set a visible code"}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={!c.code}
                      onClick={() => toggleReveal(c.id)}
                      aria-label={open ? "Hide access code" : "Show access code"}
                    >
                      {open ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={!c.code}
                      onClick={() => copyCode(c)}
                      aria-label="Copy access code"
                    >
                      {copied === c.id ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => startEdit(c)}
                      aria-label="Edit access code"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => removeCode(c)}
                      aria-label="Remove access code"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-2 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Editor Jane" />
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="strong-code"
                  className="pr-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Hide new code" : "Show new code"}
                >
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createCode} disabled={saving || !code || !label} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
