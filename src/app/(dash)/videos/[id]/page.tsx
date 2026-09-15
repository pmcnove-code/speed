"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, AlertCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { apiJson } from "@/lib/api-client";
import { flowFailure, describeFetchError } from "@/lib/experimental/flow-failure";

interface Video {
  id: number;
  batchId: number | null;
  status: string;
  errorCode?: string | null;
  partial?: boolean;
  durationMs?: number;
  createdAt: string;
  finishedAt?: string | null;
  hook?: string;
  script?: string;
  error?: string;
  videoMime?: string;
  stageDetail?: string;
  stage?: string;
}

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const videoId = params.id as string;

  const fetchVideoData = async () => {
    try {
      setLoadError(null);
      const data = await apiJson<Video>(`/api/reel-jobs/${videoId}`);
      setVideo(data);
      setNotFound(false);
      
      // Toast on completion
      if (data.status === "done") {
        if (data.partial) {
          toast.warning(`Video finished with clips missing`, { description: "Regenerate the rest." });
        } else {
          toast.success("Video ready!");
        }
      } else if (data.status === "error") {
        const f = flowFailure(data.errorCode, data.error ?? "");
        toast.error(f.title, { description: f.detail });
      }
    } catch (error) {
      const err = error as { status?: number; message?: string };
      if (err.status === 404) {
        setNotFound(true);
      } else {
        const msg = describeFetchError(error);
        setLoadError(msg);
        toast.error("Couldn't load video", { description: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  const regenerateClip = async () => {
    setRegenerating(true);
    try {
      const requestId = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
      await apiJson(`/api/experimental/reels/${videoId}/clips/regenerate`, {
        method: "POST",
        body: JSON.stringify({ requestId }),
      });
      toast.success("Regeneration queued");
      // Resume polling
      setLoading(true);
      fetchVideoData();
    } catch (error) {
      const f = flowFailure(null, describeFetchError(error));
      toast.error(f.title, { description: describeFetchError(error) });
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    fetchVideoData();
  }, [videoId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "queued":
        return "bg-yellow-500/20 text-yellow-700";
      case "running":
        return "bg-blue-500/20 text-blue-700";
      case "done":
        return "bg-green-500/20 text-green-700";
      case "error":
        return "bg-red-500/20 text-red-700";
      default:
        return "bg-gray-500/20 text-gray-700";
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-muted-foreground">Loading video details...</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link href="/videos">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Videos
          </Link>
        </Button>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-semibold">Video not found</p>
                <p className="text-sm text-muted-foreground">The video you&apos;re looking for doesn&apos;t exist.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/videos">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mt-4">Video #{video.id}</h1>
          <p className="text-sm text-muted-foreground">
            {video.batchId != null ? (
              <>
                <Link href={`/scripts/${video.batchId}`} className="underline underline-offset-4">
                  Batch #{video.batchId}
                </Link>{" "}
                • {formatDuration(video.durationMs)}
              </>
            ) : (
              `No batch • ${formatDuration(video.durationMs)}`
            )}
          </p>
        </div>
        <Badge className={`h-fit ${getStatusColor(video.status)}`}>
          {video.status}
        </Badge>
      </div>

      {/* Error */}
      {video.error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-semibold">Error</p>
                <p className="text-sm">{video.error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-medium capitalize">{video.status}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Stage</p>
              <p className="font-medium capitalize">{video.stage || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="font-medium">{formatDuration(video.durationMs)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="font-medium text-sm">{new Date(video.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          {video.stageDetail && (
            <div>
              <p className="text-xs text-muted-foreground">Details</p>
              <p className="text-sm mt-1">{video.stageDetail}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Script Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {video.hook && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Hook</p>
              <p className="text-sm mt-1">{video.hook}</p>
            </div>
          )}
          {video.script && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Script</p>
              <p className="text-sm mt-1 whitespace-pre-wrap">{video.script}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="lg" variant="outline" className="flex-1" asChild>
          <Link href={`/experimental/clips/${video.id}`}>View Clips</Link>
        </Button>
        {video.status === "done" && (
          <Button size="lg" className="flex-1" asChild>
            <a href={`/api/experimental/reels/${video.id}/video?download=1`}>
              <Download className="mr-2 h-4 w-4" />
              Download Video
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
