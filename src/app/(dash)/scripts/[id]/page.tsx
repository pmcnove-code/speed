"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Copy, Play, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import Link from "next/link";

interface ReelJobStatus {
  id: number;
  status: string;
  stage: string;
  stageDetail: string;
  error: string | null;
  finishedAt: string | null;
}

interface Post {
  id: number;
  hook: string;
  script: string;
  status?: string;
  reelJob?: ReelJobStatus | null;
}

interface Batch {
  id: number;
  countRequested: number;
  status: string;
  createdAt: string;
  createdBy: string;
  personaIds: number[];
  error?: string;
}

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ hook: "", script: "" });
  const [generating, setGenerating] = useState(false);
  const [validating, setValidating] = useState(false);

  const batchId = params.id as string;

  const fetchBatchData = async () => {
    try {
      const [batchRes, postsRes] = await Promise.all([
        fetch(`/api/batches/${batchId}`),
        fetch(`/api/batches/${batchId}/posts`),
      ]);

      if (!batchRes.ok || !postsRes.ok) throw new Error("Failed to fetch batch data");

      const batchData = await batchRes.json();
      const postsData = await postsRes.json();

      setBatch(batchData.batch);
      setPosts(postsData);
    } catch (error) {
      console.error("Error fetching batch:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatchData();
    const interval = setInterval(fetchBatchData, 3000);
    return () => clearInterval(interval);
  }, [batchId]);

  const handleEdit = (post: Post) => {
    setEditingId(post.id);
    setEditData({ hook: post.hook, script: post.script });
  };

  const handleSaveEdit = async (postId: number) => {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });

      if (!res.ok) throw new Error("Failed to update post");

      setPosts(posts.map((p) => (p.id === postId ? { ...p, ...editData } : p)));
      setEditingId(null);
    } catch (error) {
      console.error("Error saving post:", error);
      alert("Failed to save post");
    }
  };

  const handleGenerateAll = async () => {
    if (!batch) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/batches/${batch.id}/generate-all`, {
        method: "POST",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate videos");
      }

      const result = await res.json();
      setBatch((prev) => prev ? { ...prev, status: "running" } : null);
      alert(`✓ Started generating ${result.jobsCreated} videos concurrently`);
    } catch (error) {
      console.error("Error generating:", error);
      alert(error instanceof Error ? error.message : "Failed to generate videos");
    } finally {
      setGenerating(false);
    }
  };

  const handleValidateAll = async () => {
    if (!batch) return;
    setValidating(true);
    try {
      const res = await fetch(`/api/batches/${batch.id}/validate-all`, {
        method: "POST",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to validate videos");
      }

      const result = await res.json();
      setBatch((prev) => (prev ? { ...prev, status: "done" } : null));
      const airtableNote = result.airtable?.error
        ? ` Airtable send failed: ${result.airtable.error}`
        : ` Sent to Airtable.`;
      alert(`✓ Validated ${result.videosValidated} video(s).${airtableNote}`);
    } catch (error) {
      console.error("Error validating:", error);
      alert(error instanceof Error ? error.message : "Failed to validate videos");
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-muted-foreground">Loading batch details...</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link href="/scripts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Scripts
          </Link>
        </Button>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-semibold">Batch not found</p>
                <p className="text-sm text-muted-foreground">The batch you&apos;re looking for doesn&apos;t exist.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const videoDone = posts.filter((p) => p.reelJob?.status === "done").length;
  const videoErrored = posts.filter((p) => p.reelJob?.status === "error").length;
  const videoPending = posts.filter((p) => !p.reelJob || p.reelJob.status === "queued" || p.reelJob.status === "running").length;
  const videoAllTerminal = posts.length > 0 && videoPending === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/scripts">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mt-4">Batch #{batch.id}</h1>
          <p className="text-sm text-muted-foreground">
            {batch.countRequested} scripts • Created by {batch.createdBy}
          </p>
        </div>
        <Badge className="h-fit" variant={batch.status === "done" || batch.status === "ready" ? "default" : "secondary"}>
          {batch.status}
        </Badge>
      </div>

      {batch.error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-semibold">Error</p>
                <p className="text-sm">{batch.error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scripts List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Scripts ({posts.length})</h2>
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Script #{post.id}</CardTitle>
                    {post.reelJob && (
                      <Badge
                        className={
                          post.reelJob.status === "done"
                            ? "bg-green-500/20 text-green-700"
                            : post.reelJob.status === "error"
                              ? "bg-red-500/20 text-red-700"
                              : "bg-blue-500/20 text-blue-700"
                        }
                      >
                        {post.reelJob.status}
                      </Badge>
                    )}
                  </div>
                  {editingId !== post.id && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(post)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(`${post.hook}\n\n${post.script}`);
                        }}
                        title="Copy hook + script"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {post.reelJob?.status === "error" && post.reelJob.error && (
                  <p className="text-xs text-red-700 mt-2">{post.reelJob.error}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {editingId === post.id ? (
                  <>
                    <div>
                      <label className="text-sm font-medium">Hook</label>
                      <Input
                        value={editData.hook}
                        onChange={(e) => setEditData({ ...editData, hook: e.target.value })}
                        className="mt-1"
                        placeholder="Script hook..."
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Script</label>
                      <Textarea
                        value={editData.script}
                        onChange={(e) => setEditData({ ...editData, script: e.target.value })}
                        className="mt-1 min-h-32"
                        placeholder="Full script text..."
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(post.id)}
                      >
                        Save Changes
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Hook</p>
                      <p className="text-sm mt-1">{post.hook}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Script</p>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{post.script}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Scripts generating */}
      {batch.status === "queued" && (
        <Card className="bg-yellow-500/10 border-yellow-500/20">
          <CardContent className="pt-6">
            <p className="text-sm text-yellow-700">Scripts are still generating…</p>
          </CardContent>
        </Card>
      )}

      {/* Generate All Button */}
      {batch.status === "ready" && (
        <div className="flex gap-2">
          <Button 
            size="lg" 
            className="flex-1"
            onClick={handleGenerateAll}
            disabled={generating}
          >
            {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Play className="mr-2 h-4 w-4" />
            {generating ? "Generating..." : "Generate All Videos (Concurrent)"}
          </Button>
        </div>
      )}
      
      {batch.status === "running" && (
        <Card className={videoAllTerminal ? (videoErrored > 0 ? "bg-red-500/10 border-red-500/20" : "bg-green-500/10 border-green-500/20") : "bg-blue-500/10 border-blue-500/20"}>
          <CardContent className="pt-6 space-y-4">
            <p className={"text-sm " + (videoAllTerminal ? (videoErrored > 0 ? "text-red-700" : "text-green-700") : "text-blue-700")}>
              {videoAllTerminal
                ? videoErrored > 0
                  ? `Generation finished: ${videoDone} succeeded, ${videoErrored} failed. See the errors above or check the `
                  : `All ${videoDone} video(s) finished generating. Check the `
                : `${videoDone + videoErrored}/${posts.length} finished (${videoErrored} failed) — ${videoPending} still generating concurrently. Check the `}
              <Link href="/videos" className="underline underline-offset-4">
                Videos page
              </Link>{" "}
              for full detail, then validate once you&apos;re happy with the results.
            </p>
            <Button onClick={handleValidateAll} disabled={validating}>
              {validating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle className="mr-2 h-4 w-4" />
              {validating ? "Validating..." : "Validate All & Send to Airtable"}
            </Button>
          </CardContent>
        </Card>
      )}
      
      {batch.status === "done" && (
        <Card className="bg-green-500/10 border-green-500/20">
          <CardContent className="pt-6">
            <p className="text-sm text-green-700">
              ✓ All videos completed! View them in the Videos page.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
