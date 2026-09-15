"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Download, Play } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { apiJson } from "@/lib/api-client";
import { describeFetchError, flowFailure } from "@/lib/experimental/flow-failure";

interface Video {
  id: number;
  batchId: number | null;
  status: string;
  stage?: string;
  error?: string | null;
  errorCode?: string | null;
  partial?: boolean;
  durationMs?: number;
  createdAt: string;
  finishedAt?: string | null;
  hook?: string;
}

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-500/20 text-yellow-700",
  running: "bg-blue-500/20 text-blue-700",
  done: "bg-green-500/20 text-green-700",
  error: "bg-red-500/20 text-red-700",
  incomplete: "bg-amber-500/20 text-amber-700",
};

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const statusMapRef = useRef<Map<number, string>>(new Map());
  const pollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const fetchVideos = async () => {
    try {
      setLoadError(null);
      const data = await apiJson<Video[]>("/api/reel-jobs");

      // Detect transitions and fire toasts
      const statusMap = statusMapRef.current;
      for (const video of data) {
        const prev = statusMap.get(video.id);
        if (prev && prev !== video.status) {
          // Transitioned to a terminal state
          if (video.status === "done") {
            if (video.partial) {
              toast.warning(`Video #${video.id} finished with clips missing`, {
                description: "Open it to regenerate the rest.",
              });
            } else {
              toast.success(`Video #${video.id} ready`, {
                action: {
                  label: "Open",
                  onClick: () => {
                    window.location.href = `/videos/${video.id}`;
                  },
                },
              });
            }
          } else if (video.status === "error") {
            const f = flowFailure(video.errorCode, video.error ?? "");
            toast.error(f.title, { description: f.detail });
          }
        }
        statusMap.set(video.id, video.status);
      }

      setVideos(data);
    } catch (error) {
      const msg = describeFetchError(error);
      setLoadError(msg);
      toast.error("Couldn't load videos", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchVideos();
  }, []);

  // Polling
  useEffect(() => {
    const anyPending = videos.some((v) => v.status === "queued" || v.status === "running");

    if (anyPending) {
      pollIntervalRef.current = setInterval(() => {
        fetchVideos();
      }, 4000);
    } else {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = undefined;
    }

    return () => {
      clearInterval(pollIntervalRef.current);
    };
  }, [videos]);

  const filteredVideos = videos.filter(
    (video) =>
      video.id.toString().includes(search) ||
      (video.batchId != null && video.batchId.toString().includes(search)),
  );

  const getStatusBadge = (status: string, partial?: boolean) => {
    if (status === "done" && partial) return { color: STATUS_COLORS.incomplete, label: "Incomplete" };
    return { color: STATUS_COLORS[status] || STATUS_COLORS.done, label: status };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Generated Videos</h1>
          <p className="text-sm text-muted-foreground mt-1">View and manage your generated video clips</p>
        </div>
        <Button asChild>
          <Link href="/scripts">
            <Play className="mr-2 h-4 w-4" />
            Generate More
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by video ID or batch ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Content */}
      {loadError ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex flex-col items-center justify-center h-32 gap-4 pt-6">
            <div>
              <p className="text-sm font-medium text-red-900">Couldn't load videos</p>
              <p className="text-xs text-red-700 mt-1">{loadError}</p>
            </div>
            <Button size="sm" variant="outline" onClick={fetchVideos} className="border-red-300 hover:bg-red-100">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-muted-foreground">Loading videos...</div>
        </div>
      ) : filteredVideos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-muted-foreground">
              {search ? "No videos match your search" : "No videos yet. Generate some to get started."}
            </p>
            {!search && (
              <Button asChild variant="outline" size="sm">
                <Link href="/scripts">Create Batch & Generate</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredVideos.map((video) => {
            const badge = getStatusBadge(video.status, video.partial);
            const durationMs = video.durationMs;
            const duration =
              !durationMs ? "—" : `${Math.floor(Math.floor(durationMs / 1000) / 60)}:${String(Math.floor(durationMs / 1000) % 60).padStart(2, "0")}`;

            return (
              <Link key={video.id} href={`/videos/${video.id}`} className="block">
                <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">Video #{video.id}</CardTitle>
                        <CardDescription>
                          {video.batchId != null ? `Batch #${video.batchId}` : "No batch"} • {duration}
                        </CardDescription>
                      </div>
                      <Badge className={badge.color}>{badge.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{new Date(video.createdAt).toLocaleString()}</p>
                      {video.status === "done" && (
                        <div className="flex gap-2">
                          <a href={`/api/experimental/reels/${video.id}/video?download=1`} onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" type="button">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
