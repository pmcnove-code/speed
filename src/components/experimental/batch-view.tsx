"use client";

import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, ChevronDown, AlertCircle, Check, Zap, Plus } from "lucide-react";
import { ScriptBreakdownPreview } from "./script-breakdown-preview";
import { useScriptBreakdown } from "@/lib/experimental/use-script-breakdown";
import { useBatchProgress } from "@/lib/experimental/use-batch-progress";
import type { BreakdownResult } from "@/lib/experimental/use-script-breakdown";
import { toast } from "sonner";

interface Script {
  id: number;
  hook: string;
  script: string;
  status: "draft" | "analyzing" | "reviewed" | "generating" | "complete" | "error";
  breakdown?: BreakdownResult | null;
  error?: string | null;
}

interface Video {
  id: number;
  scriptId: number;
  jobId?: number;
  status: "queued" | "generating" | "complete" | "error";
  duration?: number;
  progress?: number;
  videoLabel?: string;
}

const BATCH_ID = 1; // Default batch ID for MVP

export function BatchView() {
  const [activeTab, setActiveTab] = useState<"scripts" | "videos" | "progress">("scripts");
  const [scripts, setScripts] = useState<Script[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editHook, setEditHook] = useState("");
  const [editScript, setEditScript] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const scriptBreakdown = useScriptBreakdown(BATCH_ID);

  const batchProgress = useBatchProgress({
    batchId: BATCH_ID,
    onStageChange: (event) => {
      console.log("[Batch] Stage change:", event.stage, event.detail);
      // Update video progress based on stage
      if (event.stage === "setup" || event.stage === "flow") {
        setVideos((prev) =>
          prev.map((v) => ({
            ...v,
            status: v.status === "queued" ? "generating" : v.status,
            progress: v.progress ?? 0,
          }))
        );
      } else if (event.stage === "rendering" || event.stage === "assembling") {
        setVideos((prev) =>
          prev.map((v) => ({
            ...v,
            progress: Math.min((v.progress ?? 0) + 15, 95),
          }))
        );
      }
    },
    onComplete: (success) => {
      if (success) {
        setVideos((prev) =>
          prev.map((v) => ({
            ...v,
            status: "complete",
            progress: 100,
          }))
        );
        toast.success("All clips generated successfully!");
      } else {
        toast.error("Batch generation failed");
      }
      setIsGenerating(false);
    },
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      batchProgress.disconnect();
    };
  }, [batchProgress]);

  const generatingCount = videos.filter((v) => v.status === "generating").length;
  const completeCount = videos.filter((v) => v.status === "complete").length;
  const scriptReviewedCount = scripts.filter((s) => s.status === "reviewed").length;

  const handleAddScript = () => {
    const newId = scripts.length > 0 ? Math.max(...scripts.map((s) => s.id)) + 1 : 1;
    setScripts((prev) => [
      ...prev,
      {
        id: newId,
        hook: "",
        script: "",
        status: "draft",
      },
    ]);
  };

  const handleAnalyze = async (script: Script) => {
    setEditingId(script.id);
    setEditScript(script.script);
    setEditHook(script.hook);

    // Update script status to analyzing
    setScripts((prev) =>
      prev.map((s) =>
        s.id === script.id ? { ...s, status: "analyzing" as const } : s
      )
    );

    try {
      const result = await scriptBreakdown.analyze(script.script);
      if (result) {
        setScripts((prev) =>
          prev.map((s) =>
            s.id === script.id
              ? { ...s, status: "reviewed", breakdown: result }
              : s
          )
        );
      }
    } catch (error) {
      setScripts((prev) =>
        prev.map((s) =>
          s.id === script.id
            ? {
                ...s,
                status: "error",
                error: error instanceof Error ? error.message : "Analysis failed",
              }
            : s
        )
      );
    } finally {
      setEditingId(null);
    }
  };

  const handleGenerateAll = async () => {
    const reviewedScripts = scripts.filter((s) => s.status === "reviewed" && s.breakdown);

    if (reviewedScripts.length === 0) {
      toast.error("Please review at least one script before generating");
      return;
    }

    setIsGenerating(true);

    try {
      // Create video entries for each script's clips
      const newVideos: Video[] = [];
      let videoId = 1;

      for (const script of reviewedScripts) {
        if (script.breakdown) {
          for (let i = 0; i < script.breakdown.totalClips; i++) {
            newVideos.push({
              id: videoId++,
              scriptId: script.id,
              status: "queued",
              progress: 0,
            });
          }
        }
      }

      setVideos(newVideos);

      // Call the generate-all API endpoint
      const response = await fetch(`/api/batches/${BATCH_ID}/generate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start generation");
      }

      const result = await response.json();
      console.log("Generation started:", result);

      // Map job IDs to videos if available
      if (result.jobs && Array.isArray(result.jobs)) {
        setVideos((prev) =>
          prev.map((v, idx) => ({
            ...v,
            jobId: result.jobs[idx]?.id,
            videoLabel: result.jobs[idx]?.videoLabel,
          }))
        );
      }

      // Start listening to progress events
      batchProgress.connect();
      toast.success(`Started generating ${newVideos.length} clips concurrently`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      toast.error(message);
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Production Batch</h1>
        <p className="text-muted-foreground">
          Scripts → Clips → Videos (all generated concurrently)
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as "scripts" | "videos" | "progress")} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="scripts">
            Scripts
            {scripts.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {scripts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="videos">
            Videos
            {videos.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {videos.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="progress">
            Progress
            {generatingCount > 0 && (
              <Badge className="ml-2">
                <Zap className="size-3 mr-1" />
                {generatingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Scripts Tab */}
        <TabsContent value="scripts" className="space-y-4">
          <div className="grid gap-4">
            {scripts.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground mb-4">
                    No scripts yet. Add scripts to get started.
                  </p>
                  <Button onClick={handleAddScript} className="w-full">
                    <Plus className="size-4 mr-2" />
                    Add First Script
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {scripts.map((script) => (
                  <Card key={script.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{script.hook || "Untitled"}</CardTitle>
                          <CardDescription className="mt-1">{script.script.substring(0, 100)}...</CardDescription>
                        </div>
                        <Badge
                          variant={
                            script.status === "complete"
                              ? "default"
                              : script.status === "error"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {script.status === "analyzing" && (
                            <span className="flex items-center gap-1">
                              <Zap className="size-3 animate-spin" /> Analyzing
                            </span>
                          )}
                          {script.status === "reviewed" && (
                            <span className="flex items-center gap-1">
                              <Check className="size-3" /> Reviewed
                            </span>
                          )}
                          {script.status === "draft" && "Draft"}
                          {script.status === "error" && "Error"}
                          {script.status === "complete" && "Complete"}
                        </Badge>
                      </div>
                    </CardHeader>

                    {script.breakdown && (
                      <ScriptBreakdownPreview
                        breakdown={script.breakdown}
                        onClear={() =>
                          setScripts((prev) =>
                            prev.map((s) =>
                              s.id === script.id
                                ? { ...s, status: "draft", breakdown: null }
                                : s
                            )
                          )
                        }
                      />
                    )}

                    {script.error && (
                      <CardContent>
                        <div className="flex gap-2 p-3 bg-red-50 text-red-800 rounded text-sm">
                          <AlertCircle className="size-4 flex-shrink-0" />
                          <span>{script.error}</span>
                        </div>
                      </CardContent>
                    )}

                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Hook</label>
                        <input
                          type="text"
                          value={editingId === script.id ? editHook : script.hook}
                          onChange={(e) => setEditHook(e.target.value)}
                          placeholder="Script hook..."
                          className="w-full px-3 py-2 border rounded text-sm"
                          disabled={script.status === "analyzing"}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Script</label>
                        <textarea
                          value={editingId === script.id ? editScript : script.script}
                          onChange={(e) => setEditScript(e.target.value)}
                          placeholder="Enter script text..."
                          className="w-full px-3 py-2 border rounded text-sm font-mono"
                          rows={4}
                          disabled={script.status === "analyzing"}
                        />
                      </div>

                      <Button
                        onClick={() => handleAnalyze(script)}
                        disabled={script.status === "analyzing" || !script.script.trim()}
                        className="w-full"
                        variant={script.status === "reviewed" ? "outline" : "default"}
                      >
                        {script.status === "analyzing" ? (
                          <>
                            <Zap className="size-4 mr-2 animate-spin" />
                            Analyzing...
                          </>
                        ) : script.status === "reviewed" ? (
                          <>
                            <Check className="size-4 mr-2" />
                            Re-analyze
                          </>
                        ) : (
                          <>
                            <Zap className="size-4 mr-2" />
                            Analyze Clips
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}

                <Button onClick={handleAddScript} variant="outline" className="w-full">
                  <Plus className="size-4 mr-2" />
                  Add Another Script
                </Button>
              </>
            )}
          </div>

          {scriptReviewedCount > 0 && (
            <Button
              onClick={handleGenerateAll}
              disabled={isGenerating}
              size="lg"
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
            >
              <Play className="size-4 mr-2" />
              Generate All {scripts.filter((s) => s.breakdown).length} Scripts
            </Button>
          )}
        </TabsContent>

        {/* Videos Tab */}
        <TabsContent value="videos" className="space-y-4">
          <div className="grid gap-4">
            {videos.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    No clips generated yet. Review scripts and click "Generate All" to start.
                  </p>
                </CardContent>
              </Card>
            ) : (
              videos.map((video) => {
                const script = scripts.find((s) => s.id === video.scriptId);
                return (
                  <Card key={video.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base">
                            {video.videoLabel || `Clip ${video.id}`}
                          </CardTitle>
                          {script && (
                            <CardDescription>{script.hook}</CardDescription>
                          )}
                        </div>
                        <Badge
                          variant={
                            video.status === "complete"
                              ? "default"
                              : video.status === "error"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {video.status === "generating" && (
                            <span className="flex items-center gap-1">
                              <Zap className="size-3 animate-spin" /> {video.progress ?? 0}%
                            </span>
                          )}
                          {video.status === "complete" && (
                            <span className="flex items-center gap-1">
                              <Check className="size-3" /> Complete
                            </span>
                          )}
                          {video.status === "queued" && "Queued"}
                          {video.status === "error" && "Error"}
                        </Badge>
                      </div>
                    </CardHeader>
                    {video.status === "generating" && (
                      <CardContent>
                        <div className="w-full bg-gray-200 rounded h-2">
                          <div
                            className="bg-blue-600 h-2 rounded transition-all"
                            style={{ width: `${video.progress ?? 0}%` }}
                          />
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Progress Tab */}
        <TabsContent value="progress" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generation Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded">
                  <div className="text-sm text-muted-foreground">Generating</div>
                  <div className="text-3xl font-bold">{generatingCount}</div>
                </div>
                <div className="p-4 bg-green-50 rounded">
                  <div className="text-sm text-muted-foreground">Complete</div>
                  <div className="text-3xl font-bold">{completeCount}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-muted-foreground">Total</div>
                  <div className="text-3xl font-bold">{videos.length}</div>
                </div>
              </div>

              {videos.length > 0 && (
                <>
                  <div>
                    <h3 className="font-semibold mb-3">Concurrent Progress</h3>
                    <div className="space-y-2">
                      {videos
                        .filter((v) => v.status !== "queued")
                        .map((video) => (
                          <div key={video.id} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>{video.videoLabel || `Clip ${video.id}`}</span>
                              <span className="text-muted-foreground">
                                {video.status === "generating" ? `${video.progress ?? 0}%` : video.status}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded h-1.5">
                              <div
                                className={`h-1.5 rounded transition-all ${
                                  video.status === "complete"
                                    ? "bg-green-600"
                                    : video.status === "error"
                                    ? "bg-red-600"
                                    : "bg-blue-600"
                                }`}
                                style={{ width: `${video.progress ?? 0}%` }}
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {isGenerating && (
                    <div className="p-3 bg-blue-50 rounded text-sm text-blue-800">
                      ✓ Generation running. All {videos.length} clips are processing concurrently.
                    </div>
                  )}
                </>
              )}

              {videos.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No generation in progress. Review scripts and click "Generate All" to start.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
