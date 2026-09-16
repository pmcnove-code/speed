"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Plus, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { apiJson } from "@/lib/api-client";
import { BackgroundUploadDialog } from "./background-upload-dialog";
import { SubtitleStyleEditor } from "./subtitle-style-editor";
import { SubtitleStylePreviewTile } from "./subtitle-style-preview-tile";

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

interface Props {
  avatar: Avatar;
  onUpdate: () => void;
}

export function AvatarCard({ avatar, onUpdate }: Props) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(avatar.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [showBackgroundUpload, setShowBackgroundUpload] = useState(false);
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [editingStyle, setEditingStyle] = useState<SubtitleStyle | null>(null);
  const [showPresetChooser, setShowPresetChooser] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleSaveName = async () => {
    if (editedName.trim() === avatar.name) {
      setIsEditingName(false);
      return;
    }

    if (!editedName.trim()) {
      toast.error("Name cannot be empty");
      setEditedName(avatar.name);
      return;
    }

    setIsSavingName(true);
    try {
      await apiJson(`/api/avatars/${avatar.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editedName.trim() }),
        headers: { "Content-Type": "application/json" },
      });
      toast.success("Name updated");
      setIsEditingName(false);
      onUpdate();
    } catch (error) {
      toast.error("Failed to update name");
      setEditedName(avatar.name);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleToggleActive = async () => {
    try {
      await apiJson(`/api/avatars/${avatar.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !avatar.active }),
        headers: { "Content-Type": "application/json" },
      });
      toast.success(avatar.active ? "Deactivated" : "Activated");
      onUpdate();
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleDeleteBackground = async (bgId: number) => {
    if (!window.confirm("Delete this background?")) return;

    try {
      await apiJson(`/api/avatars/${avatar.id}/backgrounds/${bgId}`, {
        method: "DELETE",
      });
      toast.success("Background deleted");
      onUpdate();
    } catch (error) {
      toast.error("Failed to delete background");
    }
  };

  const handleSelectBackground = async (bgId: number) => {
    try {
      await apiJson(`/api/avatars/${avatar.id}/backgrounds/${bgId}`, {
        method: "PATCH",
        body: JSON.stringify({ selected: true }),
        headers: { "Content-Type": "application/json" },
      });
      toast.success("Background selected");
      onUpdate();
    } catch (error) {
      toast.error("Failed to select background");
    }
  };

  const handleDeleteStyle = async (styleId: number) => {
    if (!window.confirm("Delete this subtitle style?")) return;

    try {
      await apiJson(`/api/avatars/${avatar.id}/subtitle-styles/${styleId}`, {
        method: "DELETE",
      });
      toast.success("Style deleted");
      onUpdate();
    } catch (error) {
      toast.error("Failed to delete style");
    }
  };

  const handleSelectStyle = async (styleId: number) => {
    try {
      await apiJson(`/api/avatars/${avatar.id}/subtitle-styles/${styleId}`, {
        method: "PATCH",
        body: JSON.stringify({ selected: true }),
        headers: { "Content-Type": "application/json" },
      });
      toast.success("Style selected");
      onUpdate();
    } catch (error) {
      toast.error("Failed to select style");
    }
  };

  const handleSaveStyle = async (name: string, config: unknown) => {
    try {
      const isNew = !editingStyle;
      if (isNew) {
        await apiJson(`/api/avatars/${avatar.id}/subtitle-styles`, {
          method: "POST",
          body: JSON.stringify({ name, config }),
          headers: { "Content-Type": "application/json" },
        });
        toast.success("Style created");
      } else {
        await apiJson(`/api/avatars/${avatar.id}/subtitle-styles/${editingStyle.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, config }),
          headers: { "Content-Type": "application/json" },
        });
        toast.success("Style updated");
      }
      setShowStyleEditor(false);
      setEditingStyle(null);
      onUpdate();
    } catch (error) {
      toast.error(editingStyle ? "Failed to update style" : "Failed to create style");
    }
  };

  return (
    <Card>
      <CardHeader className="border-b pb-6">
        <div className="flex gap-6">
          {/* Avatar Photo */}
          <div className="flex-shrink-0">
            {avatar.hasPhoto ? (
              <div className="relative w-40 h-40 rounded-lg overflow-hidden bg-muted">
                <Image
                  src={`/api/avatars/${avatar.id}/photo`}
                  alt={avatar.name}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-40 h-40 rounded-lg bg-gradient-to-br from-slate-300 to-slate-500 flex items-center justify-center text-white text-5xl font-bold">
                {avatar.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name and Controls */}
          <div className="flex-1 space-y-4">
            {/* Name editing */}
            <div className="flex items-center gap-2 mb-4">
              {isEditingName ? (
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <Input
                    ref={nameInputRef}
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") {
                        setEditedName(avatar.name);
                        setIsEditingName(false);
                      }
                    }}
                    disabled={isSavingName}
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSaveName}
                    disabled={isSavingName}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditedName(avatar.name);
                      setIsEditingName(false);
                    }}
                    disabled={isSavingName}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-bold">{avatar.name}</h3>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsEditingName(true)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Subtitle and Active Switch */}
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {avatar.backgrounds.length} backgrounds · {avatar.subtitleStyles.length} subtitle styles
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm font-medium">Active</span>
                <Switch checked={avatar.active} onCheckedChange={handleToggleActive} />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* Backgrounds Section */}
        <div>
          <h4 className="text-lg font-semibold mb-3">Backgrounds</h4>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-4">
            {avatar.backgrounds.map((bg) => (
              <div key={bg.id} className="relative group">
                <div
                  className={`w-24 h-24 rounded-lg bg-muted relative overflow-hidden cursor-pointer transition-transform hover:scale-105 ${
                    bg.selected ? "ring-2 ring-orange-500" : ""
                  }`}
                  onClick={() => handleSelectBackground(bg.id)}
                >
                  <Image
                    src={`/api/avatars/${avatar.id}/backgrounds/${bg.id}/image`}
                    alt={bg.label}
                    fill
                    className="object-cover"
                  />
                </div>
                <p className="text-xs text-center mt-2 truncate">{bg.label}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                  onClick={() => handleDeleteBackground(bg.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}

            {/* Add Background Tile */}
            <button
              onClick={() => setShowBackgroundUpload(true)}
              className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/50 flex items-center justify-center hover:border-muted-foreground transition-colors"
            >
              <Plus className="h-6 w-6 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Subtitle Styles Section */}
        <div>
          <h4 className="text-lg font-semibold mb-3">Subtitle Styles</h4>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-4">
            {avatar.subtitleStyles.map((style) => (
              <div
                key={style.id}
                className="relative group cursor-pointer"
                onClick={() => {
                  setEditingStyle(style);
                  setShowStyleEditor(true);
                }}
              >
                <SubtitleStylePreviewTile
                  config={style.config}
                  isSelected={style.selected}
                  onSelect={() => handleSelectStyle(style.id)}
                />
                <p className="text-xs text-center mt-2 truncate">{style.name}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteStyle(style.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}

            {/* Add Style Tile */}
            <button
              onClick={() => {
                setEditingStyle(null);
                setShowStyleEditor(true);
                setShowPresetChooser(true);
              }}
              aria-label="Add subtitle style"
              className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/50 flex items-center justify-center hover:border-muted-foreground transition-colors"
            >
              <Plus className="h-6 w-6 text-muted-foreground" />
            </button>
          </div>
        </div>
      </CardContent>

      {/* Dialogs */}
      <BackgroundUploadDialog
        open={showBackgroundUpload}
        onOpenChange={setShowBackgroundUpload}
        avatarId={avatar.id}
        onSuccess={onUpdate}
      />

      <SubtitleStyleEditor
        open={showStyleEditor}
        onOpenChange={setShowStyleEditor}
        initialStyle={editingStyle}
        onSave={handleSaveStyle}
        showPresetChooser={showPresetChooser}
        onPresetChooserChange={setShowPresetChooser}
      />
    </Card>
  );
}
