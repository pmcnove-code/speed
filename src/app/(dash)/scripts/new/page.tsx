"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

const PROVIDERS = ["deepseek", "venice", "grok"];
const MODELS = {
  deepseek: ["deepseek-chat"],
  venice: ["venice-uncensored-1-2"],
  grok: ["grok-4.6"],
};

interface Persona {
  id: number;
  name: string;
  handle: string;
  emoji?: string;
}

interface Format {
  id: number;
  name: string;
  length: string;
}

export default function NewBatchPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("deepseek");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [formats, setFormats] = useState<Format[]>([]);
  const [formData, setFormData] = useState({
    model: "deepseek-chat",
    countRequested: "10",
    situation: "",
    personaIds: [] as number[],
    formatId: "1",
  });

  useEffect(() => {
    fetch("/api/personas")
      .then((res) => res.json())
      .then((data) => setPersonas(data.personas || []))
      .catch((error) => console.error("Error fetching personas:", error));
    fetch("/api/formats")
      .then((res) => res.json())
      .then((data) => setFormats(data.formats || []))
      .catch((error) => console.error("Error fetching formats:", error));
  }, []);

  const togglePersona = (id: number) => {
    setFormData((prev) => ({
      ...prev,
      personaIds: prev.personaIds.includes(id)
        ? prev.personaIds.filter((p) => p !== id)
        : [...prev.personaIds, id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          provider,
          countRequested: parseInt(formData.countRequested),
          personaIds: formData.personaIds,
          formatId: parseInt(formData.formatId),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create batch");
      }

      const batch = await res.json();
      router.push(`/scripts/${batch.id}`);
    } catch (error) {
      console.error("Error creating batch:", error);
      alert(error instanceof Error ? error.message : "Failed to create batch");
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const models = MODELS[newProvider as keyof typeof MODELS];
    setFormData({ ...formData, model: models[0] });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button asChild variant="outline" size="sm">
          <Link href="/scripts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Scripts
          </Link>
        </Button>
        <h1 className="text-3xl font-bold mt-4">Create New Batch</h1>
        <p className="text-sm text-muted-foreground mt-1">Start a new script generation batch</p>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Batch Configuration</CardTitle>
          <CardDescription>Configure your script generation parameters</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Provider & Model */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="provider">Provider</Label>
                <Select value={provider} onValueChange={handleProviderChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Select value={formData.model} onValueChange={(m) => setFormData({ ...formData, model: m })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS[provider as keyof typeof MODELS]?.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Count & Format */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="count">Number of Scripts</Label>
                <Input
                  id="count"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.countRequested}
                  onChange={(e) => setFormData({ ...formData, countRequested: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="format">Format</Label>
                <Select value={formData.formatId} onValueChange={(f) => setFormData({ ...formData, formatId: f })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formats.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.name} ({f.length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Personas */}
            <div className="space-y-2">
              <Label>Avatars (leave empty for all active)</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 rounded-lg border p-3 max-h-56 overflow-y-auto">
                {personas.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.personaIds.includes(p.id)}
                      onChange={() => togglePersona(p.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="truncate">{p.emoji} {p.name}</span>
                  </label>
                ))}
                {personas.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-full">Loading avatars…</p>
                )}
              </div>
            </div>

            {/* Situation */}
            <div className="space-y-2">
              <Label htmlFor="situation">Situation / Brief (Optional)</Label>
              <Textarea
                id="situation"
                placeholder="Describe the situation, context, or any special instructions for this batch..."
                value={formData.situation}
                onChange={(e) => setFormData({ ...formData, situation: e.target.value })}
                rows={4}
              />
            </div>

            {/* Submit */}
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button type="button" variant="outline" asChild>
                <Link href="/scripts">Cancel</Link>
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Creating..." : "Create Batch"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="bg-muted/50 border-0">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            After creation, you'll be able to review and edit scripts before generating videos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
