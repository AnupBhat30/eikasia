import type { FontFamilyKey, ShadowPreset } from "@/components/editor/types";

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
