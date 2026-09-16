"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiJson } from "@/lib/api-client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avatarId: number;
  onSuccess: () => void;
}

export function BackgroundUploadDialog({ open, onOpenChange, avatarId, onSuccess }: Props) {
  const [label, setLabel] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max ~6MB
    if (file.size > 6 * 1024 * 1024) {
      toast.error("File too large", { description: "Maximum 6MB" });
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Invalid file type", { description: "Please select an image" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setDataUrl(event.target?.result as string);
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }

    if (!dataUrl) {
      toast.error("Image is required");
      return;
    }

    setIsLoading(true);
    try {
      await apiJson(`/api/avatars/${avatarId}/backgrounds`, {
        method: "POST",
        body: JSON.stringify({ label: label.trim(), dataUrl }),
        headers: { "Content-Type": "application/json" },
      });

      toast.success("Background added");
      setLabel("");
      setDataUrl(null);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error("Failed to upload background");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setLabel("");
      setDataUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Background</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Beach, Office"
              disabled={isLoading}
            />
          </div>

          <div>
            <Label htmlFor="image">Image</Label>
            <Input
              id="image"
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              ref={fileInputRef}
              disabled={isLoading}
            />
            {dataUrl && (
              <div className="mt-3 relative w-full h-32 rounded-lg bg-muted overflow-hidden">
                <img
                  src={dataUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !label.trim() || !dataUrl}>
            {isLoading ? "Uploading..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
