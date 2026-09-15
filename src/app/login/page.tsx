"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Beef, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Invalid access code.");
      setShake((s) => s + 1);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(60%_60%_at_50%_0%,theme(colors.orange.500/25),transparent)]" />
      <motion.div
        key={shake}
        initial={{ opacity: 0, y: 12 }}
        animate={
          error
            ? { opacity: 1, y: 0, x: [0, -10, 10, -8, 8, 0] }
            : { opacity: 1, y: 0 }
        }
        transition={{ duration: error ? 0.4 : 0.5 }}
        className="w-full max-w-sm"
      >
        <Card className="border-border/60 bg-card/80 backdrop-blur">
          <CardContent className="pt-2">
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-lg">
                <Beef className="size-6" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Reel Copy Studio</h1>
                <p className="text-muted-foreground text-sm">Enter your access code to continue</p>
              </div>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <Input
                autoFocus
                type="password"
                placeholder="Access code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="text-center tracking-wide"
              />
              {error && <p className="text-destructive text-center text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading || !code}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Unlock"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
