"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function photoSrc(id: number | undefined, photoUpdatedAt: string | Date | null | undefined) {
  if (!id || !photoUpdatedAt) return undefined;
  const t = typeof photoUpdatedAt === "string" ? new Date(photoUpdatedAt).getTime() : photoUpdatedAt.getTime();
  if (!t) return undefined;
  return `/api/personas/${id}/photo?t=${t}`;
}

export function PersonaAvatar({
  id,
  name,
  emoji,
  photoUpdatedAt,
  previewUrl,
  className,
}: {
  id?: number;
  name: string;
  emoji: string;
  photoUpdatedAt?: string | Date | null;
  previewUrl?: string | null;
  className?: string;
}) {
  const src = previewUrl || photoSrc(id, photoUpdatedAt);
  return (
    <Avatar className={cn("size-10", className)}>
      {src ? <AvatarImage src={src} alt={name} className="object-cover" /> : null}
      <AvatarFallback className="bg-muted text-base">{emoji || "🥩"}</AvatarFallback>
    </Avatar>
  );
}
