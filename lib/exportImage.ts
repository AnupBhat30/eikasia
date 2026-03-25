import type { ProjectState, TextLayer } from "@/components/editor/types";
import type { LookDefinition } from "@/components/editor/types";
import { getLookDefinition } from "@/components/editor/constants";
import {
  getTextShadowStyle,
  resolveTextFontFamily,
} from "@/lib/text-style";

const EXPORT_SCALE = 1;
type RasterContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type RasterSource = ImageBitmap | HTMLImageElement;
type RasterProjectState = Pick<
  ProjectState,
  "activeLookId" | "filterIntensity" | "acrosChannel" | "adjustments" | "overlayLayers"
>;
type DrawSourceImage = (
  ctx: RasterContext,
  source: RasterSource,
  width: number,
  height: number,
) => void;

// ────────────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────────────

const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

const GRAIN_CACHE_LIMIT = 12;
const GRAIN_CACHE_MAX_PIXELS = 1_600_000;
const GRAIN_INTENSITY_BUCKET_STEP = 2;
const GRAIN_SIZE_BUCKET_STEP = 2;
const grainTextureCache = new Map<string, OffscreenCanvas | HTMLCanvasElement>();

function toneMapFilmic(value: number) {
  const mapped =
    (value * (2.51 * value + 0.03)) /
    (value * (2.43 * value + 0.59) + 0.14);

  return clamp(mapped, 0, 1);
}

function createWorkingCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getWorkingContext(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): RasterContext {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  return ctx;
}

function getSourceSize(source: RasterSource) {
  if ("naturalWidth" in source) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }

  return {
    width: source.width,
    height: source.height,
  };
}

export function drawCoverImage(
  ctx: RasterContext,
  source: RasterSource,
  width: number,
  height: number,
) {
  const { width: sourceWidth, height: sourceHeight } = getSourceSize(source);
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const destWidth = sourceWidth * scale;
  const destHeight = sourceHeight * scale;
  const destX = (width - destWidth) / 2;
  const destY = (height - destHeight) / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, destX, destY, destWidth, destHeight);
  ctx.restore();
}

export function renderProjectRaster({
  ctx,
  state,
  source,
  width,
  height,
  drawSource,
}: {
  ctx: RasterContext;
  state: RasterProjectState;
  source: RasterSource;
  width: number;
  height: number;
  drawSource: DrawSourceImage;
}) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, width, height);

  drawSource(ctx, source, width, height);

  const look = getLookDefinition(state.activeLookId);
  if (look && state.filterIntensity > 0) {
    compositeLookLayer(
      ctx,
      source,
      look,
      state.acrosChannel,
      width,
      height,
      state.filterIntensity / 100,
      drawSource,
    );
  }

  applyAdjustmentsToCanvas(ctx, state.adjustments, width, height);

  const { effectLayers, borderLayers } = resolveOverlayLayers(state);

  effectLayers.forEach((layer) =>
    compositeOverlayLayer(ctx, layer, width, height),
  );
  borderLayers.forEach((layer) =>
    compositeOverlayLayer(ctx, layer, width, height),
  );

  ctx.restore();
}

function resolveOverlayLayers(state: RasterProjectState) {
  const grainLayer =
    state.overlayLayers.find((layer) => layer.type === "grain") ??
    (state.adjustments.grainAmount > 0
      ? {
          id: "grain-adjustment",
          type: "grain" as const,
          presetId: "grain-subtle",
          opacity: 0.14,
          blendMode: "soft-light",
          intensity: 24,
          size: state.adjustments.grainSize,
        }
      : null);

  const mergedGrainLayer = grainLayer
    ? {
        ...grainLayer,
        opacity: clamp(
          (grainLayer.opacity ?? 0.14) + state.adjustments.grainAmount / 260,
          0,
          0.72,
        ),
        intensity: clamp(
          (grainLayer.intensity ?? 24) + state.adjustments.grainAmount * 0.35,
          0,
          100,
        ),
        size: grainLayer.size ?? state.adjustments.grainSize,
      }
    : null;

  const baseLayers = state.overlayLayers.filter((layer) => layer.type !== "grain");

  return {
    effectLayers: [
      ...(mergedGrainLayer ? [mergedGrainLayer] : []),
      ...baseLayers.filter((layer) => layer.type !== "border"),
    ],
    borderLayers: baseLayers.filter((layer) => layer.type === "border"),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main Export Pipeline
// ────────────────────────────────────────────────────────────────────────────

export async function exportProjectImage(
  state: ProjectState,
  format: "png" | "jpeg" = "jpeg",
  quality: number = 92,
): Promise<void> {
  const { imageSrc } = state;

  if (!imageSrc) {
    throw new Error("No image loaded");
  }

  try {
    // Ensure fonts are ready before text compositing
    await document.fonts.ready;

    // Preload source image as bitmap
    const sourceImg = await loadImageBitmap(imageSrc);
    const { width, height } = getExportDimensions(sourceImg, state.crop, EXPORT_SCALE);

    // Create offscreen canvas for export
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }

    renderProjectRaster({
      ctx,
      state,
      source: sourceImg,
      width,
      height,
      drawSource: (renderCtx, renderSource, renderWidth, renderHeight) =>
        drawCroppedImage(
          renderCtx,
          renderSource,
          state.crop,
          renderWidth,
          renderHeight,
        ),
    });

    // Composite text layers with proper blend modes
    for (const layer of state.textLayers) {
      compositeTextLayer(ctx, layer, width, height);
    }

    // ── Export to blob and trigger download ─────────────────────────────────
    const mimeType = format === "png" ? "image/png" : "image/jpeg";
    const exportQuality = format === "jpeg" ? quality / 100 : 1;

    const blob = await canvas.convertToBlob({
      type: mimeType,
      quality: exportQuality,
    });

    if (!blob) {
      throw new Error("Failed to create blob");
    }

    triggerDownload(blob, `eikasia-export-${Date.now()}.${format === "png" ? "png" : "jpg"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Export failed: ${message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Canvas Drawing Helpers
// ────────────────────────────────────────────────────────────────────────────

async function loadImageBitmap(src: string): Promise<ImageBitmap> {
  const response = await fetch(src, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Failed to load image: ${response.statusText}`);
  }
  const blob = await response.blob();
  return createImageBitmap(blob);
}

function getExportDimensions(
  img: RasterSource,
  crop: ProjectState["crop"],
  scale: number,
): { width: number; height: number } {
  const { width: sourceWidth, height: sourceHeight } = getSourceSize(img);
  const points = [crop.perspective.tl, crop.perspective.tr, crop.perspective.br, crop.perspective.bl];
  const xs = points.map((p) => (p.x * sourceWidth) / 100);
  const ys = points.map((p) => (p.y * sourceHeight) / 100);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rawW = maxX - minX;
  const rawH = maxY - minY;

  // Maximum dimension cap to prevent 33MB+ PNGs or crashes (e.g. 4k max)
  const MAX_DIM = 4096;
  let finalW = rawW * scale;
  let finalH = rawH * scale;

  if (finalW > MAX_DIM || finalH > MAX_DIM) {
    const ratio = Math.min(MAX_DIM / finalW, MAX_DIM / finalH);
    finalW *= ratio;
    finalH *= ratio;
  }

  return {
    width: Math.max(1, Math.round(finalW)),
    height: Math.max(1, Math.round(finalH)),
  };
}

export function drawCroppedImage(
  ctx: RasterContext,
  img: RasterSource,
  crop: ProjectState["crop"],
  canvasW: number,
  canvasH: number,
): void {
  const { width: sourceWidth, height: sourceHeight } = getSourceSize(img);
  // Use crop bounds to determine source region
  const points = [crop.perspective.tl, crop.perspective.tr, crop.perspective.br, crop.perspective.bl];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) / 100;
  const minY = Math.min(...ys) / 100;
  const maxX = Math.max(...xs) / 100;
  const maxY = Math.max(...ys) / 100;

  const srcX = sourceWidth * minX;
  const srcY = sourceHeight * minY;
  const srcW = sourceWidth * (maxX - minX);
  const srcH = sourceHeight * (maxY - minY);

  ctx.save();
  // Ensure we draw covering the whole destination
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // If rotation/flip is applied, we transform the context
  const centerX = canvasW / 2;
  const centerY = canvasH / 2;
  ctx.translate(centerX, centerY);
  ctx.rotate((crop.rotation * Math.PI) / 180);
  ctx.scale(crop.flipX ? -1 : 1, crop.flipY ? -1 : 1);
  ctx.translate(-centerX, -centerY);

  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvasW, canvasH);
  ctx.restore();
}

// ────────────────────────────────────────────────────────────────────────────
// Color Matrix Pipeline (SVG feColorMatrix as ImageData)
// ────────────────────────────────────────────────────────────────────────────

function resolveMatrix(look: LookDefinition, acrosChannel: string): string {
  if (look.id === "acros" && look.acrosChannels) {
    return look.acrosChannels[acrosChannel as keyof typeof look.acrosChannels] || look.matrix;
  }
  return look.matrix;
}

function applyColorMatrixToCanvas(
  ctx: RasterContext,
  matrixStr: string,
  intensity: number,
  w: number,
  h: number,
): void {
  const matrix = matrixStr.trim().split(/\s+/).map(Number);
  if (matrix.length !== 20) return;

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Faster loop with typed array
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // SVG Color Matrix: [m0...m4, m5...m9, m10...m14, m15...m19]
    // R' = m0*R + m1*G + m2*B + m3*A + m4*255
    const nr = matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4] * 255;
    const ng = matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9] * 255;
    const nb = matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14] * 255;

    // Direct linear interpolation + clamping
    data[i] = clampByte(r + (nr - r) * intensity);
    data[i + 1] = clampByte(g + (ng - g) * intensity);
    data[i + 2] = clampByte(b + (nb - b) * intensity);
  }

  ctx.putImageData(imageData, 0, 0);
}

type ParsedCssFilter =
  | { type: "brightness" | "contrast" | "saturate" | "sepia"; value: number }
  | { type: "hue-rotate"; value: number };

function compositeLookLayer(
  ctx: RasterContext,
  img: RasterSource,
  look: LookDefinition,
  acrosChannel: string,
  w: number,
  h: number,
  intensity: number,
  drawSource: DrawSourceImage,
): void {
  const lookCanvas = createWorkingCanvas(w, h);
  const lookCtx = getWorkingContext(lookCanvas);

  drawSource(lookCtx, img, w, h);
  applyColorMatrixToCanvas(lookCtx, resolveMatrix(look, acrosChannel), 1, w, h);
  applyCssFilterToCanvas(lookCtx, look.cssFilter, w, h);

  ctx.save();
  ctx.globalAlpha = clamp(intensity * look.renderRecipe.layerOpacity, 0, 1);
  ctx.globalCompositeOperation = blendModeToComposite(
    look.renderRecipe.layerBlendMode,
  );
  ctx.drawImage(lookCanvas, 0, 0);
  ctx.restore();

  look.renderRecipe.washes.forEach((wash) => {
    ctx.save();
    ctx.globalAlpha = clamp(intensity * wash.opacity, 0, 1);
    ctx.globalCompositeOperation = blendModeToComposite(wash.blendMode);
    ctx.fillStyle = wash.color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });
}

function applyCssFilterToCanvas(
  ctx: RasterContext,
  filterString: string,
  w: number,
  h: number,
): void {
  const operations = parseCssFilterString(filterString);

  if (!operations.length) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    operations.forEach((operation) => {
      switch (operation.type) {
        case "brightness":
          r *= operation.value;
          g *= operation.value;
          b *= operation.value;
          break;
        case "contrast":
          r = (r - 128) * operation.value + 128;
          g = (g - 128) * operation.value + 128;
          b = (b - 128) * operation.value + 128;
          break;
        case "saturate":
          {
            const lum = 0.213 * r + 0.715 * g + 0.072 * b;
            r = lum + (r - lum) * operation.value;
            g = lum + (g - lum) * operation.value;
            b = lum + (b - lum) * operation.value;
          }
          break;
        case "hue-rotate":
          {
            const angle = (operation.value * Math.PI) / 180;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const nextR =
              (0.213 + cos * 0.787 - sin * 0.213) * r +
              (0.715 - cos * 0.715 - sin * 0.715) * g +
              (0.072 - cos * 0.072 + sin * 0.928) * b;
            const nextG =
              (0.213 - cos * 0.213 + sin * 0.143) * r +
              (0.715 + cos * 0.285 + sin * 0.14) * g +
              (0.072 - cos * 0.072 - sin * 0.283) * b;
            const nextB =
              (0.213 - cos * 0.213 - sin * 0.787) * r +
              (0.715 - cos * 0.715 + sin * 0.715) * g +
              (0.072 + cos * 0.928 + sin * 0.072) * b;

            r = nextR;
            g = nextG;
            b = nextB;
          }
          break;
        case "sepia":
          {
            const nextR = 0.393 * r + 0.769 * g + 0.189 * b;
            const nextG = 0.349 * r + 0.686 * g + 0.168 * b;
            const nextB = 0.272 * r + 0.534 * g + 0.131 * b;

            r = r + (nextR - r) * operation.value;
            g = g + (nextG - g) * operation.value;
            b = b + (nextB - b) * operation.value;
          }
          break;
      }
    });

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }

  ctx.putImageData(imageData, 0, 0);
}

function parseCssFilterString(filterString: string): ParsedCssFilter[] {
  return Array.from(filterString.matchAll(/([a-z-]+)\(([^)]+)\)/g)).flatMap(
    ([, rawType, rawValue]) => {
      const value = parseCssFilterValue(rawType, rawValue);

      if (value === null) {
        return [];
      }

      if (rawType === "hue-rotate") {
        return [{ type: rawType, value }];
      }

      if (
        rawType === "brightness" ||
        rawType === "contrast" ||
        rawType === "saturate" ||
        rawType === "sepia"
      ) {
        return [{ type: rawType, value }];
      }

      return [];
    },
  );
}

function parseCssFilterValue(type: string, rawValue: string): number | null {
  if (type === "hue-rotate") {
    return Number.parseFloat(rawValue.replace("deg", ""));
  }

  const numericValue = Number.parseFloat(rawValue.replace("%", ""));

  if (Number.isNaN(numericValue)) {
    return null;
  }

  if (
    rawValue.includes("%") &&
    (type === "brightness" || type === "contrast" || type === "saturate")
  ) {
    return numericValue / 100;
  }

  return numericValue;
}

// ────────────────────────────────────────────────────────────────────────────
// Adjustments (Tone, Color, Fade, Vignette, Halation)
// ────────────────────────────────────────────────────────────────────────────

function applyAdjustmentsToCanvas(
  ctx: RasterContext,
  adj: ProjectState["adjustments"],
  w: number,
  h: number,
): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Per-channel LUT (tone + temperature + tint)
  const rLUT = new Uint8Array(256);
  const gLUT = new Uint8Array(256);
  const bLUT = new Uint8Array(256);

  // Temperature: warm boosts red and reduces blue, neutral at 5500K.
  const tempShift = (adj.temperature - 5500) / 4500;
  const rTemp = tempShift * 18;
  const bTemp = -tempShift * 22;

  // Tint: positive goes magenta, negative goes green.
  const tintShift = adj.tint / 100;
  const rTint = tintShift * 10;
  const gTint = -tintShift * 10;
  const exposureScale = Math.pow(2, (adj.exposure / 100) * 1.2);

  for (let i = 0; i < 256; i++) {
    const buildChannel = (offset: number): number => {
      let v = (i + offset) / 255;

      v *= exposureScale;

      if (v > 0.4) {
        v += (adj.highlights / 100) * 0.25 * ((v - 0.4) / 0.6);
      }

      if (v < 0.6) {
        v += (adj.shadows / 100) * 0.25 * ((0.6 - v) / 0.6);
      }

      v += (adj.whites / 100) * 0.15 * Math.max(0, v - 0.7);
      v += (adj.blacks / 100) * 0.15 * Math.max(0, 0.3 - v);

      if (adj.fade > 0) {
        const lift = (adj.fade / 100) * 0.14;
        v = v * (1 - lift) + lift;
      }

      if (v > 1) {
        v = toneMapFilmic(v);
      }

      return clampByte(v * 255);
    };

    rLUT[i] = buildChannel(rTemp + rTint);
    gLUT[i] = buildChannel(gTint);
    bLUT[i] = buildChannel(bTemp);
  }

  const satScale = 1 + adj.saturation / 100;
  const vibStrength = adj.vibrance / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = rLUT[data[i]];
    let g = gLUT[data[i + 1]];
    let b = bLUT[data[i + 2]];

    if (adj.saturation !== 0) {
      const lum = 0.213 * r + 0.715 * g + 0.072 * b;
      r = clampByte(lum + (r - lum) * satScale);
      g = clampByte(lum + (g - lum) * satScale);
      b = clampByte(lum + (b - lum) * satScale);
    }

    if (adj.vibrance !== 0) {
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
      const vibBoost = vibStrength * (1 - sat);
      const lum = 0.213 * r + 0.715 * g + 0.072 * b;
      r = clampByte(lum + (r - lum) * (1 + vibBoost));
      g = clampByte(lum + (g - lum) * (1 + vibBoost));
      b = clampByte(lum + (b - lum) * (1 + vibBoost));
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imageData, 0, 0);
  applyDetailAdjustments(ctx, adj, w, h);

  if (adj.vignetteAmount !== 0) {
    applyVignette(ctx, adj.vignetteAmount, adj.vignetteFeather, w, h);
  }

  if (adj.halation > 0) {
    applyHalation(ctx, adj.halation, w, h);
  }
}

function applyDetailAdjustments(
  ctx: RasterContext,
  adj: ProjectState["adjustments"],
  w: number,
  h: number,
) {
  if (
    adj.noiseReduction === 0 &&
    adj.clarity === 0 &&
    adj.texture === 0 &&
    adj.sharpness === 0
  ) {
    return;
  }

  if (adj.noiseReduction > 0) {
    mixBlurredCanvas(ctx, w, h, clamp(adj.noiseReduction / 180, 0, 0.45));
  }

  if (adj.clarity !== 0) {
    applyUnsharpMask(ctx, w, h, 1.8, adj.clarity / 240);
  }

  if (adj.texture !== 0) {
    applyUnsharpMask(ctx, w, h, 0.9, adj.texture / 320);
  }

  if (adj.sharpness !== 0) {
    applyUnsharpMask(ctx, w, h, 0.6, adj.sharpness / 180);
  }
}

function mixBlurredCanvas(
  ctx: RasterContext,
  w: number,
  h: number,
  amount: number,
) {
  const sourceCanvas = createWorkingCanvas(w, h);
  const sourceContext = getWorkingContext(sourceCanvas);
  sourceContext.drawImage(ctx.canvas as CanvasImageSource, 0, 0, w, h);

  const blurCanvas = createWorkingCanvas(w, h);
  const blurContext = getWorkingContext(blurCanvas);
  blurContext.filter = `blur(${Math.max(w, h) / 720}px)`;
  blurContext.drawImage(sourceCanvas, 0, 0, w, h);

  const original = ctx.getImageData(0, 0, w, h);
  const blurred = blurContext.getImageData(0, 0, w, h);

  for (let i = 0; i < original.data.length; i += 4) {
    original.data[i] = clampByte(
      original.data[i] + (blurred.data[i] - original.data[i]) * amount,
    );
    original.data[i + 1] = clampByte(
      original.data[i + 1] + (blurred.data[i + 1] - original.data[i + 1]) * amount,
    );
    original.data[i + 2] = clampByte(
      original.data[i + 2] + (blurred.data[i + 2] - original.data[i + 2]) * amount,
    );
  }

  ctx.putImageData(original, 0, 0);
}

function applyUnsharpMask(
  ctx: RasterContext,
  w: number,
  h: number,
  radius: number,
  amount: number,
) {
  if (amount === 0) {
    return;
  }

  const sourceCanvas = createWorkingCanvas(w, h);
  const sourceContext = getWorkingContext(sourceCanvas);
  sourceContext.drawImage(ctx.canvas as CanvasImageSource, 0, 0, w, h);

  const blurCanvas = createWorkingCanvas(w, h);
  const blurContext = getWorkingContext(blurCanvas);
  blurContext.filter = `blur(${radius}px)`;
  blurContext.drawImage(sourceCanvas, 0, 0, w, h);

  const original = ctx.getImageData(0, 0, w, h);
  const blurred = blurContext.getImageData(0, 0, w, h);

  for (let i = 0; i < original.data.length; i += 4) {
    original.data[i] = clampByte(
      original.data[i] +
        (original.data[i] - blurred.data[i]) * amount,
    );
    original.data[i + 1] = clampByte(
      original.data[i + 1] +
        (original.data[i + 1] - blurred.data[i + 1]) * amount,
    );
    original.data[i + 2] = clampByte(
      original.data[i + 2] +
        (original.data[i + 2] - blurred.data[i + 2]) * amount,
    );
  }

  ctx.putImageData(original, 0, 0);
}

function applyVignette(
  ctx: RasterContext,
  amount: number,
  feather: number,
  w: number,
  h: number,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const r1 = Math.max(w, h) * (0.28 + (feather / 100) * 0.36);
  const r2 = Math.max(w, h) * (0.72 + (feather / 100) * 0.2);
  const gradient = ctx.createRadialGradient(cx, cy, r1, cx, cy, r2);
  const alpha = (Math.abs(amount) / 100) * 0.88;
  const color =
    amount < 0 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
  const previousComposite = ctx.globalCompositeOperation;

  gradient.addColorStop(0, "transparent");
  gradient.addColorStop(1, color);

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = previousComposite;
}

function applyHalation(
  ctx: RasterContext,
  amount: number,
  w: number,
  h: number,
): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const halCanvas = createWorkingCanvas(w, h);
  const halCtx = getWorkingContext(halCanvas);
  const halData = halCtx.createImageData(w, h);
  const hal = halData.data;
  const threshold = 180;
  const strength = amount / 100;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.213 * data[i] + 0.715 * data[i + 1] + 0.072 * data[i + 2];

    if (lum > threshold) {
      const factor = ((lum - threshold) / (255 - threshold)) * strength;
      hal[i] = 255;
      hal[i + 1] = 0;
      hal[i + 2] = 0;
      hal[i + 3] = clampByte(factor * 120);
    }
  }

  halCtx.putImageData(halData, 0, 0);

  const previousComposite = ctx.globalCompositeOperation;
  const previousFilter = ctx.filter;

  ctx.globalCompositeOperation = "screen";
  ctx.filter = `blur(${Math.round(Math.max(w, h) / 80)}px)`;
  ctx.drawImage(halCanvas, 0, 0);
  ctx.filter = previousFilter;
  ctx.globalCompositeOperation = previousComposite;
}

// ────────────────────────────────────────────────────────────────────────────
// Overlay Compositing
// ────────────────────────────────────────────────────────────────────────────

function hashStringSeed(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let value = seed >>> 0;

  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function compositeOverlayLayer(
  ctx: RasterContext,
  layer: ProjectState["overlayLayers"][0],
  w: number,
  h: number,
): void {
  if (layer.opacity <= 0.005) {
    return;
  }

  const grainIntensity =
    layer.type === "grain" ? (layer.intensity ?? 34) / 100 : null;
  if (grainIntensity !== null && grainIntensity <= 0.005) {
    return;
  }

  const savedGlobalCompositeOperation = ctx.globalCompositeOperation;
  const savedGlobalAlpha = ctx.globalAlpha;
  const seed = hashStringSeed(layer.id || layer.presetId);

  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;

  if (layer.type === "grain") {
    // Draw procedural grain pattern
    drawGrainOverlay(ctx, w, h, grainIntensity ?? 0, layer.size ?? 40, seed);
  } else if (layer.type === "lightLeak") {
    drawLightLeakOverlay(ctx, w, h, layer.presetId);
  } else if (layer.type === "border") {
    drawBorderOverlay(ctx, w, h, layer.presetId);
  } else if (layer.type === "dust") {
    drawDustOverlay(ctx, w, h, seed);
  } else if (layer.type === "flare") {
    drawFlareOverlay(ctx, w, h, layer.position ?? 48);
  }

  ctx.globalAlpha = savedGlobalAlpha;
  ctx.globalCompositeOperation = savedGlobalCompositeOperation;
}

function drawGrainOverlay(
  ctx: RasterContext,
  w: number,
  h: number,
  intensity: number,
  size: number,
  seed: number,
): void {
  if (intensity <= 0.005 || w <= 0 || h <= 0) {
    return;
  }

  // Use a smaller noise buffer and scale it up to create "grain" rather than "digital noise"
  const noiseScale = clamp(0.5 - (size - 40) / 320, 0.22, 0.78);
  const nw = Math.max(1, Math.floor(w * noiseScale));
  const nh = Math.max(1, Math.floor(h * noiseScale));

  const noiseCanvas = getGrainTextureCanvas(nw, nh, intensity, size, seed);
  ctx.drawImage(noiseCanvas, 0, 0, w, h);
}

function getGrainTextureCanvas(
  nw: number,
  nh: number,
  intensity: number,
  size: number,
  seed: number,
) {
  const intensityBucket =
    Math.round((intensity * 100) / GRAIN_INTENSITY_BUCKET_STEP) *
    GRAIN_INTENSITY_BUCKET_STEP;
  const sizeBucket =
    Math.round(size / GRAIN_SIZE_BUCKET_STEP) * GRAIN_SIZE_BUCKET_STEP;
  const key = `${nw}x${nh}:${intensityBucket}:${sizeBucket}:${seed}`;
  const shouldCache = nw * nh <= GRAIN_CACHE_MAX_PIXELS;

  if (shouldCache) {
    const cached = grainTextureCache.get(key);
    if (cached) {
      grainTextureCache.delete(key);
      grainTextureCache.set(key, cached);
      return cached;
    }
  }

  const random = createSeededRandom(seed);
  const noiseCanvas = createWorkingCanvas(nw, nh);
  const nctx = getWorkingContext(noiseCanvas);
  const imageData = nctx.createImageData(nw, nh);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Luminance noise only (monochrome grain)
    const noise = (random() - 0.5) * 255 * (intensity * 1.5);
    const gray = 128 + noise;
    data[i] = data[i + 1] = data[i + 2] = clampByte(gray);
    data[i + 3] = 255;
  }

  nctx.putImageData(imageData, 0, 0);

  if (!shouldCache) {
    return noiseCanvas;
  }

  if (grainTextureCache.size >= GRAIN_CACHE_LIMIT) {
    const oldestKey = grainTextureCache.keys().next().value;
    if (oldestKey) {
      grainTextureCache.delete(oldestKey);
    }
  }

  grainTextureCache.set(key, noiseCanvas);
  return noiseCanvas;
}

function drawLightLeakOverlay(
  ctx: RasterContext,
  w: number,
  h: number,
  presetId: string,
): void {
  const gradientMap: Record<string, [number, number, string]> = {
    "left-burn": [0, 0.5, "radial"],
    "right-burn": [1, 0.45, "radial"],
    "top-flare": [0.5, -0.1, "radial"],
    "corner-flare": [0, 0, "radial"],
    "full-bloom": [0.5, 0.5, "radial"],
    "edge-leak": [0.5, 0.5, "linear"],
  };

  const [x, y, type] = gradientMap[presetId] || [0.5, 0.5, "radial"];

  if (type === "radial") {
    const gradient = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, Math.max(w, h));
    gradient.addColorStop(0, "rgba(255,180,100,0.8)");
    gradient.addColorStop(0.5, "rgba(255,120,60,0.3)");
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
  } else {
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0.2, "rgba(255,120,60,0.4)");
    gradient.addColorStop(0.8, "rgba(255,80,40,0.3)");
    ctx.fillStyle = gradient;
  }

  ctx.fillRect(0, 0, w, h);
}

function drawBorderOverlay(
  ctx: RasterContext,
  w: number,
  h: number,
  presetId: string,
): void {
  if (presetId === "kodak-border") {
    const borderW = Math.round(18 * (w / 960));
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, borderW);
    ctx.fillRect(0, h - borderW, w, borderW);
    ctx.fillRect(0, 0, borderW * 0.5, h);
    ctx.fillRect(w - borderW * 0.5, 0, borderW * 0.5, h);
  } else if (presetId === "negative-strip") {
    const stripW = Math.round(w * 0.08);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, stripW, h);
    ctx.fillRect(w - stripW, 0, stripW, h);
  } else if (presetId === "polaroid-border") {
    const side = Math.round(w * 0.048);
    const top = Math.round(h * 0.048);
    const bottom = Math.round(h * 0.148);
    ctx.fillStyle = "#ede8df";
    ctx.fillRect(0, 0, w, top);
    ctx.fillRect(0, h - bottom, w, bottom);
    ctx.fillRect(0, 0, side, h);
    ctx.fillRect(w - side, 0, side, h);
  }
}

function drawDustOverlay(
  ctx: RasterContext,
  w: number,
  h: number,
  seed: number,
): void {
  const random = createSeededRandom(seed);
  // Procedural dust specks and scratches
  ctx.fillStyle = "rgba(255,255,255,0.68)";
  const specks = 10;
  for (let i = 0; i < specks; i++) {
    const x = random() * w;
    const y = random() * h;
    const r = random() * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(random() * w * 0.2, random() * h);
    ctx.lineTo(random() * w * 0.2 + w * 0.05, random() * h);
    ctx.stroke();
  }
}

function drawFlareOverlay(
  ctx: RasterContext,
  w: number,
  h: number,
  position: number,
): void {
  const y = (h * position) / 100;
  const gradient = ctx.createLinearGradient(0, y - h * 0.1, 0, y + h * 0.1);
  gradient.addColorStop(0, "transparent");
  gradient.addColorStop(0.5, "rgba(82,182,255,0.6)");
  gradient.addColorStop(1, "transparent");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, y - h * 0.1, w, h * 0.2);
}

// ────────────────────────────────────────────────────────────────────────────
// Text Compositing
// ────────────────────────────────────────────────────────────────────────────

function compositeTextLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: TextLayer,
  w: number,
  h: number,
): void {
  const x = (w * layer.xPct) / 100;
  const y = (h * layer.yPct) / 100;
  const maxWidth = Math.max(24, (w * layer.widthPct) / 100);
  const fontSize = (h * layer.fontSizePct) / 100;
  const tracking = charSpacingToPixels(layer.letterSpacing, fontSize);
  const shadow = getTextShadowStyle(layer.shadowPreset, layer.color);

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode);
  ctx.fillStyle = layer.color;
  ctx.font = `${layer.fontStyle === "italic" ? "italic " : ""}${layer.fontWeight} ${fontSize}px ${resolveTextFontFamily(layer.fontFamily)}`;
  ctx.textBaseline = "top";

  const lines = wrapTextToLines(ctx, layer.text, maxWidth, tracking);
  const widestLine = Math.max(
    ...lines.map((line) => measureTrackedTextWidth(ctx, line, tracking)),
    0,
  );
  const lineAdvance = fontSize * layer.lineHeight;
  const blockHeight =
    fontSize + Math.max(0, lines.length - 1) * lineAdvance;
  const blockWidth = layer.backgroundColor ? maxWidth : widestLine;
  const blockTop = y - blockHeight / 2;
  const blockLeft = getAlignedBlockLeft(x, blockWidth, layer.textAlign);

  if (layer.backgroundColor) {
    const bgPadX = fontSize * 0.28;
    const bgPadY = fontSize * 0.22;

    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = layer.backgroundColor;
    ctx.fillRect(
      blockLeft - bgPadX,
      blockTop - bgPadY,
      blockWidth + bgPadX * 2,
      blockHeight + bgPadY * 2,
    );
    ctx.restore();
    ctx.fillStyle = layer.color;
  }

  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }

  lines.forEach((line, index) => {
    const lineY = blockTop + index * lineAdvance;
    drawTrackedTextLine(ctx, line, x, lineY, layer.textAlign, tracking);
  });

  ctx.restore();
}

function charSpacingToPixels(charSpacing: number, fontSize: number): number {
  if (!fontSize) {
    return 0;
  }

  return (charSpacing / 1000) * fontSize;
}

function measureTrackedTextWidth(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  tracking: number,
): number {
  if (!text) {
    return 0;
  }

  const chars = Array.from(text);
  const glyphWidth = chars.reduce(
    (sum, char) => sum + ctx.measureText(char).width,
    0,
  );

  return glyphWidth + Math.max(0, chars.length - 1) * tracking;
}

function wrapWordToLines(
  ctx: OffscreenCanvasRenderingContext2D,
  word: string,
  maxWidth: number,
  tracking: number,
): string[] {
  const segments: string[] = [];
  let current = "";

  for (const char of Array.from(word)) {
    const next = `${current}${char}`;

    if (!current || measureTrackedTextWidth(ctx, next, tracking) <= maxWidth) {
      current = next;
      continue;
    }

    segments.push(current);
    current = char;
  }

  if (current) {
    segments.push(current);
  }

  return segments;
}

function wrapTextToLines(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  tracking: number,
): string[] {
  const paragraphs = text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push("");
      return;
    }

    const words = paragraph.split(/\s+/);
    let current = "";

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;

      if (
        !current ||
        measureTrackedTextWidth(ctx, candidate, tracking) <= maxWidth
      ) {
        current = candidate;
        return;
      }

      lines.push(current);

      if (measureTrackedTextWidth(ctx, word, tracking) <= maxWidth) {
        current = word;
        return;
      }

      const wrappedWord = wrapWordToLines(ctx, word, maxWidth, tracking);
      const tail = wrappedWord.pop();

      lines.push(...wrappedWord);
      current = tail ?? "";
    });

    if (current) {
      lines.push(current);
    }
  });

  return lines.length ? lines : [""];
}

function getAlignedBlockLeft(
  x: number,
  blockWidth: number,
  textAlign: TextLayer["textAlign"],
) {
  switch (textAlign) {
    case "right":
      return x - blockWidth;
    case "center":
      return x - blockWidth / 2;
    case "left":
    default:
      return x;
  }
}

function drawTrackedTextLine(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  textAlign: TextLayer["textAlign"],
  tracking: number,
) {
  if (!text) {
    return;
  }

  if (tracking <= 0) {
    ctx.textAlign = textAlign as CanvasTextAlign;
    ctx.fillText(text, x, y);
    return;
  }

  const chars = Array.from(text);
  const totalWidth = measureTrackedTextWidth(ctx, text, tracking);
  let cursorX = x;

  if (textAlign === "center") {
    cursorX -= totalWidth / 2;
  } else if (textAlign === "right") {
    cursorX -= totalWidth;
  }

  ctx.textAlign = "left";

  chars.forEach((char) => {
    ctx.fillText(char, cursorX, y);
    cursorX += ctx.measureText(char).width + tracking;
  });
}

function blendModeToComposite(mode: string): GlobalCompositeOperation {
  switch (mode) {
    case "multiply":
      return "multiply";
    case "overlay":
      return "overlay";
    case "screen":
      return "screen";
    case "soft-light":
      return "soft-light";
    case "normal":
    default:
      return "source-over";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Download Trigger
// ────────────────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoke after delay to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}
