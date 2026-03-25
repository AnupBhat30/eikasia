import type { CSSProperties } from "react";

export const TAB_IDS = [
  "filters",
  "adjustments",
  "text",
  "overlays",
  "crop",
] as const;

export type EditorTabId = (typeof TAB_IDS)[number];
export type LookCategory = "fujifilm" | "analog" | "cinema" | "bw";
export type AcrosChannel = "neutral" | "red" | "yellow" | "green";
export type ShadowPreset = "none" | "soft" | "hard" | "neon";
export type BlendMode =
  | "normal"
  | "screen"
  | "multiply"
  | "overlay"
  | "soft-light";
export type FontFamilyKey = "serif" | "sans" | "mono" | "display";
export type OverlayType = "grain" | "lightLeak" | "flare" | "border" | "dust";

export interface LookWashLayer {
  color: string;
  opacity: number;
  blendMode: BlendMode;
}

export interface LookRenderRecipe {
  layerBlendMode: BlendMode;
  layerOpacity: number;
  washes: LookWashLayer[];
}

export interface LookPreset {
  filterIntensity: number;
  adjustments: Partial<Adjustments>;
  grain: {
    intensity: number;
    size: number;
    opacity: number;
    blendMode: BlendMode;
  };
}

export interface LookDefinition {
  id: string;
  name: string;
  summary: string;
  category: LookCategory;
  cssFilter: string;
  matrix: string;
  acrosChannels?: Record<AcrosChannel, string>;
  thumbnail: string;
  recommendedOverlay?: {
    intensity: number;
    size: number;
    opacity: number;
    blendMode: BlendMode;
  };
  renderRecipe: LookRenderRecipe;
  preset: LookPreset;
}

export interface TextLayer {
  id: string;
  presetId: string;
  text: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  fontSizePct: number;
  fontFamily: FontFamilyKey;
  color: string;
  opacity: number;
  letterSpacing: number;
  lineHeight: number;
  shadowPreset: ShadowPreset;
  blendMode: BlendMode;
  backgroundColor: string | null;
  fontStyle: "normal" | "italic";
  fontWeight: string;
  textAlign: "left" | "center" | "right";
}

export interface OverlayLayer {
  id: string;
  type: OverlayType;
  presetId: string;
  opacity: number;
  blendMode: CSSProperties["mixBlendMode"];
  intensity?: number;
  position?: number;
  size?: number;
}

export interface CropPoint {
  x: number;
  y: number;
}

export interface CropState {
  presetId: string;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  perspective: {
    tl: CropPoint;
    tr: CropPoint;
    br: CropPoint;
    bl: CropPoint;
  };
}

export interface Adjustments {
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  clarity: number;
  texture: number;
  sharpness: number;
  noiseReduction: number;
  grainAmount: number;
  grainSize: number;
  vignetteAmount: number;
  vignetteFeather: number;
  halation: number;
  fade: number;
}

export type AdjustmentKey = keyof Adjustments;

export interface ProjectState {
  imageSrc: string | null;
  imageName: string | null;
  activeLookId: string | null;
  filterIntensity: number;
  acrosChannel: AcrosChannel;
  adjustments: Adjustments;
  textLayers: TextLayer[];
  overlayLayers: OverlayLayer[];
  crop: CropState;
}

export interface TextPresetDefinition {
  id: string;
  name: string;
  text: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  fontSizePct: number;
  fontFamily: FontFamilyKey;
  color: string;
  opacity: number;
  letterSpacing: number;
  lineHeight: number;
  shadowPreset: ShadowPreset;
  blendMode: BlendMode;
  backgroundColor?: string | null;
  fontStyle?: "normal" | "italic";
  fontWeight?: string;
  textAlign?: "left" | "center" | "right";
}

export interface OverlayPresetDefinition {
  id: string;
  name: string;
  type: OverlayType;
  opacity: number;
  blendMode: CSSProperties["mixBlendMode"];
  intensity?: number;
  position?: number;
  size?: number;
}

export interface AdjustmentControlDefinition {
  key: AdjustmentKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  suffix?: string;
}

export interface AdjustmentGroupDefinition {
  id: string;
  label: string;
  controls: AdjustmentControlDefinition[];
}

export interface AspectRatioPreset {
  id: string;
  label: string;
  value: number | null;
}
