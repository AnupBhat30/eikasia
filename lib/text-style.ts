import type { FontFamilyKey, ShadowPreset, TextLayer } from "@/components/editor/types";
import { fromPercentage } from "@/lib/utils";

export interface TextShadowStyle {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

const FONT_STACKS: Record<FontFamilyKey, string> = {
  sans: 'Inter, "Helvetica Neue", Arial, sans-serif',
  mono: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  display: '"Playfair Display", "Iowan Old Style", "Times New Roman", serif',
  serif: '"Cormorant Garamond", Baskerville, Georgia, serif',
};

export function resolveTextFontFamily(fontFamily: FontFamilyKey | string) {
  switch (fontFamily) {
    case "display":
      return FONT_STACKS.display;
    case "serif":
      return FONT_STACKS.serif;
    case "mono":
      return FONT_STACKS.mono;
    case "sans":
    default:
      return FONT_STACKS.sans;
  }
}

export function getTextShadowStyle(
  preset: ShadowPreset,
  color: string,
): TextShadowStyle | null {
  switch (preset) {
    case "soft":
      return {
        color: "rgba(0,0,0,0.68)",
        blur: 28,
        offsetX: 0,
        offsetY: 2,
      };
    case "hard":
      return {
        color: "rgba(0,0,0,0.92)",
        blur: 3,
        offsetX: 2,
        offsetY: 3,
      };
    case "neon":
      return {
        color,
        blur: 52,
        offsetX: 0,
        offsetY: 0,
      };
    case "none":
    default:
      return null;
  }
}

export interface FabricTextboxOptions {
  left: number;
  top: number;
  originX: "center";
  originY: "center";
  scaleX: number;
  scaleY: number;
  width: number;
  fontSize: number;
  text: string;
  fontFamily: string;
  fill: string;
  opacity: number;
  charSpacing: number;
  lineHeight: number;
  textAlign: string;
  fontStyle: string;
  fontWeight: string;
  backgroundColor: string | undefined;
}

export function getFabricTextboxOptions(
  layer: TextLayer,
  canvasWidth: number,
  canvasHeight: number,
): FabricTextboxOptions {
  const baseSize = canvasHeight;
  const fontSize = fromPercentage(layer.fontSizePct, baseSize);

  return {
    left: fromPercentage(layer.xPct, canvasWidth),
    top: fromPercentage(layer.yPct, canvasHeight),
    originX: "center",
    originY: "center",
    scaleX: 1,
    scaleY: 1,
    width: fromPercentage(layer.widthPct, canvasWidth),
    fontSize,
    text: layer.text,
    fontFamily: resolveTextFontFamily(layer.fontFamily),
    fill: layer.color,
    opacity: layer.opacity,
    charSpacing: layer.letterSpacing,
    lineHeight: layer.lineHeight,
    textAlign: layer.textAlign,
    fontStyle: layer.fontStyle,
    fontWeight: layer.fontWeight,
    backgroundColor: layer.backgroundColor ?? undefined,
  };
}

export function getScaledTextShadowOptions(
  preset: ShadowPreset,
  color: string,
  scaleFactor: number = 1,
): TextShadowStyle | null {
  const shadow = getTextShadowStyle(preset, color);
  if (!shadow) {
    return null;
  }

  return {
    color: shadow.color,
    blur: shadow.blur * scaleFactor,
    offsetX: shadow.offsetX * scaleFactor,
    offsetY: shadow.offsetY * scaleFactor,
  };
}
