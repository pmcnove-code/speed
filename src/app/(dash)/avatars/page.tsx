"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiJson } from "@/lib/api-client";
import { AvatarCard } from "@/components/avatars/avatar-card";

interface Background {
  id: number;
  label: string;
  selected: boolean;
}

interface SubtitleStyle {
  id: number;
  name: string;
  selected: boolean;
  config: unknown;
}

interface Avatar {
  id: number;
  name: string;
  handle: string;
  active: boolean;
  hasPhoto: boolean;
  backgrounds: Background[];
  subtitleStyles: SubtitleStyle[];
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchAvatars = async () => {
    try {
      setLoadError(null);
      const data = await apiJson<{ avatars: Avatar[] }>("/api/avatars");
      setAvatars(data.avatars);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load avatars";
      setLoadError(msg);
      toast.error("Couldn't load avatars", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAvatars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchAvatars();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/scripts">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Generate
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Avatars</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your avatars, their backgrounds and subtitle styles.</p>
          </div>
        </div>
        <Button asChild size="lg">
          <Link href="/personas">
            <Plus className="mr-2 h-4 w-4" />
            Add avatar
          </Link>
        </Button>
      </div>

      {/* Content */}
      {loadError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium text-destructive">Failed to load avatars</p>
              <p className="text-sm text-destructive/80 mt-1">{loadError}</p>
            </div>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-muted-foreground">Loading avatars...</div>
        </div>
      ) : avatars.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-muted-foreground">No avatars yet. Create one in Personas to get started.</p>
            <Button asChild size="sm">
              <Link href="/personas">Create First Avatar</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {avatars.map((avatar) => (
            <AvatarCard
              key={avatar.id}
              avatar={avatar}
              onUpdate={fetchAvatars}
            />
          ))}
        </div>
      )}
    </div>
  );
}
