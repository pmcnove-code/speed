"use client";

import { useMemo } from "react";
import { normalizeSubtitleStyle } from "../../../shared/flow/subtitle-style.mjs";

interface Props {
  config: unknown;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function SubtitleStylePreviewTile({ config, isSelected, onSelect }: Props) {
  const style = useMemo(() => {
    return normalizeSubtitleStyle(config);
  }, [config]);

  const getTextStyles = () => {
    const fonts = ["Liberation Sans", "DejaVu Sans", "Liberation Serif", "DejaVu Serif", "Liberation Mono"];
    const fontFamily = fonts.includes(style.font.family)
      ? style.font.family
      : "Liberation Sans";

    let styles: React.CSSProperties = {
      fontFamily,
      fontSize: `${Math.max(8, Math.min(12, style.font.size / 8))}px`,
      fontWeight: style.font.weight as React.CSSProperties["fontWeight"],
      fontStyle: style.font.italic ? "italic" : "normal",
      textTransform: style.font.uppercase ? "uppercase" : "none",
      letterSpacing: `${style.font.letterSpacing / 20}px`,
      color: style.fill.color,
      lineHeight: "1.2",
    };

    if (style.stroke.width > 0) {
      // WebkitTextStroke for stroke effect
      styles.WebkitTextStroke = `${Math.max(0.2, style.stroke.width / 10)}px ${style.stroke.color}`;
    }

    if (style.shadow.depth > 0) {
      const shadowSize = Math.max(1, style.shadow.depth);
      const alpha = Math.round(style.shadow.opacity * 255)
        .toString(16)
        .padStart(2, "0");
      const shadowColor = `${style.shadow.color}${alpha}`;
      styles.textShadow = `0 ${shadowSize}px ${shadowSize * 2}px ${shadowColor}`;
    }

    if (style.background.enabled) {
      const bgAlpha = Math.round(style.background.opacity * 255)
        .toString(16)
        .padStart(2, "0");
      const bgColor = `${style.background.color}${bgAlpha}`;
      styles.backgroundColor = bgColor;
      styles.padding = "2px 4px";
      styles.borderRadius = "2px";
      styles.display = "inline-block";
    }

    return styles;
  };

  return (
    <div
      className={`w-24 h-24 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center p-2 cursor-pointer transition-all hover:ring-2 hover:ring-offset-2 hover:ring-slate-500 ${
        isSelected ? "ring-2 ring-orange-500 ring-offset-2" : ""
      }`}
      onClick={onSelect}
    >
      <div className="text-center overflow-hidden">
        <div style={getTextStyles()} className="truncate text-nowrap">
          Your text
        </div>
      </div>
    </div>
  );
}
