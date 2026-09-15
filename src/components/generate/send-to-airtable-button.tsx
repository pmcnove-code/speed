"use client";

import { useState, type MouseEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SendToAirtableButton({
  postId,
  variant = "default",
  className,
}: {
  postId: number;
  variant?: "default" | "outline";
  className?: string;
}) {
  const [sending, setSending] = useState(false);

  async function send(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!postId) return;
    setSending(true);
    try {
      const res = await fetch("/api/airtable/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || b.error) throw new Error(b.error ?? "Airtable send failed");
      toast.success(`Sent ${Number(b.rows ?? 0)} to Airtable`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Airtable send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={send}
      disabled={sending || !postId}
      className={cn("w-full gap-2", className)}
    >
      {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      {sending ? "Sending…" : "Send to Airtable"}
    </Button>
  );
}
