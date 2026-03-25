import type {
  AcrosChannel,
  AdjustmentGroupDefinition,
  Adjustments,
  AspectRatioPreset,
  BlendMode,
  CropState,
  FontFamilyKey,
  LookDefinition,
  LookPreset,
  OverlayPresetDefinition,
  ProjectState,
  ShadowPreset,
  TextPresetDefinition,
} from "@/components/editor/types";
import { getLookRenderRecipe } from "@/lib/look-style";

export const MAX_HISTORY = 50;
export const DEFAULT_LOOK_ID: string | null = null;

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 5500,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  clarity: 0,
  texture: 0,
  sharpness: 0,
  noiseReduction: 0,
  grainAmount: 0,
  grainSize: 40,
  vignetteAmount: 0,
  vignetteFeather: 60,
  halation: 0,
  fade: 0,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const DEFAULT_LOOK_GRAIN_AMOUNT_CAP = 18;
const DEFAULT_LOOK_GRAIN_SIZE_MIN = 24;
const DEFAULT_LOOK_GRAIN_SIZE_MAX = 42;
const DEFAULT_LOOK_GRAIN_OPACITY_CAP = 0.2;
const DEFAULT_LOOK_GRAIN_INTENSITY_CAP = 34;

export const DEFAULT_CROP: CropState = {
  presetId: "free",
  rotation: 0,
  flipX: false,
  flipY: false,
  perspective: {
    tl: { x: 0, y: 0 },
    tr: { x: 100, y: 0 },
    br: { x: 100, y: 100 },
    bl: { x: 0, y: 100 },
  },
};

const LOOK_PRESETS: Record<string, LookPreset> = {
  "provia-standard": {
    filterIntensity: 88,
    adjustments: {
      exposure: 2,
      highlights: -8,
      shadows: 5,
      whites: 4,
      blacks: 2,
      temperature: 5600,
      tint: 1,
      vibrance: 4,
      saturation: 2,
      clarity: 3,
      sharpness: 18,
      fade: 0,
      vignetteAmount: -8,
      vignetteFeather: 65,
      grainAmount: 16,
      grainSize: 26,
    },
    grain: { intensity: 24, size: 26, opacity: 0.16, blendMode: "soft-light" },
  },
  velvia: {
    filterIntensity: 92,
    adjustments: {
      exposure: 0,
      highlights: -12,
      shadows: -18,
      whites: 8,
      blacks: -22,
      temperature: 5300,
      tint: -4,
      vibrance: 28,
      saturation: 18,
      clarity: 14,
      sharpness: 22,
      fade: 0,
      vignetteAmount: -22,
      vignetteFeather: 55,
      grainAmount: 12,
      grainSize: 20,
    },
    grain: { intensity: 18, size: 20, opacity: 0.12, blendMode: "soft-light" },
  },
  "astia-soft": {
    filterIntensity: 78,
    adjustments: {
      exposure: 4,
      highlights: -22,
      shadows: 14,
      whites: -6,
      blacks: 10,
      temperature: 5700,
      tint: 5,
      vibrance: -6,
      saturation: -8,
      clarity: -10,
      sharpness: 12,
      fade: 5,
      vignetteAmount: -10,
      vignetteFeather: 70,
      grainAmount: 14,
      grainSize: 24,
    },
    grain: { intensity: 20, size: 24, opacity: 0.14, blendMode: "soft-light" },
  },
  "classic-chrome": {
    filterIntensity: 85,
    adjustments: {
      exposure: -3,
      highlights: -24,
      shadows: -8,
      whites: -10,
      blacks: 8,
      temperature: 5100,
      tint: -6,
      vibrance: -10,
      saturation: -16,
      clarity: 6,
      sharpness: 16,
      fade: 14,
      vignetteAmount: -20,
      vignetteFeather: 60,
      grainAmount: 28,
      grainSize: 34,
    },
    grain: { intensity: 32, size: 34, opacity: 0.22, blendMode: "soft-light" },
  },
  "classic-negative": {
    filterIntensity: 90,
    adjustments: {
      exposure: 2,
      highlights: -18,
      shadows: -24,
      whites: 6,
      blacks: -28,
      temperature: 5400,
      tint: -2,
      vibrance: -6,
      saturation: -12,
      clarity: 16,
      sharpness: 20,
      fade: 6,
      halation: 8,
      vignetteAmount: -28,
      vignetteFeather: 50,
      grainAmount: 36,
      grainSize: 40,
    },
    grain: { intensity: 40, size: 40, opacity: 0.28, blendMode: "overlay" },
  },
  "eterna-cinema": {
    filterIntensity: 80,
    adjustments: {
      exposure: 2,
      highlights: -32,
      shadows: 18,
      whites: -14,
      blacks: 16,
      temperature: 5500,
      tint: 0,
      vibrance: -14,
      saturation: -22,
      clarity: 0,
      sharpness: 10,
      fade: 18,
      vignetteAmount: -6,
      vignetteFeather: 72,
      grainAmount: 22,
      grainSize: 32,
    },
    grain: { intensity: 26, size: 32, opacity: 0.18, blendMode: "soft-light" },
  },
  "eterna-bleach-bypass": {
    filterIntensity: 94,
    adjustments: {
      exposure: -2,
      highlights: -6,
      shadows: -30,
      whites: 14,
      blacks: -34,
      temperature: 5500,
      tint: 0,
      vibrance: -30,
      saturation: -40,
      clarity: 20,
      sharpness: 24,
      fade: 0,
      vignetteAmount: -30,
      vignetteFeather: 48,
      grainAmount: 52,
      grainSize: 52,
    },
    grain: { intensity: 58, size: 52, opacity: 0.38, blendMode: "overlay" },
  },
  acros: {
    filterIntensity: 100,
    adjustments: {
      exposure: 0,
      highlights: -10,
      shadows: -14,
      whites: 8,
      blacks: -18,
      temperature: 5500,
      tint: 0,
      vibrance: 0,
      saturation: -100,
      clarity: 12,
      sharpness: 24,
      fade: 0,
      vignetteAmount: -24,
      vignetteFeather: 55,
      grainAmount: 30,
      grainSize: 28,
    },
    grain: { intensity: 34, size: 28, opacity: 0.22, blendMode: "soft-light" },
  },
  "nostalgic-negative": {
    filterIntensity: 82,
    adjustments: {
      exposure: 5,
      highlights: -14,
      shadows: 22,
      whites: -4,
      blacks: 18,
      temperature: 6200,
      tint: 8,
      vibrance: -4,
      saturation: -8,
      clarity: -6,
      sharpness: 10,
      fade: 20,
      halation: 12,
      vignetteAmount: -18,
      vignetteFeather: 68,
      grainAmount: 38,
      grainSize: 44,
    },
    grain: { intensity: 42, size: 44, opacity: 0.28, blendMode: "soft-light" },
  },
  "reala-ace": {
    filterIntensity: 84,
    adjustments: {
      exposure: 1,
      highlights: -6,
      shadows: 4,
      whites: 2,
      blacks: 4,
      temperature: 5600,
      tint: 2,
      vibrance: 2,
      saturation: 0,
      clarity: 2,
      sharpness: 16,
      fade: 2,
      vignetteAmount: -8,
      vignetteFeather: 68,
      grainAmount: 14,
      grainSize: 22,
    },
    grain: { intensity: 18, size: 22, opacity: 0.14, blendMode: "soft-light" },
  },
  "portra-400": {
    filterIntensity: 82,
    adjustments: {
      exposure: 3,
      highlights: -16,
      shadows: 20,
      whites: -4,
      blacks: 14,
      temperature: 5800,
      tint: 6,
      vibrance: -2,
      saturation: -4,
      clarity: -4,
      sharpness: 12,
      fade: 10,
      vignetteAmount: -10,
      vignetteFeather: 70,
      grainAmount: 20,
      grainSize: 28,
    },
    grain: { intensity: 28, size: 30, opacity: 0.2, blendMode: "soft-light" },
  },
  "portra-160": {
    filterIntensity: 78,
    adjustments: {
      exposure: 2,
      highlights: -10,
      shadows: 14,
      whites: -2,
      blacks: 10,
      temperature: 5700,
      tint: 4,
      vibrance: -2,
      saturation: -4,
      clarity: -6,
      sharpness: 10,
      fade: 6,
      vignetteAmount: -6,
      vignetteFeather: 74,
      grainAmount: 10,
      grainSize: 18,
    },
    grain: { intensity: 18, size: 22, opacity: 0.14, blendMode: "soft-light" },
  },
  "kodak-gold-200": {
    filterIntensity: 86,
    adjustments: {
      exposure: 3,
      highlights: -10,
      shadows: 6,
      whites: 4,
      blacks: 4,
      temperature: 6400,
      tint: 10,
      vibrance: 8,
      saturation: 8,
      clarity: 4,
      sharpness: 14,
      fade: 6,
      vignetteAmount: -12,
      vignetteFeather: 62,
      grainAmount: 32,
      grainSize: 36,
    },
    grain: { intensity: 38, size: 38, opacity: 0.26, blendMode: "overlay" },
  },
  "ultramax-400": {
    filterIntensity: 88,
    adjustments: {
      exposure: 2,
      highlights: -8,
      shadows: 2,
      whites: 6,
      blacks: -4,
      temperature: 6000,
      tint: 4,
      vibrance: 12,
      saturation: 8,
      clarity: 6,
      sharpness: 16,
      fade: 4,
      vignetteAmount: -14,
      vignetteFeather: 60,
      grainAmount: 34,
      grainSize: 38,
    },
    grain: { intensity: 42, size: 40, opacity: 0.28, blendMode: "overlay" },
  },
  "colorplus-200": {
    filterIntensity: 90,
    adjustments: {
      exposure: 4,
      highlights: -6,
      shadows: 4,
      whites: 8,
      blacks: 2,
      temperature: 6600,
      tint: 12,
      vibrance: 14,
      saturation: 12,
      clarity: 4,
      sharpness: 12,
      fade: 8,
      vignetteAmount: -10,
      vignetteFeather: 64,
      grainAmount: 38,
      grainSize: 40,
    },
    grain: { intensity: 44, size: 40, opacity: 0.28, blendMode: "overlay" },
  },
  "cinestill-800t": {
    filterIntensity: 92,
    adjustments: {
      exposure: 4,
      highlights: -8,
      shadows: -4,
      whites: 10,
      blacks: -6,
      temperature: 6800,
      tint: 14,
      vibrance: 6,
      saturation: 4,
      clarity: 8,
      sharpness: 14,
      fade: 6,
      halation: 36,
      vignetteAmount: -26,
      vignetteFeather: 50,
      grainAmount: 56,
      grainSize: 54,
    },
    grain: { intensity: 58, size: 52, opacity: 0.38, blendMode: "overlay" },
  },
  "fuji-400h": {
    filterIntensity: 78,
    adjustments: {
      exposure: 2,
      highlights: -18,
      shadows: 16,
      whites: -6,
      blacks: 12,
      temperature: 5000,
      tint: -8,
      vibrance: -8,
      saturation: -10,
      clarity: -4,
      sharpness: 12,
      fade: 8,
      vignetteAmount: -8,
      vignetteFeather: 72,
      grainAmount: 16,
      grainSize: 24,
    },
    grain: { intensity: 22, size: 26, opacity: 0.16, blendMode: "soft-light" },
  },
  "fuji-superia-400": {
    filterIntensity: 84,
    adjustments: {
      exposure: 1,
      highlights: -10,
      shadows: 6,
      whites: 2,
      blacks: 4,
      temperature: 5200,
      tint: -4,
      vibrance: -2,
      saturation: -4,
      clarity: 4,
      sharpness: 16,
      fade: 4,
      vignetteAmount: -10,
      vignetteFeather: 66,
      grainAmount: 24,
      grainSize: 30,
    },
    grain: { intensity: 28, size: 30, opacity: 0.18, blendMode: "soft-light" },
  },
  "hp5-plus": {
    filterIntensity: 94,
    adjustments: {
      exposure: 1,
      highlights: -12,
      shadows: -10,
      whites: 8,
      blacks: -14,
      temperature: 5500,
      tint: 0,
      vibrance: 0,
      saturation: -100,
      clarity: 10,
      sharpness: 22,
      fade: 0,
      vignetteAmount: -18,
      vignetteFeather: 56,
      grainAmount: 40,
      grainSize: 34,
    },
    grain: { intensity: 48, size: 36, opacity: 0.3, blendMode: "soft-light" },
  },
  "delta-3200": {
    filterIntensity: 100,
    adjustments: {
      exposure: 0,
      highlights: -4,
      shadows: -22,
      whites: 12,
      blacks: -30,
      temperature: 5500,
      tint: 0,
      vibrance: 0,
      saturation: -100,
      clarity: 18,
      sharpness: 28,
      fade: 0,
      vignetteAmount: -34,
      vignetteFeather: 46,
      grainAmount: 72,
      grainSize: 70,
    },
    grain: { intensity: 78, size: 72, opacity: 0.48, blendMode: "overlay" },
  },
  "kodachrome-64": {
    filterIntensity: 90,
    adjustments: {
      exposure: 2,
      highlights: -10,
      shadows: -8,
      whites: 8,
      blacks: -10,
      temperature: 5800,
      tint: -4,
      vibrance: 14,
      saturation: 12,
      clarity: 8,
      sharpness: 20,
      fade: 0,
      vignetteAmount: -20,
      vignetteFeather: 56,
      grainAmount: 14,
      grainSize: 22,
    },
    grain: { intensity: 18, size: 22, opacity: 0.14, blendMode: "soft-light" },
  },
  "teal-and-orange": {
    filterIntensity: 88,
    adjustments: {
      exposure: 1,
      highlights: -14,
      shadows: -12,
      whites: 6,
      blacks: -16,
      temperature: 5400,
      tint: -6,
      vibrance: 10,
      saturation: 6,
      clarity: 12,
      sharpness: 18,
      fade: 0,
      vignetteAmount: -28,
      vignetteFeather: 52,
      grainAmount: 18,
      grainSize: 28,
    },
    grain: { intensity: 22, size: 28, opacity: 0.16, blendMode: "soft-light" },
  },
  "bleach-bypass": {
    filterIntensity: 94,
    adjustments: {
      exposure: -2,
      highlights: -8,
      shadows: -28,
      whites: 12,
      blacks: -32,
      temperature: 5500,
      tint: 0,
      vibrance: -28,
      saturation: -36,
      clarity: 18,
      sharpness: 22,
      fade: 0,
      vignetteAmount: -28,
      vignetteFeather: 48,
      grainAmount: 48,
      grainSize: 50,
    },
    grain: { intensity: 54, size: 50, opacity: 0.36, blendMode: "overlay" },
  },
  "day-for-night": {
    filterIntensity: 96,
    adjustments: {
      exposure: -28,
      highlights: -24,
      shadows: -18,
      whites: -20,
      blacks: -22,
      temperature: 4200,
      tint: -12,
      vibrance: -14,
      saturation: -20,
      clarity: 6,
      sharpness: 12,
      fade: 0,
      vignetteAmount: -40,
      vignetteFeather: 44,
      grainAmount: 28,
      grainSize: 36,
    },
    grain: { intensity: 32, size: 36, opacity: 0.24, blendMode: "overlay" },
  },
  "cross-process": {
    filterIntensity: 92,
    adjustments: {
      exposure: 2,
      highlights: -6,
      shadows: -16,
      whites: 14,
      blacks: -12,
      temperature: 5400,
      tint: 14,
      vibrance: 18,
      saturation: 16,
      clarity: 10,
      sharpness: 16,
      fade: 0,
      vignetteAmount: -18,
      vignetteFeather: 54,
      grainAmount: 24,
      grainSize: 32,
    },
    grain: { intensity: 28, size: 32, opacity: 0.2, blendMode: "overlay" },
  },
  "matte-film": {
    filterIntensity: 80,
    adjustments: {
      exposure: 3,
      highlights: -22,
      shadows: 16,
      whites: -8,
      blacks: 18,
      temperature: 5600,
      tint: 4,
      vibrance: -8,
      saturation: -12,
      clarity: -4,
      sharpness: 10,
      fade: 16,
      vignetteAmount: -10,
      vignetteFeather: 70,
      grainAmount: 20,
      grainSize: 30,
    },
    grain: { intensity: 24, size: 30, opacity: 0.18, blendMode: "soft-light" },
  },
  "golden-hour": {
    filterIntensity: 88,
    adjustments: {
      exposure: 6,
      highlights: -18,
      shadows: 10,
      whites: 8,
      blacks: 6,
      temperature: 7200,
      tint: 14,
      vibrance: 8,
      saturation: 6,
      clarity: 4,
      sharpness: 14,
      fade: 8,
      halation: 18,
      vignetteAmount: -14,
      vignetteFeather: 66,
      grainAmount: 18,
      grainSize: 26,
    },
    grain: { intensity: 22, size: 26, opacity: 0.16, blendMode: "soft-light" },
  },
  moonlight: {
    filterIntensity: 90,
    adjustments: {
      exposure: -8,
      highlights: -16,
      shadows: -6,
      whites: -10,
      blacks: -8,
      temperature: 4400,
      tint: -10,
      vibrance: -12,
      saturation: -18,
      clarity: 6,
      sharpness: 14,
      fade: 4,
      vignetteAmount: -32,
      vignetteFeather: 50,
      grainAmount: 22,
      grainSize: 30,
    },
    grain: { intensity: 26, size: 30, opacity: 0.18, blendMode: "soft-light" },
  },
  "dazz-nt16": {
    filterIntensity: 80,
    adjustments: {
      exposure: 3,
      highlights: -14,
      shadows: 18,
      whites: -2,
      blacks: 12,
      temperature: 5800,
      tint: 6,
      vibrance: -2,
      saturation: -4,
      clarity: -4,
      sharpness: 12,
      fade: 8,
      vignetteAmount: -8,
      vignetteFeather: 72,
      grainAmount: 16,
      grainSize: 26,
    },
    grain: { intensity: 24, size: 28, opacity: 0.18, blendMode: "soft-light" },
  },
  "dazz-grd": {
    filterIntensity: 82,
    adjustments: {
      exposure: -2,
      highlights: -20,
      shadows: 8,
      whites: -10,
      blacks: 10,
      temperature: 5400,
      tint: 0,
      vibrance: -10,
      saturation: -14,
      clarity: 8,
      sharpness: 14,
      fade: 12,
      vignetteAmount: -22,
      vignetteFeather: 60,
      grainAmount: 24,
      grainSize: 32,
    },
    grain: { intensity: 28, size: 32, opacity: 0.2, blendMode: "soft-light" },
  },
  "dazz-s67": {
    filterIntensity: 90,
    adjustments: {
      exposure: 2,
      highlights: -8,
      shadows: -4,
      whites: 8,
      blacks: -8,
      temperature: 5600,
      tint: 2,
      vibrance: 16,
      saturation: 14,
      clarity: 10,
      sharpness: 18,
      fade: 2,
      vignetteAmount: -14,
      vignetteFeather: 60,
      grainAmount: 20,
      grainSize: 28,
    },
    grain: { intensity: 24, size: 28, opacity: 0.18, blendMode: "soft-light" },
  },
  "blade-runner-2049": {
    filterIntensity: 90,
    adjustments: {
      exposure: 0,
      highlights: -16,
      shadows: -14,
      whites: 6,
      blacks: -18,
      temperature: 5200,
      tint: -8,
      vibrance: 4,
      saturation: 2,
      clarity: 14,
      sharpness: 20,
      fade: 4,
      vignetteAmount: -34,
      vignetteFeather: 50,
      grainAmount: 28,
      grainSize: 40,
    },
    grain: { intensity: 36, size: 44, opacity: 0.26, blendMode: "overlay" },
  },
  "the-matrix": {
    filterIntensity: 92,
    adjustments: {
      exposure: -2,
      highlights: -12,
      shadows: -12,
      whites: 4,
      blacks: -14,
      temperature: 5000,
      tint: -16,
      vibrance: -6,
      saturation: -10,
      clarity: 12,
      sharpness: 18,
      fade: 0,
      vignetteAmount: -28,
      vignetteFeather: 52,
      grainAmount: 22,
      grainSize: 30,
    },
    grain: { intensity: 26, size: 30, opacity: 0.18, blendMode: "soft-light" },
  },
  "neon-noir": {
    filterIntensity: 90,
    adjustments: {
      exposure: -4,
      highlights: -10,
      shadows: -22,
      whites: 6,
      blacks: -20,
      temperature: 4800,
      tint: -14,
      vibrance: 8,
      saturation: 6,
      clarity: 16,
      sharpness: 18,
      fade: 0,
      vignetteAmount: -40,
      vignetteFeather: 46,
      grainAmount: 44,
      grainSize: 48,
    },
    grain: { intensity: 58, size: 52, opacity: 0.38, blendMode: "overlay" },
  },
  "wes-anderson": {
    filterIntensity: 82,
    adjustments: {
      exposure: 5,
      highlights: -20,
      shadows: 18,
      whites: -6,
      blacks: 16,
      temperature: 6000,
      tint: 10,
      vibrance: 4,
      saturation: 2,
      clarity: -8,
      sharpness: 10,
      fade: 14,
      vignetteAmount: -12,
      vignetteFeather: 70,
      grainAmount: 14,
      grainSize: 22,
    },
    grain: { intensity: 18, size: 22, opacity: 0.14, blendMode: "soft-light" },
  },
  "wong-kar-wai": {
    filterIntensity: 92,
    adjustments: {
      exposure: 2,
      highlights: -12,
      shadows: -18,
      whites: 8,
      blacks: -22,
      temperature: 5800,
      tint: 8,
      vibrance: 6,
      saturation: 4,
      clarity: 12,
      sharpness: 18,
      fade: 4,
      halation: 14,
      vignetteAmount: -36,
      vignetteFeather: 48,
      grainAmount: 32,
      grainSize: 38,
    },
    grain: { intensity: 38, size: 38, opacity: 0.26, blendMode: "overlay" },
  },
};

type LookDefinitionInput = Omit<LookDefinition, "preset" | "renderRecipe">;

function resolveLookPreset(lookId: string) {
  const preset = LOOK_PRESETS[lookId];

  if (!preset) {
    throw new Error(`Missing preset for look "${lookId}"`);
  }

  return preset;
}

function defineLook(look: LookDefinitionInput): LookDefinition {
  const preset = resolveLookPreset(look.id);

  return {
    ...look,
    recommendedOverlay: look.recommendedOverlay ?? preset.grain,
    renderRecipe: getLookRenderRecipe(look.id, look.category),
    preset,
  };
}

const FUJIFILM_LOOKS_BASE: LookDefinitionInput[] = [
  {
    id: "provia-standard",
    name: "Provia / Standard",
    summary: "Neutral baseline with modest contrast and faithful color.",
    category: "fujifilm",
    cssFilter:
      "brightness(1.02) contrast(1.06) saturate(1.04) hue-rotate(-2deg) sepia(0.02)",
    matrix:
      "1.02 0 0 0 -0.01 0 1.01 0 0 -0.01 0 0 1.01 0 -0.01 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 24%, rgba(255,220,171,0.92), transparent 42%), linear-gradient(135deg, rgba(41,69,111,0.95), rgba(124,150,109,0.9) 52%, rgba(238,210,144,0.92))",
  },
  {
    id: "velvia",
    name: "Velvia",
    summary: "Deep greens, vivid reds, and aggressive contrast for landscapes.",
    category: "fujifilm",
    cssFilter:
      "brightness(1.00) contrast(1.22) saturate(1.62) hue-rotate(-5deg) sepia(0.06)",
    matrix:
      "1.14 -0.04 0.05 0 -0.03 -0.03 1.13 -0.04 0 -0.02 0.01 0.10 1.20 0 -0.05 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 26%, rgba(255,215,155,0.85), transparent 40%), linear-gradient(135deg, rgba(15,82,57,1), rgba(148,31,44,0.96) 48%, rgba(246,169,73,0.95))",
  },
  {
    id: "astia-soft",
    name: "Astia / Soft",
    summary: "Pastel contrast with gentle skin rendering for portrait work.",
    category: "fujifilm",
    cssFilter:
      "brightness(1.04) contrast(0.94) saturate(0.92) hue-rotate(1deg) sepia(0.08)",
    matrix:
      "1.03 0.02 0 0 0 0.01 1.01 0.03 0 -0.01 0 0.03 0.98 0 0 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 24% 20%, rgba(255,234,206,0.88), transparent 42%), linear-gradient(135deg, rgba(119,147,173,0.9), rgba(211,164,177,0.92) 52%, rgba(241,206,164,0.9))",
  },
  {
    id: "classic-chrome",
    name: "Classic Chrome",
    summary: "Muted documentary palette with cyan-shadow separation.",
    category: "fujifilm",
    cssFilter:
      "brightness(0.98) contrast(1.08) saturate(0.78) hue-rotate(-6deg) sepia(0.14)",
    matrix:
      "0.94 0.01 0.02 0 -0.02 0 0.92 0.03 0 -0.01 -0.01 0.06 0.98 0 -0.02 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 24%, rgba(231,210,176,0.74), transparent 40%), linear-gradient(135deg, rgba(59,87,106,0.98), rgba(120,128,121,0.9) 55%, rgba(149,110,70,0.88))",
    recommendedOverlay: {
      intensity: 32,
      size: 34,
      opacity: 0.22,
      blendMode: "soft-light",
    },
  },
  {
    id: "classic-negative",
    name: "Classic Negative",
    summary: "Crushed blacks, sharp mids, and faded highlights for cinematic bite.",
    category: "fujifilm",
    cssFilter:
      "brightness(1.03) contrast(1.24) saturate(0.86) hue-rotate(-4deg) sepia(0.16)",
    matrix:
      "1.06 -0.03 0.03 0 -0.03 -0.01 0.96 0.02 0 -0.04 0.02 0.06 0.94 0 -0.05 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 32% 24%, rgba(238,192,149,0.76), transparent 38%), linear-gradient(135deg, rgba(47,59,79,1), rgba(110,83,76,0.92) 50%, rgba(194,123,74,0.9))",
  },
  {
    id: "eterna-cinema",
    name: "Eterna Cinema",
    summary: "Low-saturation, wide-range rendering built for later grading.",
    category: "fujifilm",
    cssFilter:
      "brightness(1.02) contrast(0.88) saturate(0.72) hue-rotate(-2deg) sepia(0.04)",
    matrix:
      "0.96 0 0.02 0 0 0 0.96 0.02 0 0 -0.01 0.03 0.97 0 0 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 30% 24%, rgba(236,224,201,0.72), transparent 38%), linear-gradient(135deg, rgba(58,74,94,0.95), rgba(110,121,118,0.82) 55%, rgba(178,165,141,0.8))",
  },
  {
    id: "eterna-bleach-bypass",
    name: "Eterna Bleach Bypass",
    summary: "Silver-retention grit with reduced saturation and dense contrast.",
    category: "fujifilm",
    cssFilter:
      "brightness(0.98) contrast(1.32) saturate(0.48) hue-rotate(0deg) sepia(0.08)",
    matrix:
      "1.03 0 0 0 -0.02 0 1.01 0 0 -0.02 0 0 0.98 0 -0.02 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 30% 24%, rgba(241,227,204,0.5), transparent 36%), linear-gradient(135deg, rgba(70,79,88,1), rgba(118,118,118,0.9) 58%, rgba(168,150,129,0.72))",
  },
  {
    id: "acros",
    name: "Acros",
    summary: "High-contrast monochrome with selectable red, yellow, or green bias.",
    category: "bw",
    cssFilter:
      "brightness(1.00) contrast(1.25) saturate(0) hue-rotate(0deg) sepia(0.02)",
    matrix:
      "0.213 0.715 0.072 0 0 0.213 0.715 0.072 0 0 0.213 0.715 0.072 0 0 0 0 0 1 0",
    acrosChannels: {
      neutral:
        "0.213 0.715 0.072 0 0 0.213 0.715 0.072 0 0 0.213 0.715 0.072 0 0 0 0 0 1 0",
      red:
        "0.40 0.52 0.08 0 0 0.40 0.52 0.08 0 0 0.40 0.52 0.08 0 0 0 0 0 1 0",
      yellow:
        "0.32 0.62 0.06 0 0 0.32 0.62 0.06 0 0 0.32 0.62 0.06 0 0 0 0 0 1 0",
      green:
        "0.14 0.78 0.08 0 0 0.14 0.78 0.08 0 0 0.14 0.78 0.08 0 0 0 0 0 1 0",
    },
    thumbnail:
      "radial-gradient(circle at 30% 22%, rgba(250,250,250,0.64), transparent 38%), linear-gradient(135deg, rgba(53,53,53,1), rgba(146,146,146,0.9) 60%, rgba(212,212,212,0.92))",
  },
  {
    id: "nostalgic-negative",
    name: "Nostalgic Negative",
    summary: "Warm oranges, lifted blacks, and faded analog romance.",
    category: "fujifilm",
    cssFilter:
      "brightness(1.05) contrast(0.94) saturate(0.92) hue-rotate(-8deg) sepia(0.22)",
    matrix:
      "1.02 0.02 0 0 0.01 0 0.96 0.04 0 -0.01 0 0.02 0.9 0 -0.02 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 32% 26%, rgba(255,214,169,0.82), transparent 40%), linear-gradient(135deg, rgba(120,103,110,0.92), rgba(206,144,103,0.96) 52%, rgba(243,198,127,0.94))",
  },
  {
    id: "reala-ace",
    name: "Reala Ace",
    summary: "Subtle warmth and high detail retention close to true-color film.",
    category: "fujifilm",
    cssFilter:
      "brightness(1.01) contrast(1.03) saturate(1.02) hue-rotate(-1deg) sepia(0.04)",
    matrix:
      "1.01 0 0.01 0 0 0 1.01 0.01 0 0 0 0.01 1.02 0 0 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 26% 22%, rgba(247,224,181,0.82), transparent 42%), linear-gradient(135deg, rgba(44,84,103,0.94), rgba(148,156,142,0.88) 52%, rgba(232,191,121,0.92))",
  },
];

const ANALOG_FILM_LOOKS_BASE: LookDefinitionInput[] = [
  {
    id: "portra-400",
    name: "Portra 400",
    summary: "Warm skin, lifted blacks, gentle pastel with zero harshness.",
    category: "analog",
    cssFilter:
      "brightness(1.02) contrast(0.93) saturate(0.96) hue-rotate(-3deg) sepia(0.08)",
    matrix:
      "1.04 0.02 0.00 0 0.02  0.01 1.00 0.01 0 0.01  0.00 0.02 0.90 0 0.04  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 24%, rgba(255,220,185,0.88), transparent 42%), linear-gradient(135deg, rgba(168,130,110,0.92), rgba(214,178,148,0.9) 52%, rgba(243,210,172,0.94))",
    recommendedOverlay: {
      intensity: 28,
      size: 30,
      opacity: 0.2,
      blendMode: "soft-light",
    },
  },
  {
    id: "portra-160",
    name: "Portra 160",
    summary: "Ultra-fine grain, clinical pastel, the cleanest skin in analog.",
    category: "analog",
    cssFilter:
      "brightness(1.01) contrast(0.91) saturate(0.94) hue-rotate(-2deg) sepia(0.06)",
    matrix:
      "1.03 0.01 0.00 0 0.01  0.00 1.01 0.01 0 0.01  0.00 0.01 0.93 0 0.03  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 26% 22%, rgba(252,228,200,0.86), transparent 42%), linear-gradient(135deg, rgba(160,136,118,0.88), rgba(220,192,164,0.86) 54%, rgba(245,218,186,0.9))",
    recommendedOverlay: {
      intensity: 18,
      size: 22,
      opacity: 0.14,
      blendMode: "soft-light",
    },
  },
  {
    id: "kodak-gold-200",
    name: "Kodak Gold 200",
    summary: "Amber warmth, orange-shifted reds, the classic vacation roll.",
    category: "analog",
    cssFilter:
      "brightness(1.03) contrast(1.06) saturate(1.14) hue-rotate(-9deg) sepia(0.20)",
    matrix:
      "1.08 0.02 0.00 0 0.02  0.00 0.98 0.02 0 0.01  -0.01 0.01 0.88 0 0.03  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 30% 24%, rgba(255,210,140,0.9), transparent 38%), linear-gradient(135deg, rgba(172,110,52,0.96), rgba(224,158,82,0.96) 54%, rgba(252,204,112,0.98))",
    recommendedOverlay: {
      intensity: 38,
      size: 38,
      opacity: 0.26,
      blendMode: "overlay",
    },
  },
  {
    id: "ultramax-400",
    name: "Kodak UltraMax 400",
    summary: "Punchy consumer saturation with slight green shadow bleed.",
    category: "analog",
    cssFilter:
      "brightness(1.02) contrast(1.10) saturate(1.10) hue-rotate(-6deg) sepia(0.14)",
    matrix:
      "1.06 0.01 0.00 0 0.01  0.01 0.99 0.03 0 0.00  -0.01 0.04 0.90 0 0.02  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 22%, rgba(255,205,155,0.82), transparent 38%), linear-gradient(135deg, rgba(120,100,58,0.96), rgba(194,148,82,0.94) 52%, rgba(236,178,98,0.96))",
    recommendedOverlay: {
      intensity: 42,
      size: 40,
      opacity: 0.28,
      blendMode: "overlay",
    },
  },
  {
    id: "colorplus-200",
    name: "Kodak ColorPlus 200",
    summary: "Budget orange cast, vivid warm tones, consumer-heavy saturation.",
    category: "analog",
    cssFilter:
      "brightness(1.04) contrast(1.08) saturate(1.18) hue-rotate(-12deg) sepia(0.24)",
    matrix:
      "1.10 0.01 0.00 0 0.02  0.00 0.97 0.02 0 0.01  -0.02 0.01 0.86 0 0.03  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 26% 22%, rgba(255,200,130,0.88), transparent 36%), linear-gradient(135deg, rgba(185,112,44,0.98), rgba(234,158,66,0.96) 52%, rgba(255,192,96,0.98))",
  },
  {
    id: "cinestill-800t",
    name: "CineStill 800T",
    summary: "Tungsten-balanced in daylight: hot reds, halation, cinematic grain.",
    category: "analog",
    cssFilter:
      "brightness(1.05) contrast(1.14) saturate(1.06) hue-rotate(-16deg) sepia(0.32)",
    matrix:
      "1.12 0.01 0.00 0 0.04  0.00 0.96 0.01 0 0.01  -0.02 0.01 0.82 0 0.02  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 32% 26%, rgba(255,180,140,0.86), transparent 38%), linear-gradient(135deg, rgba(140,62,44,0.98), rgba(208,102,64,0.96) 52%, rgba(255,148,80,0.98))",
    recommendedOverlay: {
      intensity: 58,
      size: 52,
      opacity: 0.38,
      blendMode: "overlay",
    },
  },
  {
    id: "fuji-400h",
    name: "Fujifilm 400H",
    summary: "Cool and clinical, cyan-shadow bias, gentle on skin.",
    category: "analog",
    cssFilter:
      "brightness(1.01) contrast(0.91) saturate(0.88) hue-rotate(3deg) sepia(0.04)",
    matrix:
      "1.00 0.01 0.01 0 0.01  0.00 1.02 0.00 0 0.01  0.01 0.03 0.96 0 0.02  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 22%, rgba(210,226,238,0.74), transparent 40%), linear-gradient(135deg, rgba(72,104,138,0.9), rgba(140,174,196,0.86) 54%, rgba(196,212,222,0.88))",
    recommendedOverlay: {
      intensity: 22,
      size: 26,
      opacity: 0.16,
      blendMode: "soft-light",
    },
  },
  {
    id: "fuji-superia-400",
    name: "Fujifilm Superia 400",
    summary: "Slight green in shadows, cooler skin than Kodak, classic family album.",
    category: "analog",
    cssFilter:
      "brightness(1.01) contrast(1.04) saturate(0.96) hue-rotate(4deg) sepia(0.06)",
    matrix:
      "0.98 0.01 0.01 0 0.00  0.01 1.03 0.00 0 0.00  0.00 0.04 0.94 0 0.01  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 26% 24%, rgba(200,226,200,0.72), transparent 40%), linear-gradient(135deg, rgba(58,96,82,0.92), rgba(120,162,136,0.88) 54%, rgba(182,210,178,0.86))",
  },
  {
    id: "hp5-plus",
    name: "Ilford HP5 Plus",
    summary: "Warm optical-print grayscale with panchromatic luminance bias.",
    category: "bw",
    cssFilter:
      "brightness(1.02) contrast(1.18) saturate(0) hue-rotate(0deg) sepia(0.08)",
    matrix:
      "0.213 0.715 0.072 0 0.01  0.213 0.715 0.072 0 0.01  0.213 0.715 0.072 0 0.01  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 22%, rgba(250,248,242,0.72), transparent 40%), linear-gradient(135deg, rgba(36,36,36,1), rgba(128,122,112,0.9) 56%, rgba(230,224,212,0.94))",
    recommendedOverlay: {
      intensity: 48,
      size: 36,
      opacity: 0.3,
      blendMode: "soft-light",
    },
  },
  {
    id: "delta-3200",
    name: "Ilford Delta 3200",
    summary: "Pushed ISO grain storm, deep blacks, documentary emergency film.",
    category: "bw",
    cssFilter:
      "brightness(1.00) contrast(1.28) saturate(0) hue-rotate(0deg) sepia(0.04)",
    matrix:
      "0.22 0.70 0.08 0 0  0.22 0.70 0.08 0 0  0.22 0.70 0.08 0 0  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 26% 20%, rgba(240,236,228,0.52), transparent 36%), linear-gradient(135deg, rgba(14,14,14,1), rgba(82,80,76,0.9) 58%, rgba(196,192,184,0.88))",
    recommendedOverlay: {
      intensity: 78,
      size: 72,
      opacity: 0.48,
      blendMode: "overlay",
    },
  },
];

const CINEMA_LOOKS_BASE: LookDefinitionInput[] = [
  {
    id: "kodachrome-64",
    name: "Kodachrome 64",
    summary: "Sun-baked reds, yellow warmth, and rich Americana blues.",
    category: "cinema",
    cssFilter:
      "brightness(1.03) contrast(1.15) saturate(1.18) hue-rotate(-6deg) sepia(0.18)",
    matrix:
      "1.1 -0.03 0.02 0 0 0 1.01 0.02 0 -0.01 -0.01 0.04 1.08 0 -0.03 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 22%, rgba(255,215,160,0.9), transparent 38%), linear-gradient(135deg, rgba(31,65,116,0.98), rgba(184,73,54,0.96) 56%, rgba(244,178,79,0.96))",
  },
  {
    id: "teal-and-orange",
    name: "Teal & Orange",
    summary: "Complementary blockbuster split with cool shadows and warm skin.",
    category: "cinema",
    cssFilter:
      "brightness(1.01) contrast(1.14) saturate(1.1) hue-rotate(-10deg) sepia(0.1)",
    matrix:
      "0.98 0.03 0.02 0 0.01 0.02 0.96 0.08 0 -0.01 -0.03 0.08 1.06 0 -0.01 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 30% 24%, rgba(255,190,142,0.84), transparent 38%), linear-gradient(135deg, rgba(20,104,126,0.98), rgba(61,147,169,0.94) 42%, rgba(216,120,61,0.96) 84%)",
  },
  {
    id: "bleach-bypass",
    name: "Bleach Bypass",
    summary: "High-contrast silver retention with war-film grit and low color.",
    category: "cinema",
    cssFilter:
      "brightness(0.98) contrast(1.34) saturate(0.52) hue-rotate(0deg) sepia(0.08)",
    matrix:
      "1.02 0 0 0 -0.02 0 1.02 0 0 -0.02 0 0 1.02 0 -0.02 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 24%, rgba(230,224,214,0.48), transparent 38%), linear-gradient(135deg, rgba(74,80,86,1), rgba(131,125,117,0.88) 55%, rgba(171,149,131,0.75))",
  },
  {
    id: "day-for-night",
    name: "Day for Night",
    summary: "Lowered exposure with blue-shifted mids to fake moonlit scenes.",
    category: "cinema",
    cssFilter:
      "brightness(0.62) contrast(1.08) saturate(0.74) hue-rotate(-18deg) sepia(0.05)",
    matrix:
      "0.72 0.02 0.08 0 -0.05 0 0.82 0.12 0 -0.04 -0.03 0.06 1.04 0 -0.02 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 22%, rgba(174,198,255,0.42), transparent 36%), linear-gradient(135deg, rgba(10,27,56,1), rgba(30,57,99,0.92) 52%, rgba(87,116,167,0.84))",
  },
  {
    id: "cross-process",
    name: "Cross Process",
    summary: "Vivid, chemical-green shadows with magenta-rich highlights.",
    category: "cinema",
    cssFilter:
      "brightness(1.02) contrast(1.18) saturate(1.24) hue-rotate(12deg) sepia(0.14)",
    matrix:
      "1.02 -0.02 0.04 0 0 0.03 0.96 0.03 0 0 -0.02 0.06 1.1 0 -0.02 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 30% 22%, rgba(255,210,190,0.7), transparent 34%), linear-gradient(135deg, rgba(66,118,64,0.98), rgba(104,170,92,0.92) 46%, rgba(207,83,149,0.96) 92%)",
  },
  {
    id: "matte-film",
    name: "Matte Film",
    summary: "Lifted blacks, softened contrast, and faint green in the toe.",
    category: "cinema",
    cssFilter:
      "brightness(1.04) contrast(0.86) saturate(0.82) hue-rotate(4deg) sepia(0.06)",
    matrix:
      "0.96 0.02 0 0 0.05 0.01 0.97 0.02 0 0.03 0 0.02 0.94 0 0.04 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 24% 24%, rgba(240,228,205,0.62), transparent 40%), linear-gradient(135deg, rgba(74,92,80,0.94), rgba(152,143,126,0.82) 52%, rgba(219,196,155,0.8))",
  },
  {
    id: "golden-hour",
    name: "Golden Hour",
    summary: "Amber wash, gentle highlight bloom, and reduced cool channel energy.",
    category: "cinema",
    cssFilter:
      "brightness(1.08) contrast(1.04) saturate(1.08) hue-rotate(-12deg) sepia(0.22)",
    matrix:
      "1.06 0.02 0 0 0.02 0.01 0.98 0.02 0 0 0 0 0.9 0 -0.02 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 26% 20%, rgba(255,230,171,0.9), transparent 36%), linear-gradient(135deg, rgba(156,96,39,0.92), rgba(223,145,72,0.96) 56%, rgba(255,209,120,0.98))",
  },
  {
    id: "moonlight",
    name: "Moonlight",
    summary: "Cool nocturne blues with restrained saturation for moody frames.",
    category: "cinema",
    cssFilter:
      "brightness(0.9) contrast(1.05) saturate(0.72) hue-rotate(-18deg) sepia(0.03)",
    matrix:
      "0.82 0.02 0.08 0 -0.02 0 0.9 0.1 0 -0.02 -0.01 0.03 1.02 0 -0.02 0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 30% 22%, rgba(189,221,255,0.52), transparent 36%), linear-gradient(135deg, rgba(17,36,72,1), rgba(35,66,123,0.92) 52%, rgba(90,130,197,0.8))",
  },
  {
    id: "dazz-nt16",
    name: "NT16 Portrait",
    summary: "Dazz Cam's go-to portrait sim, clean warmth, non-invasive grain.",
    category: "cinema",
    cssFilter:
      "brightness(1.03) contrast(0.96) saturate(0.94) hue-rotate(-2deg) sepia(0.08)",
    matrix:
      "1.02 0.02 0.00 0 0.01  0.00 1.00 0.01 0 0.01  0.00 0.01 0.94 0 0.03  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 24%, rgba(252,222,188,0.86), transparent 42%), linear-gradient(135deg, rgba(164,128,108,0.9), rgba(210,178,150,0.88) 52%, rgba(242,208,170,0.92))",
    recommendedOverlay: {
      intensity: 24,
      size: 28,
      opacity: 0.18,
      blendMode: "soft-light",
    },
  },
  {
    id: "dazz-grd",
    name: "GRD Moody",
    summary: "Low-contrast muted palette with shadow-play texture.",
    category: "cinema",
    cssFilter:
      "brightness(0.96) contrast(0.88) saturate(0.82) hue-rotate(-4deg) sepia(0.12)",
    matrix:
      "0.98 0.01 0.02 0 0.02  0.00 0.96 0.02 0 0.02  -0.01 0.02 0.96 0 0.03  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 26% 22%, rgba(220,208,190,0.68), transparent 38%), linear-gradient(135deg, rgba(64,68,72,0.96), rgba(118,114,108,0.88) 54%, rgba(178,166,148,0.82))",
  },
  {
    id: "dazz-s67",
    name: "S67 Vivid",
    summary: "Saturated pop with boosted reds and greens for food and travel.",
    category: "cinema",
    cssFilter:
      "brightness(1.02) contrast(1.12) saturate(1.38) hue-rotate(-5deg) sepia(0.08)",
    matrix:
      "1.08 -0.02 0.02 0 -0.01  -0.01 1.06 0.00 0 -0.01  0.00 0.04 1.04 0 -0.02  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 22%, rgba(255,210,148,0.82), transparent 36%), linear-gradient(135deg, rgba(44,110,64,0.96), rgba(196,152,68,0.96) 54%, rgba(240,88,68,0.94))",
  },
  {
    id: "blade-runner-2049",
    name: "Blade Runner 2049",
    summary: "Split amber mids vs teal shadows, a Villeneuve/Deakins hallmark.",
    category: "cinema",
    cssFilter:
      "brightness(1.02) contrast(1.16) saturate(1.04) hue-rotate(-8deg) sepia(0.14)",
    matrix:
      "1.08 0.04 -0.02 0 0.02  0.01 0.96 0.06 0 -0.01  -0.04 0.08 1.08 0 -0.01  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 30% 24%, rgba(255,190,120,0.72), transparent 36%), linear-gradient(135deg, rgba(18,52,96,0.98), rgba(38,96,114,0.9) 44%, rgba(208,138,64,0.94) 86%)",
    recommendedOverlay: {
      intensity: 36,
      size: 44,
      opacity: 0.26,
      blendMode: "overlay",
    },
  },
  {
    id: "the-matrix",
    name: "The Matrix",
    summary: "Desaturated teal-green cast, clinical and cold throughout.",
    category: "cinema",
    cssFilter:
      "brightness(0.96) contrast(1.18) saturate(0.88) hue-rotate(14deg) sepia(0.04)",
    matrix:
      "0.88 0.04 0.02 0 -0.02  0.02 1.06 0.02 0 0.00  0.00 0.04 0.90 0 -0.02  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 26% 20%, rgba(148,210,148,0.52), transparent 36%), linear-gradient(135deg, rgba(12,32,18,1), rgba(36,76,44,0.92) 52%, rgba(82,148,88,0.84))",
  },
  {
    id: "neon-noir",
    name: "Neon Noir",
    summary: "Drive-inspired: magenta/pink highlights, deep teal-blue shadows.",
    category: "cinema",
    cssFilter:
      "brightness(0.95) contrast(1.22) saturate(1.14) hue-rotate(-22deg) sepia(0.04)",
    matrix:
      "0.92 0.02 0.08 0 -0.02  0.01 0.94 0.10 0 -0.01  -0.02 0.06 1.12 0 -0.02  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 32% 22%, rgba(255,148,210,0.58), transparent 34%), linear-gradient(135deg, rgba(18,14,48,1), rgba(54,28,96,0.94) 48%, rgba(32,164,196,0.72) 88%)",
    recommendedOverlay: {
      intensity: 58,
      size: 52,
      opacity: 0.38,
      blendMode: "overlay",
    },
  },
  {
    id: "wes-anderson",
    name: "Wes Anderson",
    summary: "Symmetrical pastels, warm peach, muted ochre, and soft browns.",
    category: "cinema",
    cssFilter:
      "brightness(1.05) contrast(0.92) saturate(1.08) hue-rotate(-10deg) sepia(0.18)",
    matrix:
      "1.06 0.02 0.00 0 0.02  0.01 0.98 0.02 0 0.02  -0.01 0.01 0.88 0 0.02  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 22%, rgba(255,218,178,0.88), transparent 40%), linear-gradient(135deg, rgba(172,130,88,0.92), rgba(218,178,128,0.9) 52%, rgba(246,210,160,0.94))",
  },
  {
    id: "wong-kar-wai",
    name: "Wong Kar-wai",
    summary: "Dense reds, crushed warm blacks, In the Mood for Love palette.",
    category: "cinema",
    cssFilter:
      "brightness(1.01) contrast(1.20) saturate(1.10) hue-rotate(-10deg) sepia(0.20)",
    matrix:
      "1.12 0.00 -0.02 0 0.01  0.00 0.94 0.02 0 -0.01  -0.02 0.02 0.90 0 -0.02  0 0 0 1 0",
    thumbnail:
      "radial-gradient(circle at 28% 24%, rgba(255,170,130,0.82), transparent 36%), linear-gradient(135deg, rgba(96,28,28,0.98), rgba(180,72,48,0.96) 50%, rgba(240,140,80,0.94))",
  },
];

export const FUJIFILM_LOOKS: LookDefinition[] = FUJIFILM_LOOKS_BASE.map(defineLook);
export const ANALOG_FILM_LOOKS: LookDefinition[] = ANALOG_FILM_LOOKS_BASE.map(defineLook);
export const CINEMA_LOOKS: LookDefinition[] = CINEMA_LOOKS_BASE.map(defineLook);

export const ALL_LOOKS = [...FUJIFILM_LOOKS, ...ANALOG_FILM_LOOKS, ...CINEMA_LOOKS];

export const ACROS_CHANNEL_OPTIONS: { value: AcrosChannel; label: string }[] = [
  { value: "neutral", label: "Neutral" },
  { value: "red", label: "Red Filter" },
  { value: "yellow", label: "Yellow Filter" },
  { value: "green", label: "Green Filter" },
];

export const ADJUSTMENT_GROUPS: AdjustmentGroupDefinition[] = [
  {
    id: "light",
    label: "Light",
    controls: [
      { key: "exposure", label: "Exposure", min: -100, max: 100, defaultValue: 0 },
      { key: "highlights", label: "Highlights", min: -100, max: 100, defaultValue: 0 },
      { key: "shadows", label: "Shadows", min: -100, max: 100, defaultValue: 0 },
      { key: "whites", label: "Whites", min: -100, max: 100, defaultValue: 0 },
      { key: "blacks", label: "Blacks", min: -100, max: 100, defaultValue: 0 },
    ],
  },
  {
    id: "color",
    label: "Color",
    controls: [
      {
        key: "temperature",
        label: "Temperature",
        min: 2000,
        max: 10000,
        defaultValue: 5500,
        suffix: "K",
      },
      { key: "tint", label: "Tint", min: -100, max: 100, defaultValue: 0 },
      { key: "vibrance", label: "Vibrance", min: -100, max: 100, defaultValue: 0 },
      { key: "saturation", label: "Saturation", min: -100, max: 100, defaultValue: 0 },
    ],
  },
  {
    id: "detail",
    label: "Detail",
    controls: [
      { key: "clarity", label: "Clarity", min: -100, max: 100, defaultValue: 0 },
      { key: "texture", label: "Texture", min: -100, max: 100, defaultValue: 0 },
      { key: "sharpness", label: "Sharpness", min: -100, max: 100, defaultValue: 0 },
      {
        key: "noiseReduction",
        label: "Noise Reduction",
        min: 0,
        max: 100,
        defaultValue: 0,
      },
    ],
  },
  {
    id: "effects",
    label: "Effects",
    controls: [
      { key: "grainAmount", label: "Grain Amount", min: 0, max: 100, defaultValue: 0 },
      { key: "grainSize", label: "Grain Size", min: 0, max: 100, defaultValue: 40 },
      { key: "vignetteAmount", label: "Vignette", min: -100, max: 100, defaultValue: 0 },
      { key: "vignetteFeather", label: "Vignette Feather", min: 0, max: 100, defaultValue: 60 },
      { key: "halation", label: "Halation", min: 0, max: 100, defaultValue: 0 },
      { key: "fade", label: "Fade", min: 0, max: 100, defaultValue: 0 },
    ],
  },
];

export const TEXT_PRESETS: TextPresetDefinition[] = [
  {
    id: "film-title-card",
    name: "Film Title Card",
    text: "EIKASIA",
    xPct: 50,
    yPct: 28,
    widthPct: 82,
    fontSizePct: 24,
    fontFamily: "serif",
    color: "#f9f4ea",
    opacity: 0.96,
    letterSpacing: 320,
    lineHeight: 1.05,
    shadowPreset: "soft",
    blendMode: "screen",
    textAlign: "center",
    fontWeight: "600",
  },
  {
    id: "subtitle-burn",
    name: "Subtitle Burn",
    text: "The image remembers what the light forgot.",
    xPct: 50,
    yPct: 87,
    widthPct: 70,
    fontSizePct: 8,
    fontFamily: "sans",
    color: "#f8f8f8",
    opacity: 0.94,
    letterSpacing: 50,
    lineHeight: 1.25,
    shadowPreset: "soft",
    blendMode: "normal",
    backgroundColor: "rgba(0,0,0,0.55)",
    textAlign: "center",
    fontWeight: "500",
  },
  {
    id: "directors-credit",
    name: "Director's Credit",
    text: "A film by Eikasia Studio",
    xPct: 82,
    yPct: 90,
    widthPct: 40,
    fontSizePct: 7.2,
    fontFamily: "serif",
    color: "#efebe0",
    opacity: 0.86,
    letterSpacing: 80,
    lineHeight: 1.2,
    shadowPreset: "soft",
    blendMode: "screen",
    backgroundColor: null,
    textAlign: "right",
    fontStyle: "italic",
    fontWeight: "400",
  },
  {
    id: "location-stamp",
    name: "Location Stamp",
    text: "TOKYO / 35MM / 20:45",
    xPct: 14,
    yPct: 10,
    widthPct: 40,
    fontSizePct: 6.8,
    fontFamily: "mono",
    color: "#f2efe6",
    opacity: 0.82,
    letterSpacing: 180,
    lineHeight: 1,
    shadowPreset: "hard",
    blendMode: "screen",
    textAlign: "left",
    fontWeight: "500",
  },
  {
    id: "date-stamp",
    name: "Date Stamp",
    text: "03.25.2026",
    xPct: 84,
    yPct: 92,
    widthPct: 35,
    fontSizePct: 8.5,
    fontFamily: "mono",
    color: "#f59e0b",
    opacity: 0.92,
    letterSpacing: 140,
    lineHeight: 1,
    shadowPreset: "hard",
    blendMode: "screen",
    textAlign: "right",
    fontWeight: "500",
  },
  {
    id: "intertitle",
    name: "Intertitle",
    text: "Silence leaves its own subtitles.",
    xPct: 50,
    yPct: 48,
    widthPct: 90,
    fontSizePct: 9.5,
    fontFamily: "serif",
    color: "#f3ead8",
    opacity: 0.96,
    letterSpacing: 120,
    lineHeight: 1.25,
    shadowPreset: "none",
    blendMode: "normal",
    backgroundColor: "rgba(0,0,0,0.9)",
    textAlign: "center",
    fontWeight: "600",
  },
  {
    id: "neon-sign",
    name: "Neon Sign",
    text: "MIDNIGHT OPEN",
    xPct: 50,
    yPct: 36,
    widthPct: 62,
    fontSizePct: 11,
    fontFamily: "display",
    color: "#42d0ff",
    opacity: 0.98,
    letterSpacing: 100,
    lineHeight: 1.05,
    shadowPreset: "neon",
    blendMode: "screen",
    textAlign: "center",
    fontWeight: "600",
  },
  {
    id: "typewriter",
    name: "Typewriter",
    text: "Scene 04 // take 09",
    xPct: 16,
    yPct: 82,
    widthPct: 32,
    fontSizePct: 4.2,
    fontFamily: "mono",
    color: "#e8dfcf",
    opacity: 0.82,
    letterSpacing: 65,
    lineHeight: 1.1,
    shadowPreset: "soft",
    blendMode: "normal",
    textAlign: "left",
    fontWeight: "400",
  },
  {
    id: "kodak-frame",
    name: "Kodak Frame",
    text: "KODAK 400TX",
    xPct: 50,
    yPct: 6,
    widthPct: 86,
    fontSizePct: 3.2,
    fontFamily: "mono",
    color: "#efe4c5",
    opacity: 0.86,
    letterSpacing: 240,
    lineHeight: 1,
    shadowPreset: "none",
    blendMode: "screen",
    textAlign: "center",
    fontWeight: "500",
  },
  {
    id: "imax-credit-roll",
    name: "IMAX Credit Roll",
    text: "PHOTOGRAPHY BY EIKASIA",
    xPct: 50,
    yPct: 14,
    widthPct: 88,
    fontSizePct: 3.4,
    fontFamily: "sans",
    color: "#fafafa",
    opacity: 0.92,
    letterSpacing: 360,
    lineHeight: 1,
    shadowPreset: "none",
    blendMode: "screen",
    textAlign: "center",
    fontWeight: "400",
  },
];

export const GRAIN_PRESETS: OverlayPresetDefinition[] = [
  {
    id: "grain-subtle",
    name: "Subtle",
    type: "grain",
    opacity: 0.18,
    blendMode: "soft-light",
    intensity: 32,
    size: 36,
  },
  {
    id: "grain-medium",
    name: "Medium",
    type: "grain",
    opacity: 0.28,
    blendMode: "overlay",
    intensity: 56,
    size: 48,
  },
  {
    id: "grain-heavy",
    name: "Heavy",
    type: "grain",
    opacity: 0.42,
    blendMode: "overlay",
    intensity: 78,
    size: 68,
  },
];

export function getClosestGrainPresetId(
  grain: LookPreset["grain"],
) {
  return GRAIN_PRESETS.reduce((closestPreset, preset) => {
    const presetScore =
      Math.abs((preset.intensity ?? 0) - grain.intensity) +
      Math.abs((preset.size ?? 0) - grain.size) * 0.6 +
      Math.abs(preset.opacity - grain.opacity) * 100 +
      (preset.blendMode === grain.blendMode ? 0 : 24);
    const closestScore =
      Math.abs((closestPreset.intensity ?? 0) - grain.intensity) +
      Math.abs((closestPreset.size ?? 0) - grain.size) * 0.6 +
      Math.abs(closestPreset.opacity - grain.opacity) * 100 +
      (closestPreset.blendMode === grain.blendMode ? 0 : 24);

    return presetScore < closestScore ? preset : closestPreset;
  }).id;
}

export function createRecommendedGrainLayer(
  grain: LookPreset["grain"],
  existingLayer?: ProjectState["overlayLayers"][number] | null,
) {
  const subtleGrain = {
    opacity: clamp(grain.opacity * 0.76, 0.1, DEFAULT_LOOK_GRAIN_OPACITY_CAP),
    blendMode: "soft-light" as const,
    intensity: clamp(
      Math.round(grain.intensity * 0.62),
      12,
      DEFAULT_LOOK_GRAIN_INTENSITY_CAP,
    ),
    size: clamp(
      Math.round(grain.size * 0.78),
      DEFAULT_LOOK_GRAIN_SIZE_MIN,
      DEFAULT_LOOK_GRAIN_SIZE_MAX,
    ),
  };

  return {
    id: existingLayer?.id ?? "grain-default",
    type: "grain" as const,
    presetId: getClosestGrainPresetId(subtleGrain),
    opacity: subtleGrain.opacity,
    blendMode: subtleGrain.blendMode,
    intensity: subtleGrain.intensity,
    size: subtleGrain.size,
  };
}

export function normalizeLookAdjustments(
  adjustments: Partial<Adjustments> | undefined,
): Partial<Adjustments> {
  if (!adjustments) {
    return {};
  }

  return {
    ...adjustments,
    grainAmount: clamp(
      adjustments.grainAmount ?? DEFAULT_ADJUSTMENTS.grainAmount,
      0,
      DEFAULT_LOOK_GRAIN_AMOUNT_CAP,
    ),
    grainSize: clamp(
      adjustments.grainSize ?? DEFAULT_ADJUSTMENTS.grainSize,
      DEFAULT_LOOK_GRAIN_SIZE_MIN,
      DEFAULT_LOOK_GRAIN_SIZE_MAX,
    ),
  };
}

export const LIGHT_LEAK_PRESETS: OverlayPresetDefinition[] = [
  {
    id: "left-burn",
    name: "Left Burn",
    type: "lightLeak",
    opacity: 0.56,
    blendMode: "screen",
  },
  {
    id: "right-burn",
    name: "Right Burn",
    type: "lightLeak",
    opacity: 0.56,
    blendMode: "screen",
  },
  {
    id: "top-flare",
    name: "Top Flare",
    type: "lightLeak",
    opacity: 0.5,
    blendMode: "screen",
  },
  {
    id: "corner-flare",
    name: "Corner Flare",
    type: "lightLeak",
    opacity: 0.52,
    blendMode: "screen",
  },
  {
    id: "full-bloom",
    name: "Full Bloom",
    type: "lightLeak",
    opacity: 0.48,
    blendMode: "screen",
  },
  {
    id: "edge-leak",
    name: "Edge Leak",
    type: "lightLeak",
    opacity: 0.44,
    blendMode: "screen",
  },
];

export const BORDER_PRESETS: OverlayPresetDefinition[] = [
  {
    id: "kodak-border",
    name: "Kodak Frame",
    type: "border",
    opacity: 0.88,
    blendMode: "normal",
  },
  {
    id: "negative-strip",
    name: "35mm Strip",
    type: "border",
    opacity: 0.9,
    blendMode: "normal",
  },
  {
    id: "polaroid-border",
    name: "Polaroid",
    type: "border",
    opacity: 0.92,
    blendMode: "normal",
  },
  {
    id: "super8-border",
    name: "Super 8",
    type: "border",
    opacity: 0.9,
    blendMode: "normal",
  },
  {
    id: "instax-border",
    name: "Fujifilm Instax",
    type: "border",
    opacity: 0.94,
    blendMode: "normal",
  },
];

export const DUST_PRESET: OverlayPresetDefinition = {
  id: "dust-scratches",
  name: "Dust & Scratches",
  type: "dust",
  opacity: 0.24,
  blendMode: "screen",
};

export const DEFAULT_FLARE_PRESET: OverlayPresetDefinition = {
  id: "anamorphic-flare",
  name: "Anamorphic Flare",
  type: "flare",
  opacity: 0.36,
  blendMode: "screen",
  intensity: 52,
  position: 48,
};

export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  { id: "free", label: "Freeform", value: null },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "3:2", label: "3:2", value: 3 / 2 },
  { id: "4:3", label: "4:3", value: 4 / 3 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
  { id: "2.39:1", label: "2.39:1", value: 2.39 },
  { id: "1.85:1", label: "1.85:1", value: 1.85 },
  { id: "4:5", label: "4:5", value: 4 / 5 },
  { id: "9:16", label: "9:16", value: 9 / 16 },
];

export function getPerspectiveForPreset(presetId: string) {
  const preset = ASPECT_RATIO_PRESETS.find((ratioPreset) => ratioPreset.id === presetId);

  if (!preset || !preset.value) {
    return structuredClone(DEFAULT_CROP.perspective);
  }

  let width = 84;
  let height = width / preset.value;

  if (height > 84) {
    height = 84;
    width = height * preset.value;
  }

  const offsetX = (100 - width) / 2;
  const offsetY = (100 - height) / 2;

  return {
    tl: { x: offsetX, y: offsetY },
    tr: { x: offsetX + width, y: offsetY },
    br: { x: offsetX + width, y: offsetY + height },
    bl: { x: offsetX, y: offsetY + height },
  };
}

export const FONT_FAMILY_OPTIONS: { value: FontFamilyKey; label: string }[] = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
  { value: "mono", label: "Mono" },
  { value: "display", label: "Display" },
];

export const SHADOW_PRESET_OPTIONS: { value: ShadowPreset; label: string }[] = [
  { value: "none", label: "None" },
  { value: "soft", label: "Soft" },
  { value: "hard", label: "Hard" },
  { value: "neon", label: "Neon" },
];

export const BLEND_MODE_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "soft-light", label: "Soft Light" },
  { value: "multiply", label: "Multiply" },
];

export function getLookFilterId(lookId: string, acrosChannel: AcrosChannel) {
  if (lookId === "acros") {
    return `look-${lookId}-${acrosChannel}`;
  }

  return `look-${lookId}`;
}

export function getLookDefinition(lookId: string | null) {
  return ALL_LOOKS.find((look) => look.id === lookId) ?? null;
}

export function createInitialProjectState(): ProjectState {
  const defaultLook = getLookDefinition(DEFAULT_LOOK_ID);
  const normalizedLookAdjustments = normalizeLookAdjustments(
    defaultLook?.preset.adjustments,
  );

  return {
    imageSrc: null,
    imageName: null,
    activeLookId: defaultLook?.id ?? DEFAULT_LOOK_ID,
    filterIntensity: defaultLook?.preset.filterIntensity ?? 0,
    acrosChannel: "neutral",
    adjustments: {
      ...DEFAULT_ADJUSTMENTS,
      ...normalizedLookAdjustments,
    },
    textLayers: [],
    overlayLayers: defaultLook
      ? [createRecommendedGrainLayer(defaultLook.preset.grain)]
      : [],
    crop: structuredClone(DEFAULT_CROP),
  };
}
