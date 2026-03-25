import type {
  BlendMode,
  LookCategory,
  LookRenderRecipe,
  LookWashLayer,
} from "@/components/editor/types";

function wash(
  color: string,
  opacity: number,
  blendMode: BlendMode,
): LookWashLayer {
  return { color, opacity, blendMode };
}

const CATEGORY_RENDER_RECIPES: Record<LookCategory, LookRenderRecipe> = {
  fujifilm: {
    layerBlendMode: "normal",
    layerOpacity: 0.78,
    washes: [
      wash("#f3d8ae", 0.03, "screen"),
      wash("#70879d", 0.025, "soft-light"),
    ],
  },
  analog: {
    layerBlendMode: "soft-light",
    layerOpacity: 0.82,
    washes: [
      wash("#f4dcc0", 0.04, "screen"),
      wash("#a46f52", 0.035, "soft-light"),
    ],
  },
  cinema: {
    layerBlendMode: "overlay",
    layerOpacity: 0.8,
    washes: [
      wash("#315e73", 0.05, "multiply"),
      wash("#f8a465", 0.04, "screen"),
    ],
  },
  bw: {
    layerBlendMode: "normal",
    layerOpacity: 0.86,
    washes: [wash("#ece5db", 0.03, "screen")],
  },
};

const LOOK_RENDER_RECIPE_OVERRIDES: Record<string, Partial<LookRenderRecipe>> = {
  "provia-standard": {
    layerBlendMode: "normal",
    layerOpacity: 0.72,
    washes: [
      wash("#f5dcc0", 0.03, "screen"),
      wash("#6e879f", 0.022, "soft-light"),
    ],
  },
  velvia: {
    layerBlendMode: "overlay",
    layerOpacity: 0.84,
    washes: [
      wash("#24553a", 0.08, "multiply"),
      wash("#ffb145", 0.07, "screen"),
      wash("#174a2c", 0.03, "soft-light"),
    ],
  },
  "astia-soft": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.68,
    washes: [
      wash("#ffd9c7", 0.055, "screen"),
      wash("#c2b2cb", 0.038, "soft-light"),
    ],
  },
  "classic-chrome": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.8,
    washes: [
      wash("#627f8b", 0.065, "multiply"),
      wash("#dec48f", 0.05, "screen"),
      wash("#8c7e67", 0.03, "soft-light"),
    ],
  },
  "classic-negative": {
    layerBlendMode: "overlay",
    layerOpacity: 0.88,
    washes: [
      wash("#6f4131", 0.08, "multiply"),
      wash("#6b93a8", 0.055, "soft-light"),
      wash("#f2b279", 0.055, "screen"),
    ],
  },
  "eterna-cinema": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.76,
    washes: [
      wash("#4c6174", 0.055, "multiply"),
      wash("#ddd0b9", 0.04, "screen"),
    ],
  },
  "eterna-bleach-bypass": {
    layerBlendMode: "overlay",
    layerOpacity: 0.92,
    washes: [
      wash("#85909a", 0.07, "soft-light"),
      wash("#383838", 0.08, "multiply"),
    ],
  },
  acros: {
    layerBlendMode: "normal",
    layerOpacity: 0.92,
    washes: [
      wash("#ede7de", 0.035, "screen"),
      wash("#2f2f2f", 0.05, "soft-light"),
    ],
  },
  "nostalgic-negative": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.78,
    washes: [
      wash("#d18982", 0.075, "soft-light"),
      wash("#f7bf7e", 0.06, "screen"),
      wash("#f0d1ad", 0.03, "screen"),
    ],
  },
  "reala-ace": {
    layerBlendMode: "normal",
    layerOpacity: 0.7,
    washes: [
      wash("#f1dbb7", 0.028, "screen"),
      wash("#71856f", 0.022, "soft-light"),
    ],
  },
  "portra-400": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.8,
    washes: [
      wash("#f6dcc1", 0.05, "screen"),
      wash("#cb8f82", 0.04, "soft-light"),
    ],
  },
  "portra-160": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.72,
    washes: [
      wash("#f6e1c8", 0.04, "screen"),
      wash("#d6a999", 0.03, "soft-light"),
    ],
  },
  "kodak-gold-200": {
    layerBlendMode: "overlay",
    layerOpacity: 0.84,
    washes: [
      wash("#ffb95f", 0.085, "screen"),
      wash("#c7722c", 0.055, "soft-light"),
    ],
  },
  "ultramax-400": {
    layerBlendMode: "overlay",
    layerOpacity: 0.82,
    washes: [
      wash("#f3b66d", 0.065, "screen"),
      wash("#7e8f55", 0.045, "soft-light"),
    ],
  },
  "colorplus-200": {
    layerBlendMode: "normal",
    layerOpacity: 0.62,
    washes: [
      wash("#ffca9e", 0.024, "screen"),
      wash("#b8815c", 0.012, "soft-light"),
    ],
  },
  "cinestill-800t": {
    layerBlendMode: "overlay",
    layerOpacity: 0.86,
    washes: [
      wash("#29496d", 0.085, "multiply"),
      wash("#ff6b56", 0.06, "screen"),
      wash("#f7b28b", 0.03, "screen"),
    ],
  },
  "fuji-400h": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.78,
    washes: [
      wash("#92b59d", 0.05, "soft-light"),
      wash("#ffd8cd", 0.04, "screen"),
    ],
  },
  "fuji-superia-400": {
    layerBlendMode: "overlay",
    layerOpacity: 0.84,
    washes: [
      wash("#6f8d59", 0.06, "soft-light"),
      wash("#f0cf77", 0.05, "screen"),
    ],
  },
  "hp5-plus": {
    layerBlendMode: "normal",
    layerOpacity: 0.86,
    washes: [
      wash("#e8dfd3", 0.03, "screen"),
      wash("#333333", 0.055, "soft-light"),
    ],
  },
  "delta-3200": {
    layerBlendMode: "overlay",
    layerOpacity: 0.92,
    washes: [
      wash("#efebe5", 0.028, "screen"),
      wash("#262626", 0.08, "multiply"),
    ],
  },
  "kodachrome-64": {
    layerBlendMode: "overlay",
    layerOpacity: 0.86,
    washes: [
      wash("#b13c2d", 0.055, "soft-light"),
      wash("#f5ca62", 0.07, "screen"),
      wash("#39596b", 0.025, "multiply"),
    ],
  },
  "teal-and-orange": {
    layerBlendMode: "overlay",
    layerOpacity: 0.84,
    washes: [
      wash("#2b6973", 0.08, "multiply"),
      wash("#ff9a55", 0.07, "screen"),
    ],
  },
  "bleach-bypass": {
    layerBlendMode: "overlay",
    layerOpacity: 0.94,
    washes: [
      wash("#7f8790", 0.075, "soft-light"),
      wash("#363636", 0.09, "multiply"),
    ],
  },
  "day-for-night": {
    layerBlendMode: "multiply",
    layerOpacity: 0.9,
    washes: [
      wash("#183159", 0.14, "multiply"),
      wash("#7da2d9", 0.045, "screen"),
    ],
  },
  "cross-process": {
    layerBlendMode: "overlay",
    layerOpacity: 0.9,
    washes: [
      wash("#89a74c", 0.065, "soft-light"),
      wash("#67c8ff", 0.06, "screen"),
    ],
  },
  "matte-film": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.74,
    washes: [
      wash("#dfc8ac", 0.055, "screen"),
      wash("#6f7480", 0.04, "soft-light"),
    ],
  },
  "golden-hour": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.82,
    washes: [
      wash("#ffbd68", 0.1, "screen"),
      wash("#d98c6a", 0.05, "soft-light"),
    ],
  },
  moonlight: {
    layerBlendMode: "multiply",
    layerOpacity: 0.86,
    washes: [
      wash("#20365e", 0.1, "multiply"),
      wash("#82b7e1", 0.05, "screen"),
    ],
  },
  "dazz-nt16": {
    layerBlendMode: "overlay",
    layerOpacity: 0.84,
    washes: [
      wash("#ff92af", 0.06, "screen"),
      wash("#79bee2", 0.05, "soft-light"),
    ],
  },
  "dazz-grd": {
    layerBlendMode: "overlay",
    layerOpacity: 0.86,
    washes: [
      wash("#ffcf76", 0.07, "screen"),
      wash("#dc6c4f", 0.05, "soft-light"),
    ],
  },
  "dazz-s67": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.8,
    washes: [
      wash("#f2d6b3", 0.06, "screen"),
      wash("#729297", 0.04, "soft-light"),
    ],
  },
  "blade-runner-2049": {
    layerBlendMode: "overlay",
    layerOpacity: 0.88,
    washes: [
      wash("#ff9a3d", 0.1, "screen"),
      wash("#b0536d", 0.055, "soft-light"),
      wash("#4c2451", 0.04, "multiply"),
    ],
  },
  "the-matrix": {
    layerBlendMode: "overlay",
    layerOpacity: 0.92,
    washes: [
      wash("#214b31", 0.12, "multiply"),
      wash("#72b79c", 0.05, "soft-light"),
    ],
  },
  "neon-noir": {
    layerBlendMode: "overlay",
    layerOpacity: 0.9,
    washes: [
      wash("#ff5ca8", 0.08, "screen"),
      wash("#4bd8ff", 0.06, "screen"),
      wash("#1d285f", 0.07, "multiply"),
    ],
  },
  "wes-anderson": {
    layerBlendMode: "soft-light",
    layerOpacity: 0.78,
    washes: [
      wash("#e28a75", 0.06, "soft-light"),
      wash("#efc36d", 0.05, "screen"),
    ],
  },
  "wong-kar-wai": {
    layerBlendMode: "overlay",
    layerOpacity: 0.9,
    washes: [
      wash("#105b4d", 0.1, "multiply"),
      wash("#ff8d4d", 0.08, "screen"),
      wash("#9a3f4f", 0.055, "soft-light"),
    ],
  },
};

export function getLookRenderRecipe(
  lookId: string,
  category: LookCategory,
): LookRenderRecipe {
  const base = CATEGORY_RENDER_RECIPES[category];
  const override = LOOK_RENDER_RECIPE_OVERRIDES[lookId];

  if (!override) {
    return {
      ...base,
      washes: [...base.washes],
    };
  }

  return {
    layerBlendMode: override.layerBlendMode ?? base.layerBlendMode,
    layerOpacity: override.layerOpacity ?? base.layerOpacity,
    washes: override.washes ? [...override.washes] : [...base.washes],
  };
}
