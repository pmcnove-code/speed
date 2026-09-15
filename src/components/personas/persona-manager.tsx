"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Pencil, Lock } from "lucide-react";
import { toast } from "sonner";
import type { Persona } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonaSheet } from "./persona-sheet";
import { PersonaAvatar } from "./persona-avatar";

const INTENSITY_COLOR: Record<string, string> = {
  calm: "border-sky-500/40 text-sky-400",
  bold: "border-orange-500/40 text-orange-400",
  aggressive: "border-red-500/40 text-red-400",
};

export function PersonaManager({ personas, isAdmin }: { personas: Persona[]; isAdmin: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Persona | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Personas</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {personas.length} avatars · {isAdmin ? "you can create and edit" : "read-only (admin manages these)"}
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="size-4" /> New persona
          </Button>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3" /> Member view
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {personas.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Card className={`group h-full ${!p.active ? "opacity-60" : ""}`}>
              <CardContent className="flex h-full flex-col gap-3 pt-6">
                <div className="flex items-center gap-2">
                  <PersonaAvatar
                    id={p.id}
                    name={p.name}
                    emoji={p.emoji}
                    photoUpdatedAt={p.photoUpdatedAt}
                    className="size-11"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{p.handle}</p>
                  </div>
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto size-8 opacity-0 transition group-hover:opacity-100"
                      onClick={() => setEditing(p)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground line-clamp-2 text-sm">{p.audience}</p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={INTENSITY_COLOR[p.intensity]}>
                    {p.intensity}
                  </Badge>
                  {!p.active && <Badge variant="secondary">inactive</Badge>}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {isAdmin && (
        <PersonaSheet
          open={creating || !!editing}
          persona={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            toast.success("Persona saved");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
