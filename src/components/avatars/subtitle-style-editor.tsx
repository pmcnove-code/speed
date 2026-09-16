"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { normalizeSubtitleStyle, SUBTITLE_FONTS, defaultSubtitleStyle, subtitleStylePresets, type SubtitleStyleConfig } from "../../../shared/flow/subtitle-style.mjs";
import { SubtitleStylePreviewTile } from "./subtitle-style-preview-tile";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStyle: { id: number; name: string; config: unknown } | null;
  onSave: (name: string, config: unknown) => void;
  showPresetChooser: boolean;
  onPresetChooserChange: (show: boolean) => void;
}

const presets = subtitleStylePresets();
const presetNames = ["classic", "dynamic", "minimal", "elegant"] as const;

export function SubtitleStyleEditor({
  open,
  onOpenChange,
  initialStyle,
  onSave,
  showPresetChooser,
  onPresetChooserChange,
}: Props) {
  const [name, setName] = useState("");
  const [config, setConfig] = useState<SubtitleStyleConfig>(defaultSubtitleStyle());
  const [isSaving, setIsSaving] = useState(false);

  const normalizedConfig = useMemo(() => normalizeSubtitleStyle(config) as SubtitleStyleConfig, [config]);

  useEffect(() => {
    if (initialStyle) {
      setName(initialStyle.name);
      const normalized = normalizeSubtitleStyle(initialStyle.config) as SubtitleStyleConfig;
      setConfig(normalized);
    } else {
      setName("");
      setConfig(defaultSubtitleStyle());
    }
  }, [initialStyle, open]);

  const handleSelectPreset = (presetName: typeof presetNames[number]) => {
    const preset = presets[presetName];
    const normalized = normalizeSubtitleStyle(preset) as SubtitleStyleConfig;
    setConfig(normalized);
    setName(presetName.charAt(0).toUpperCase() + presetName.slice(1));
    onPresetChooserChange(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsSaving(true);
    try {
      await onSave(name.trim(), normalizedConfig);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      setName("");
      setConfig(defaultSubtitleStyle());
    }
  };

  return (
    <>
      {/* Preset Chooser Dialog */}
      <Dialog open={showPresetChooser} onOpenChange={onPresetChooserChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose a Preset</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-4 gap-4 p-4">
            {presetNames.map((presetName) => (
              <button
                key={presetName}
                onClick={() => handleSelectPreset(presetName)}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <SubtitleStylePreviewTile
                  config={presets[presetName]}
                />
                <span className="text-sm font-medium capitalize">{presetName}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Main Editor Dialog */}
      <Dialog open={open && !showPresetChooser} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{initialStyle ? "Edit" : "Create"} Subtitle Style</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-[1fr_1.2fr] gap-6">
            {/* Preview */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-full aspect-[9/16] overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 rounded-lg">
                <div
                  style={{
                    position: "absolute",
                    top: `${normalizedConfig.position.vertical}%`,
                    transform: "translateY(-50%)",
                    left: 0,
                    right: 0,
                    textAlign: normalizedConfig.position.align,
                    paddingLeft: `${Math.round(normalizedConfig.position.marginH / 6)}px`,
                    paddingRight: `${Math.round(normalizedConfig.position.marginH / 6)}px`,
                  }}
                >
                  <SubtitlePreview config={normalizedConfig} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Live preview</p>
            </div>

            {/* Controls */}
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSaving}
                  placeholder="e.g., Subtle, Bold"
                />
              </div>

              <Tabs defaultValue="text" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="text">Text</TabsTrigger>
                  <TabsTrigger value="colors">Colors</TabsTrigger>
                  <TabsTrigger value="position">Position</TabsTrigger>
                  <TabsTrigger value="behavior">Behavior</TabsTrigger>
                </TabsList>

                {/* Text Tab */}
                <TabsContent value="text" className="space-y-4">
                  <div>
                    <Label>Font Family</Label>
                    <Select value={config.font.family} onValueChange={(value) => setConfig({ ...config, font: { ...config.font, family: value } })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBTITLE_FONTS.map((font) => (
                          <SelectItem key={font} value={font}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Size</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="24"
                        max="96"
                        step="2"
                        value={config.font.size}
                        onChange={(e) => setConfig({ ...config, font: { ...config.font, size: Number(e.target.value) } })}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">{config.font.size}px</span>
                    </div>
                  </div>

                  <div>
                    <Label>Weight</Label>
                    <Select value={config.font.weight.toString()} onValueChange={(value) => setConfig({ ...config, font: { ...config.font, weight: Number(value) as 400 | 700 | 900 } })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="400">Regular</SelectItem>
                        <SelectItem value="700">Bold</SelectItem>
                        <SelectItem value="900">Black</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={config.font.italic}
                        onCheckedChange={(checked) => setConfig({ ...config, font: { ...config.font, italic: checked } })}
                      />
                      <Label className="cursor-pointer">Italic</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={config.font.uppercase}
                        onCheckedChange={(checked) => setConfig({ ...config, font: { ...config.font, uppercase: checked } })}
                      />
                      <Label className="cursor-pointer">Uppercase</Label>
                    </div>
                  </div>

                  <div>
                    <Label>Letter Spacing</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="12"
                        step="0.1"
                        value={config.font.letterSpacing}
                        onChange={(e) => setConfig({ ...config, font: { ...config.font, letterSpacing: Number(e.target.value) } })}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">{config.font.letterSpacing.toFixed(1)}</span>
                    </div>
                  </div>
                </TabsContent>

                {/* Colors Tab */}
                <TabsContent value="colors" className="space-y-4">
                  <div>
                    <Label>Fill Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.fill.color}
                        onChange={(e) => setConfig({ ...config, fill: { ...config.fill, color: e.target.value } })}
                        className="w-12 h-9 rounded cursor-pointer"
                      />
                      <span className="text-sm font-mono text-muted-foreground">{config.fill.color}</span>
                    </div>
                  </div>

                  <div>
                    <Label>Stroke Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.stroke.color}
                        onChange={(e) => setConfig({ ...config, stroke: { ...config.stroke, color: e.target.value } })}
                        className="w-12 h-9 rounded cursor-pointer"
                      />
                      <span className="text-sm font-mono text-muted-foreground">{config.stroke.color}</span>
                    </div>
                  </div>

                  <div>
                    <Label>Stroke Width</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="8"
                        step="0.1"
                        value={config.stroke.width}
                        onChange={(e) => setConfig({ ...config, stroke: { ...config.stroke, width: Number(e.target.value) } })}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">{config.stroke.width.toFixed(1)}</span>
                    </div>
                  </div>

                  <div>
                    <Label>Shadow Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.shadow.color}
                        onChange={(e) => setConfig({ ...config, shadow: { ...config.shadow, color: e.target.value } })}
                        className="w-12 h-9 rounded cursor-pointer"
                      />
                      <span className="text-sm font-mono text-muted-foreground">{config.shadow.color}</span>
                    </div>
                  </div>

                  <div>
                    <Label>Shadow Depth</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="8"
                        step="0.1"
                        value={config.shadow.depth}
                        onChange={(e) => setConfig({ ...config, shadow: { ...config.shadow, depth: Number(e.target.value) } })}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">{config.shadow.depth.toFixed(1)}</span>
                    </div>
                  </div>

                  <div>
                    <Label>Shadow Opacity</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={config.shadow.opacity}
                        onChange={(e) => setConfig({ ...config, shadow: { ...config.shadow, opacity: Number(e.target.value) } })}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">{config.shadow.opacity.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Switch
                        checked={config.background.enabled}
                        onCheckedChange={(checked) => setConfig({ ...config, background: { ...config.background, enabled: checked } })}
                      />
                      <Label className="cursor-pointer">Background Box</Label>
                    </div>

                    {config.background.enabled && (
                      <>
                        <div>
                          <Label>Background Color</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={config.background.color}
                              onChange={(e) => setConfig({ ...config, background: { ...config.background, color: e.target.value } })}
                              className="w-12 h-9 rounded cursor-pointer"
                            />
                            <span className="text-sm font-mono text-muted-foreground">{config.background.color}</span>
                          </div>
                        </div>

                        <div className="mt-2">
                          <Label>Background Opacity</Label>
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={config.background.opacity}
                              onChange={(e) => setConfig({ ...config, background: { ...config.background, opacity: Number(e.target.value) } })}
                              className="flex-1"
                            />
                            <span className="text-sm font-medium w-12 text-right">{config.background.opacity.toFixed(2)}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>

                {/* Position Tab */}
                <TabsContent value="position" className="space-y-4">
                  <div>
                    <Label>Vertical Position</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="4"
                        max="96"
                        step="2"
                        value={config.position.vertical}
                        onChange={(e) => setConfig({ ...config, position: { ...config.position, vertical: Number(e.target.value) } })}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">{config.position.vertical}%</span>
                    </div>
                  </div>

                  <div>
                    <Label>Horizontal Alignment</Label>
                    <div className="flex gap-2">
                      {(["left", "center", "right"] as const).map((align) => (
                        <Button
                          key={align}
                          variant={config.position.align === align ? "default" : "outline"}
                          size="sm"
                          onClick={() => setConfig({ ...config, position: { ...config.position, align } })}
                          className="flex-1"
                        >
                          {align.charAt(0).toUpperCase() + align.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>Side Margins</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="320"
                        step="5"
                        value={config.position.marginH}
                        onChange={(e) => setConfig({ ...config, position: { ...config.position, marginH: Number(e.target.value) } })}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-16 text-right">{config.position.marginH}px</span>
                    </div>
                  </div>
                </TabsContent>

                {/* Behavior Tab */}
                <TabsContent value="behavior" className="space-y-4">
                  <div>
                    <Label>Words per Line</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="8"
                        step="1"
                        value={config.behavior.wordsPerLine}
                        onChange={(e) => setConfig({ ...config, behavior: { ...config.behavior, wordsPerLine: Number(e.target.value) } })}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">{config.behavior.wordsPerLine}</span>
                    </div>
                  </div>

                  <div>
                    <Label>Animation</Label>
                    <Select value={config.behavior.animation} onValueChange={(value) => setConfig({ ...config, behavior: { ...config.behavior, animation: value as "none" | "fade" | "pop" | "karaoke" } })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="fade">Fade</SelectItem>
                        <SelectItem value="pop">Pop</SelectItem>
                        <SelectItem value="karaoke">Karaoke</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {config.behavior.animation === "karaoke" && (
                    <div>
                      <Label>Highlight Color</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={config.behavior.highlightColor}
                          onChange={(e) => setConfig({ ...config, behavior: { ...config.behavior, highlightColor: e.target.value } })}
                          className="w-12 h-9 rounded cursor-pointer"
                        />
                        <span className="text-sm font-mono text-muted-foreground">{config.behavior.highlightColor}</span>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SubtitlePreview({ config, scale = 0.16 }: { config: SubtitleStyleConfig; scale?: number }) {
  const fonts = ["Liberation Sans", "DejaVu Sans", "Liberation Serif", "DejaVu Serif", "Liberation Mono"];
  const fontFamily = fonts.includes(config.font.family) ? config.font.family : "Liberation Sans";

  const sampleText = "Your text here";
  const words = sampleText.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + (currentLine ? " " : "") + word).split(" ").length > config.behavior.wordsPerLine) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += (currentLine ? " " : "") + word;
    }
  }
  if (currentLine) lines.push(currentLine);

  const styles: React.CSSProperties = {
    fontFamily,
    fontSize: `${Math.max(8, Math.round(config.font.size * scale))}px`,
    fontWeight: config.font.weight,
    fontStyle: config.font.italic ? "italic" : "normal",
    textTransform: config.font.uppercase ? "uppercase" : "none",
    letterSpacing: `${config.font.letterSpacing * scale}px`,
    color: config.fill.color,
    lineHeight: "1.2",
  };

  if (config.stroke.width > 0) {
    styles.WebkitTextStroke = `${Math.max(0.5, config.stroke.width * scale * 2)}px ${config.stroke.color}`;
  }

  if (config.shadow.depth > 0) {
    const alpha = Math.round(config.shadow.opacity * 255)
      .toString(16)
      .padStart(2, "0");
    const shadowColor = `${config.shadow.color}${alpha}`;
    styles.textShadow = `0 ${config.shadow.depth}px ${config.shadow.depth * 2}px ${shadowColor}`;
  }

  if (config.background.enabled) {
    const bgAlpha = Math.round(config.background.opacity * 255)
      .toString(16)
      .padStart(2, "0");
    const bgColor = `${config.background.color}${bgAlpha}`;
    styles.backgroundColor = bgColor;
    styles.padding = "8px 12px";
    styles.borderRadius = "4px";
    styles.display = "inline-block";
  }

  return (
    <div style={styles}>
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}
