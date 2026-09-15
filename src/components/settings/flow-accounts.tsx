"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, LogIn, Plus, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { displayAccountEmail, displayAccountLabel } from "@/lib/experimental/flow-identity";
import type { FlowAccount, FlowLogin, FlowStatus } from "@/lib/experimental/flow-rotate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function connectedCopy(email: string | null | undefined, label?: string | null) {
  const real = displayAccountEmail(email);
  if (real) return `Connected as ${real}.`;
  const safeLabel = displayAccountLabel(label);
  if (safeLabel) return `Connected · ${safeLabel}.`;
  return "Connected.";
}

function isAccountResting(account: FlowAccount): boolean {
  return Boolean(account.restingUntil && Date.parse(account.restingUntil) > Date.now());
}

function accountBadge(account: FlowAccount) {
  if (!account.connected) return { label: "not connected", className: "border-amber-500/40 text-amber-500" };
  if (account.status === "expired") return { label: "expired", className: "border-red-500/40 text-amber-500" };
  if (account.status === "blocked") {
    return { label: "activity paused", className: "border-red-500/40 text-red-500" };
  }
  if (isAccountResting(account)) {
    return { label: "resting", className: "border-amber-500/40 text-amber-500" };
  }
  if (account.status === "no_credits" || account.creditsRemaining === 0) {
    return { label: "no credits", className: "border-amber-500/40 text-amber-500" };
  }
  return { label: "connected", className: "border-emerald-500/40 text-emerald-500" };
}

function coords(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  const w = r.width || 1;
  const h = r.height || 1;
  return {
    x: Math.min(1, Math.max(0, (clientX - r.left) / w)),
    y: Math.min(1, Math.max(0, (clientY - r.top) / h)),
  };
}

function FlowLoginDesk({
  accountId,
  pageUrl,
}: {
  accountId: string;
  pageUrl?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLTextAreaElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [pasteBox, setPasteBox] = useState("");
  const sendRef = useRef<(body: Record<string, unknown>) => void>(() => undefined);

  function focusKeys() {
    keysRef.current?.focus();
  }

  async function send(body: Record<string, unknown>) {
    await fetch("/api/flow/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: accountId, ...body }),
    }).catch(() => undefined);
  }
  sendRef.current = send;

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let current: string | null = null;
    async function tick() {
      try {
        const res = await fetch(`/api/flow/frame?id=${encodeURIComponent(accountId)}&t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!cancelled && res.ok && res.status === 200) {
          const blob = await res.blob();
          const next = URL.createObjectURL(blob);
          if (current) URL.revokeObjectURL(current);
          current = next;
          setFrameUrl(next);
        }
      } catch {
        /* keep last frame */
      }
      if (!cancelled) timer = window.setTimeout(tick, 450);
    }
    void tick();
    focusKeys();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (current) URL.revokeObjectURL(current);
    };
  }, [accountId]);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const text = e.clipboardData?.getData("text/plain") || e.clipboardData?.getData("text") || "";
      if (!text) return;
      e.preventDefault();
      e.stopPropagation();
      void sendRef.current({ type: "text", text });
    }
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [accountId]);

  function point(e: React.MouseEvent | React.PointerEvent) {
    const el = imgRef.current || wrapRef.current;
    if (!el) return null;
    return coords(el, e.clientX, e.clientY);
  }

  return (
    <div className="space-y-3">
      <div
        ref={wrapRef}
        className="bg-muted relative h-[62vh] overflow-hidden rounded-md border"
        onMouseDown={() => focusKeys()}
        onClick={(e) => {
          const xy = point(e);
          if (xy) void send({ type: "click", ...xy });
          focusKeys();
        }}
        onDoubleClick={(e) => {
          const xy = point(e);
          if (xy) void send({ type: "dblclick", ...xy });
        }}
        onWheel={(e) => {
          e.preventDefault();
          void send({ type: "wheel", dx: e.deltaX, dy: e.deltaY });
        }}
      >
        <textarea
          ref={keysRef}
          aria-label="Type or paste into Google sign-in"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="absolute inset-0 z-10 h-full w-full resize-none border-0 bg-transparent text-transparent caret-transparent outline-none"
          onPaste={(e) => {
            const text = e.clipboardData.getData("text/plain") || e.clipboardData.getData("text");
            e.preventDefault();
            if (text) void send({ type: "text", text });
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return;
            e.preventDefault();
            e.stopPropagation();
            void send({
              type: "key",
              key: e.key,
              ctrlKey: e.ctrlKey,
              metaKey: e.metaKey,
              altKey: e.altKey,
              shiftKey: e.shiftKey,
            });
          }}
        />
        {frameUrl ? (
          <img
            ref={imgRef}
            src={frameUrl}
            alt="Google sign-in"
            draggable={false}
            className="pointer-events-none h-full w-full object-fill select-none"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Opening Google sign-in…
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={pasteBox}
          onChange={(e) => setPasteBox(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text/plain") || e.clipboardData.getData("text");
            if (!text) return;
            e.preventDefault();
            void send({ type: "text", text });
            setPasteBox("");
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (pasteBox) {
              void send({ type: "text", text: pasteBox });
              setPasteBox("");
            }
            void send({ type: "key", key: "Enter" });
          }}
          placeholder="Paste email or password here"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!pasteBox}
          onClick={() => {
            void send({ type: "text", text: pasteBox });
            setPasteBox("");
            focusKeys();
          }}
        >
          Paste
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Click the window, then type or paste (⌘V / Ctrl+V). Stay here until you see Flow — then click Done.
        {pageUrl ? ` ${pageUrl.replace(/^https?:\/\//, "").slice(0, 80)}` : ""}
      </p>
    </div>
  );
}

export function FlowAccounts({
  flow,
  onChange,
}: {
  flow: FlowStatus | null;
  onChange: (next: FlowStatus) => void;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [advancedFor, setAdvancedFor] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [login, setLogin] = useState<FlowLogin | null>(null);

  async function run(action: string, extra: Record<string, unknown> = {}, busyKey = action) {
    if (busyKey !== "poll") setBusy(busyKey);
    try {
      const res = await fetch("/api/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
        signal: busyKey.startsWith("probe-") ? AbortSignal.timeout(50_000) : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed");
      if (body.accounts) onChange(body);
      if (body.login) {
        const next = body.login as FlowLogin;
        if (!next.active && next.status !== "connected" && next.status !== "error") {
          setLogin({
            ...next,
            status: "error",
            error: next.error || "Sign-in window closed too early — try again",
          });
        } else {
          setLogin(next);
        }
      }
      return body;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      toast.error(/abort|timeout/i.test(message) ? "Credit check timed out. Try again." : message);
      return null;
    } finally {
      if (busyKey !== "poll") setBusy(null);
    }
  }

  async function addAccount() {
    if (!(await run("createAccount", { label: label.trim() || "Flow account" }, "add"))) return;
    setLabel("");
    toast.success("Account added — click Sign in to Flow.");
  }

  async function saveSession(id: string, raw: string) {
    if (!(await run("saveSession", { id, storageState: raw }, `save-${id}`))) return;
    setAdvancedFor(null);
    setPaste("");
    toast.success("Session saved. Experimental will rotate onto this Google account.");
  }

  async function readFile(id: string, file: File) {
    const text = await file.text();
    await saveSession(id, text);
  }

  async function openLogin(id: string) {
    setLoginFor(id);
    setLogin({ active: true, accountId: id, status: "starting" });
    const body = await run("startLogin", { id }, `login-${id}`);
    if (!body?.login) {
      setLoginFor(null);
      setLogin(null);
    }
  }

  async function closeLogin() {
    const id = loginFor;
    setLoginFor(null);
    if (id) await run("stopLogin", { id }, `stop-${id}`);
    setLogin(null);
  }

  async function confirmSignedIn() {
    const id = loginFor;
    if (!id) return;
    const body = await run("confirmLogin", { id }, `confirm-${id}`);
    if (!body?.login) return;
    if (body.login.status === "error") {
      toast.error(body.login.error || "Sign-in window closed too early — try again");
    }
  }

  useEffect(() => {
    if (!loginFor || login?.status === "connected" || login?.status === "error") return;
    const timer = window.setInterval(() => {
      void run("loginStatus", { id: loginFor }, "poll");
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loginFor, login?.status]);

  useEffect(() => {
    if (login?.status === "connected") {
      const email = displayAccountEmail(login.email);
      toast.success(email ? `Signed in as ${email}` : "Flow is connected.");
    }
  }, [login?.status, login?.email]);

  if (!flow) {
    return <p className="text-muted-foreground text-sm">Checking Flow worker…</p>;
  }

  if (!flow.configured) {
    return (
      <p className="text-muted-foreground text-sm sm:col-span-2">
        Flow worker is not configured on this server. After deploy, the compose sidecar should set
        FLOW_WORKER_URL and FLOW_WORKER_SECRET.
      </p>
    );
  }

  if (!flow.worker) {
    return (
      <p className="text-muted-foreground text-sm sm:col-span-2">
        Flow worker is not reachable. Sign-in runs on the Playwright sidecar, not a GCP service
        account. {flow.error ? ` (${flow.error})` : ""}
      </p>
    );
  }

  const loginAccount = flow.accounts.find((a) => a.id === loginFor);

  return (
    <div className="space-y-4 sm:col-span-2">
      <div className="text-muted-foreground space-y-2 text-sm">
        <p>
          Google Flow is a user Google login. Password/2FA cannot be automated (reCAPTCHA). We used a
          session file as a workaround. GCP service accounts cannot sign into Flow.
        </p>
        <p>
          Flow follows the editor guide: build a Flow character from the avatar once, reuse it on every clip, custom voice, Ingredients + Omni Flash + camera lock + x1, generate 720p, download the clip. Sign in once per Google account — Experimental auto-rotates accounts that still have credits.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="flow-label">Add account</Label>
          <Input
            id="flow-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label or email"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => void addAccount()} disabled={busy === "add"} className="gap-2">
          {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </Button>
      </div>

      {!flow.accounts.length && (
        <p className="text-muted-foreground text-sm">No Flow accounts yet. Add one, then Sign in to Flow.</p>
      )}

      <div className="space-y-3">
        {flow.accounts.map((account) => {
          const badge = accountBadge(account);
          const saving = busy === `save-${account.id}`;
          const email = displayAccountEmail(account.email);
          const title = email || displayAccountLabel(account.label) || (account.connected ? "Connected" : "Flow account");
          const isResting = isAccountResting(account);
          return (
            <div key={account.id} className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{title}</div>
                  {email && displayAccountLabel(account.label) && account.label !== email && (
                    <p className="text-muted-foreground text-xs">{displayAccountLabel(account.label)}</p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {account.connected
                      ? account.status === "blocked"
                        ? "Last generate from this server was flagged — Check credits, then try Flow again"
                        : isResting
                          ? `Resting until this account clears a Flow-side hold — retry after ${new Date(account.restingUntil!).toLocaleTimeString()}`
                          : account.creditsRemaining != null
                            ? `${account.creditsRemaining} credits (last seen)`
                            : "connected — credits unknown until a probe or generate"
                      : "not signed in"}
                    {account.lastUsed ? ` · last used ${new Date(account.lastUsed).toLocaleString()}` : ""}
                  </p>
                  {account.lastError && <p className="text-destructive mt-1 text-xs">{account.lastError}</p>}
                </div>
                <Badge variant="outline" className={badge.className}>
                  {badge.label}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="gap-2"
                  disabled={Boolean(busy) && busy !== `login-${account.id}`}
                  onClick={() => void openLogin(account.id)}
                >
                  {busy === `login-${account.id}` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <LogIn className="size-3.5" />
                  )}
                  Sign in to Flow
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!account.connected || Boolean(busy)}
                  onClick={() => void run("probe", { id: account.id }, `probe-${account.id}`)}
                >
                  {busy === `probe-${account.id}` && <Loader2 className="mr-1 size-3.5 animate-spin" />}
                  Check credits
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!account.connected || Boolean(busy)}
                  className="gap-2"
                  onClick={() => void run("disconnect", { id: account.id }, `disc-${account.id}`)}
                >
                  <Unplug className="size-3.5" />
                  Disconnect
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive gap-2"
                  disabled={Boolean(busy)}
                  onClick={() => void run("removeAccount", { id: account.id }, `rm-${account.id}`)}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              </div>

              <button
                type="button"
                className="text-muted-foreground flex items-center gap-1 text-xs underline-offset-2 hover:underline"
                onClick={() => {
                  setAdvancedFor(advancedFor === account.id ? null : account.id);
                  setPaste("");
                }}
              >
                <ChevronDown className={`size-3 transition ${advancedFor === account.id ? "rotate-180" : ""}`} />
                Advanced: paste a session file
              </button>

              {advancedFor === account.id && (
                <div className="space-y-2">
                  <Label htmlFor={`flow-json-${account.id}`}>storageState.json</Label>
                  <Textarea
                    id={`flow-json-${account.id}`}
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    rows={5}
                    className="font-mono text-xs"
                    placeholder='{"cookies":[...],"origins":[...]}'
                  />
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="file"
                      accept="application/json,.json"
                      className="max-w-xs text-xs"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void readFile(account.id, file);
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={!paste.trim() || saving}
                      className="gap-2"
                      onClick={() => void saveSession(account.id, paste)}
                    >
                      {saving && <Loader2 className="size-3.5 animate-spin" />}
                      Save session
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={Boolean(loginFor)} onOpenChange={(open) => { if (!open) void closeLogin(); }}>
        <DialogContent
          className="max-h-[92vh] sm:max-w-4xl"
          showCloseButton
          onOpenAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (login?.status === "waiting" || login?.status === "starting") e.preventDefault();
          }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Sign in to Google / Flow</DialogTitle>
            <DialogDescription>
              {login?.status === "connected"
                ? connectedCopy(login.email, loginAccount?.label)
                : "Click the window, type or paste, then click Done only after you see Flow — not the Google login."}
            </DialogDescription>
          </DialogHeader>
          {login?.error && <p className="text-destructive text-sm">{login.error}</p>}
          {login?.status === "connected" ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm">
                {displayAccountEmail(login.email) || displayAccountLabel(loginAccount?.label) || "This Google account"} is
                connected.
              </p>
              <Button type="button" onClick={() => void closeLogin()}>
                Done
              </Button>
            </div>
          ) : loginFor && login?.status !== "error" ? (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">Sign in manually in Chrome below, including any Google verification. Once your Flow projects are visible, click Save Flow session.</p>
              <FlowLoginDesk accountId={loginFor} pageUrl={login?.pageUrl} />
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy === `confirm-${loginFor}`}
                  onClick={() => void confirmSignedIn()}
                >
                  {busy === `confirm-${loginFor}` && <Loader2 className="mr-1 size-3.5 animate-spin" />}
                  {busy === `confirm-${loginFor}` ? "Checking session…" : "Save Flow session"}
                </Button>
              </div>
            </div>
          ) : login?.status === "error" ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm">
                {login.error || "Sign-in window closed too early — try again"}
              </p>
              <Button type="button" onClick={() => void closeLogin()}>
                Close
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Starting a browser on the server…
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
