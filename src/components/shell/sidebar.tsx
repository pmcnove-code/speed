"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Beef, House, Users, History, BookOpen, DollarSign, Settings, Video, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/cost";

const NAV = [
  { href: "/generate", label: "Generate", icon: House, adminOnly: false, exact: false },
  { href: "/scripts", label: "Scripts", icon: FileText, adminOnly: false, exact: false },
  { href: "/videos", label: "Videos", icon: Video, adminOnly: false, exact: false },
  { href: "/personas", label: "Personas", icon: Users, adminOnly: false, exact: false },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen, adminOnly: false, exact: false },
  { href: "/history", label: "History", icon: History, adminOnly: false, exact: false },
  { href: "/costs", label: "Costs", icon: DollarSign, adminOnly: false, exact: false },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true, exact: false },
];

export function Sidebar({ role, totalSpend = 0 }: { role: "admin" | "member"; totalSpend?: number }) {
  const pathname = usePathname();
  return (
    <aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r md:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600 text-white">
          <Beef className="size-4" />
        </div>
        <span className="font-semibold">Reel Copy Studio</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {NAV.filter((n) => !n.adminOnly || role === "admin").map((n) => {
          const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <n.icon className="size-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4">
        <Link href="/costs" className="hover:bg-sidebar-accent/50 block rounded-lg px-2 py-2">
          <div className="text-sidebar-foreground/50 text-[11px] uppercase tracking-wide">Total spend</div>
          <div className="text-lg font-semibold tabular-nums">{formatUsd(totalSpend)}</div>
        </Link>
        <div className="text-sidebar-foreground/50 mt-2 text-xs">Carnivore · Reel Copy Studio · v2</div>
      </div>
    </aside>
  );
}
