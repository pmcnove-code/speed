"use client";

import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck, Circle } from "lucide-react";
import type { Session } from "@/lib/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Topbar({
  session,
  providers,
}: {
  session: Session;
  providers: { venice: boolean; deepseek: boolean; grok: boolean };
}) {
  const router = useRouter();
  const initials = session.label
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="bg-background/80 sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-2 text-sm">
        <ProviderDot label="DeepSeek" ok={providers.deepseek} />
        <ProviderDot label="Grok" ok={providers.grok} />
        <ProviderDot label="Venice" ok={providers.venice} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none">
          <Avatar className="size-8">
            <AvatarFallback className="bg-gradient-to-br from-orange-500 to-red-600 text-xs text-white">
              {initials || "U"}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-1">
            <span>{session.label}</span>
            <Badge variant={session.role === "admin" ? "default" : "secondary"} className="w-fit gap-1">
              {session.role === "admin" && <ShieldCheck className="size-3" />}
              {session.role}
            </Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
            <LogOut className="size-4" /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function ProviderDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="text-muted-foreground flex items-center gap-1.5">
      <Circle className={ok ? "size-2 fill-emerald-500 text-emerald-500" : "size-2 fill-muted text-muted"} />
      {label}
    </span>
  );
}
