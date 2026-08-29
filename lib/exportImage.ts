import type { Adjustments, ProjectState, TextLayer } from "@/components/editor/types";
import type { LookDefinition } from "@/components/editor/types";
import {
  ADJUSTMENT_GROUPS,
  AUTO_GRAIN_LAYER_ID,
  DEFAULT_ADJUSTMENTS,
  getLookDefinition,
} from "@/components/editor/constants";
import {
  getFabricTextboxOptions,
  getScaledTextShadowOptions,
} from "@/lib/text-style";
import {
  getCropGeometry,
  getCroppedSourceDimensions,
  getExportTarget,
  interpolateCropPoint,
  mapSourcePointToCrop,
  resolveExportDimensions,
  type ExportTarget,
} from "@/lib/social-export";

type RasterContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type RasterSource = ImageBitmap | HTMLImageElement;
export type RasterProjectState = Pick<
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

const clampByte = (v: number): number =>
  Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : 0;
const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

const GRAIN_CACHE_LIMIT = 12;
const GRAIN_CACHE_MAX_PIXELS = 1_600_000;
const GRAIN_INTENSITY_BUCKET_STEP = 2;
const GRAIN_SIZE_BUCKET_STEP = 2;
const LOOK_CACHE_LIMIT_PER_SOURCE = 4;
const CROP_CACHE_LIMIT_PER_SOURCE = 4;
const CHROMA_STABILITY_MAX_DEVIATION = 172;
export const RENDERED_BORDER_PRESET_IDS = [
  "kodak-border",
  "negative-strip",
  "polaroid-border",
  "super8-border",
  "instax-border",
] as const;
const grainTextureCache = new Map<string, OffscreenCanvas | HTMLCanvasElement>();
const lookCanvasCache = new WeakMap<
  RasterSource,
  Map<string, OffscreenCanvas | HTMLCanvasElement>
>();
const cropCanvasCache = new WeakMap<
  RasterSource,
  Map<string, OffscreenCanvas | HTMLCanvasElement>
>();

export function packGamutMappedRgb(r: number, g: number, b: number): number {
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return 0;
  }

  const luminance = 0.213 * r + 0.715 * g + 0.072 * b;
  const targetLuminance = clamp(luminance, 0, 255);
  const redDelta = r - luminance;
  const greenDelta = g - luminance;
  const blueDelta = b - luminance;
  let chromaScale = 1;

  if (redDelta > 0) {
    chromaScale = Math.min(chromaScale, (255 - targetLuminance) / redDelta);
  } else if (redDelta < 0) {
    chromaScale = Math.min(chromaScale, -targetLuminance / redDelta);
  }

  if (greenDelta > 0) {
    chromaScale = Math.min(chromaScale, (255 - targetLuminance) / greenDelta);
  } else if (greenDelta < 0) {
    chromaScale = Math.min(chromaScale, -targetLuminance / greenDelta);
  }

  if (blueDelta > 0) {
    chromaScale = Math.min(chromaScale, (255 - targetLuminance) / blueDelta);
  } else if (blueDelta < 0) {
    chromaScale = Math.min(chromaScale, -targetLuminance / blueDelta);
  }

  const mappedR = clampByte(targetLuminance + redDelta * chromaScale);
  const mappedG = clampByte(targetLuminance + greenDelta * chromaScale);
  const mappedB = clampByte(targetLuminance + blueDelta * chromaScale);

  return (mappedR << 16) | (mappedG << 8) | mappedB;
}

export function toneMapFilmic(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  // Compress highlights with a continuous shoulder. The previous curve was
  // only applied above 1.0 even though it maps 1.0 to ~0.80, so a channel
  // crossing the boundary suddenly became darker and created cyan/magenta
  // posterization in bright areas.
  const shoulderStart = 0.92;

  if (value <= shoulderStart) {
    return value;
  }

  const shoulderRange = 1 - shoulderStart;
  const compressed =
    shoulderStart +
    shoulderRange *
      (1 - Math.exp(-(value - shoulderStart) / shoulderRange));

  return clamp(compressed, 0, 1);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

export function mapToneValue(value: number, adj: Adjustments) {
  const exposureScale = Math.pow(2, (adj.exposure / 100) * 1.2);
  let mapped = Math.max(0, value) * exposureScale;
  const tonalReference = clamp(mapped, 0, 1);

  // Use overlapping, smooth tonal masks. The old Whites/Blacks formulas
  // moved even their strongest pixels by only ~4.5%, which made both controls
  // appear broken. These ranges remain localized but are deliberately visible.
  const highlightMask = smoothstep(0.35, 0.95, tonalReference);
  const shadowMask = 1 - smoothstep(0.05, 0.65, tonalReference);
  const whiteMask = smoothstep(0.68, 0.98, tonalReference);
  const blackMask = 1 - smoothstep(0.02, 0.38, tonalReference);

  mapped += (adj.highlights / 100) * 0.22 * highlightMask;
  mapped += (adj.shadows / 100) * 0.22 * shadowMask;
  mapped += (adj.whites / 100) * 0.18 * whiteMask;
  mapped += (adj.blacks / 100) * 0.16 * blackMask;

  if (adj.fade > 0) {
    const lift = (adj.fade / 100) * 0.14;
    mapped = mapped * (1 - lift) + lift;
  }

  return mapped > 0.92
    ? toneMapFilmic(mapped)
    : clamp(mapped, 0, 1);
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
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
    colorSpace: "srgb",
  }) as RasterContext | null;

  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  return ctx;
}

function getLookCanvas(
  source: RasterSource,
  look: LookDefinition,
  acrosChannel: string,
  width: number,
  height: number,
  drawSource: DrawSourceImage,
  sourceVariantKey: string,
) {
  const sourceCache = lookCanvasCache.get(source) ?? new Map();
  const cacheKey = `${sourceVariantKey}:${look.id}:${acrosChannel}:${width}x${height}`;
  const cached = sourceCache.get(cacheKey);

  if (cached) {
    sourceCache.delete(cacheKey);
    sourceCache.set(cacheKey, cached);
    return cached;
  }

  const canvas = createWorkingCanvas(width, height);
  const context = getWorkingContext(canvas);
  drawSource(context, source, width, height);
  applyLookTransformToCanvas(
    context,
    look.cssFilter,
    resolveMatrix(look, acrosChannel),
    width,
    height,
  );

  sourceCache.set(cacheKey, canvas);
  lookCanvasCache.set(source, sourceCache);

  while (sourceCache.size > LOOK_CACHE_LIMIT_PER_SOURCE) {
    const oldestKey = sourceCache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    sourceCache.delete(oldestKey);
  }

  return canvas;
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
  sourceVariantKey = "full-source",
}: {
  ctx: RasterContext;
  state: RasterProjectState;
  source: RasterSource;
  width: number;
  height: number;
  drawSource: DrawSourceImage;
  sourceVariantKey?: string;
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
      sourceVariantKey,
    );
  }

  const effectiveAdjustments = resolveEffectiveAdjustments(state);
  applyAdjustmentsToCanvas(ctx, effectiveAdjustments, width, height);

  const { effectLayers, borderLayers } = resolveOverlayLayers({
    ...state,
    adjustments: effectiveAdjustments,
  });

  effectLayers.forEach((layer) =>
    compositeOverlayLayer(ctx, layer, width, height),
  );
  borderLayers.forEach((layer) =>
    compositeOverlayLayer(ctx, layer, width, height),
  );

  ctx.restore();
}

export function resolveEffectiveAdjustments(
  state: RasterProjectState,
): Adjustments {
  const look = getLookDefinition(state.activeLookId);
  const lookMix = look ? clamp(state.filterIntensity / 100, 0, 1) : 0;
  const resolved = { ...DEFAULT_ADJUSTMENTS };

  for (const group of ADJUSTMENT_GROUPS) {
    for (const control of group.controls) {
      const key = control.key;
      const neutralValue = DEFAULT_ADJUSTMENTS[key];
      const manualDelta = state.adjustments[key] - neutralValue;
      const lookValue =
        key === "grainAmount" || key === "grainSize"
          ? neutralValue
          : (look?.preset.adjustments[key] ?? neutralValue);
      const lookDelta = (lookValue - neutralValue) * lookMix;

      resolved[key] = clamp(
        neutralValue + lookDelta + manualDelta,
        control.min,
        control.max,
      );
    }
  }

  return resolved;
}

export function resolveOverlayLayers(state: RasterProjectState) {
  const manualGrainAmount = clamp(state.adjustments.grainAmount, 0, 100);
  const grainLayer =
    state.overlayLayers.find((layer) => layer.type === "grain") ??
    (manualGrainAmount > 0
      ? {
          id: "grain-adjustment",
          type: "grain" as const,
          presetId: "grain-subtle",
          opacity: 0,
          blendMode: "soft-light",
          intensity: 0,
          size: DEFAULT_ADJUSTMENTS.grainSize,
        }
      : null);

  const mergedGrainLayer = grainLayer
    ? grainLayer.id === "grain-adjustment"
      ? {
          ...grainLayer,
          opacity: clamp(manualGrainAmount / 220, 0, 0.5),
          intensity: clamp(manualGrainAmount * 0.65, 0, 100),
          size: clamp(state.adjustments.grainSize, 0, 100),
        }
      : {
          ...grainLayer,
          opacity: clamp(
            (grainLayer.opacity ?? 0.14) *
              (grainLayer.id === AUTO_GRAIN_LAYER_ID
                ? clamp(state.filterIntensity / 100, 0, 1)
                : 1) +
              manualGrainAmount / 260,
            0,
            0.72,
          ),
          intensity: clamp(
            (grainLayer.intensity ?? 24) + manualGrainAmount * 0.35,
            0,
            100,
          ),
          size: clamp(
            (grainLayer.size ?? DEFAULT_ADJUSTMENTS.grainSize) +
              (state.adjustments.grainSize - DEFAULT_ADJUSTMENTS.grainSize),
            0,
            100,
          ),
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

export interface ExportImageOptions {
  format?: "png" | "jpeg";
  quality?: number;
  target?: ExportTarget;
  stageSize?: { width: number; height: number };
}

export interface ExportImageResult {
  width: number;
  height: number;
  bytes: number;
  quality: number;
  target: ExportTarget;
  blob: Blob;
  filename: string;
}

export async function exportProjectImage(
  state: ProjectState,
  options: ExportImageOptions = {},
): Promise<ExportImageResult> {
  const { imageSrc } = state;
  const {
    format = "jpeg",
    quality = 92,
    target = "instagram-feed",
    stageSize,
  } = options;

  if (!imageSrc) {
    throw new Error("No image loaded");
  }

  let sourceImg: RasterSource | null = null;

  try {
    // Ensure fonts are ready before text compositing
    await document.fonts.ready;

    // Preload source image as bitmap
    sourceImg = await loadRasterSource(imageSrc);
    const { width: sourceWidth, height: sourceHeight } = getSourceSize(sourceImg);
    const cropGeometry = getCropGeometry(sourceWidth, sourceHeight, state.crop);
    const croppedSize = getCroppedSourceDimensions(
      sourceWidth,
      sourceHeight,
      state.crop,
    );
    const { width, height } = resolveExportDimensions(
      croppedSize.width,
      croppedSize.height,
      target,
    );

    // Create offscreen canvas for export
    const canvas = createWorkingCanvas(width, height);
    const ctx = getWorkingContext(canvas);
    const hasCropTransform =
      Math.abs(state.crop.rotation) > 0.000_001 ||
      state.crop.flipX ||
      state.crop.flipY;
    const compositionCanvas = hasCropTransform
      ? createWorkingCanvas(width, height)
      : canvas;
    const compositionContext = hasCropTransform
      ? getWorkingContext(compositionCanvas)
      : ctx;

    compositionContext.imageSmoothingEnabled = true;
    compositionContext.imageSmoothingQuality = "high";

    renderProjectRaster({
      ctx: compositionContext,
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
          false,
        ),
    });

    // Text is added to the same untransformed composition as raster effects.
    // The completed composition is transformed once below, matching the
    // editor's shared CSS transform for image, overlays, and text.
    const fabric = state.textLayers.length ? await import("fabric") : null;

    for (const layer of state.textLayers) {
      const mappedPosition = mapSourcePointToCrop(
        {
          x: (layer.xPct / 100) * sourceWidth,
          y: (layer.yPct / 100) * sourceHeight,
        },
        cropGeometry,
      );
      const mappedLayer = {
        ...layer,
        xPct: mappedPosition.x * 100,
        yPct: mappedPosition.y * 100,
        widthPct:
          (((layer.widthPct / 100) * sourceWidth) / cropGeometry.width) * 100,
        fontSizePct:
          (((layer.fontSizePct / 100) * sourceHeight) / cropGeometry.height) * 100,
      };
      if (fabric) {
        compositeTextLayer(
          compositionContext,
          mappedLayer,
          width,
          height,
          fabric,
          stageSize,
        );
      }
    }

    if (hasCropTransform) {
      const centerX = width / 2;
      const centerY = height / 2;
      ctx.save();
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, 0, width, height);
      ctx.translate(centerX, centerY);
      ctx.rotate((state.crop.rotation * Math.PI) / 180);
      ctx.scale(state.crop.flipX ? -1 : 1, state.crop.flipY ? -1 : 1);
      ctx.translate(-centerX, -centerY);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(compositionCanvas, 0, 0, width, height);
      ctx.restore();
    }

    // Encode once, then let the UI decide whether to preview, share, or
    // download. Native mobile sharing requires a fresh user activation, so it
    // cannot be invoked reliably at the end of this asynchronous render.
    const mimeType = format === "png" ? "image/png" : "image/jpeg";
    const exportQuality = format === "jpeg" ? quality / 100 : 1;

    const encoded = await encodeCanvasWithinLimit(
      canvas,
      mimeType,
      exportQuality,
      getExportTarget(target).maxBytes,
    );
    const extension = format === "png" ? "png" : "jpg";
    const targetSlug = target === "original" ? "original" : target;
    const filename =
      `eikasia-${targetSlug}-${width}x${height}-${Date.now()}.${extension}`;

    return {
      width,
      height,
      bytes: encoded.blob.size,
      quality: Math.round(encoded.quality * 100),
      target,
      blob: encoded.blob,
      filename,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Export failed: ${message}`);
  } finally {
    if (sourceImg && "close" in sourceImg) {
      sourceImg.close();
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Canvas Drawing Helpers
// ────────────────────────────────────────────────────────────────────────────

async function loadRasterSource(src: string): Promise<RasterSource> {
  if (typeof createImageBitmap === "function") {
    try {
      const response = await fetch(src, { credentials: "same-origin" });
      if (response.ok) {
        return await createImageBitmap(await response.blob());
      }
    } catch {
      // Older mobile browsers can expose createImageBitmap without supporting
      // every source type. Fall through to the image element path.
    }
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode source image"));
    image.src = src;
  });
}

function encodeCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to encode image"));
          }
        },
        type,
        quality,
      );
    });
  }

  return canvas.convertToBlob({ type, quality });
}

async function encodeCanvasWithinLimit(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  requestedQuality: number,
  maxBytes: number | null,
) {
  const quality = clamp(requestedQuality, 0.4, 1);
  const initialBlob = await encodeCanvas(canvas, type, quality);

  if (type !== "image/jpeg" || maxBytes === null || initialBlob.size <= maxBytes) {
    return { blob: initialBlob, quality };
  }

  // X and LinkedIn reject images above 5 MB. Search for the highest JPEG
  // quality that stays just under their shared limit instead of failing the
  // upload or asking the platform to perform a harsher emergency transcode.
  let low = 0.5;
  let high = quality;
  let bestBlob = await encodeCanvas(canvas, type, low);
  let bestQuality = low;

  for (let attempt = 0; attempt < 7; attempt++) {
    const candidateQuality = (low + high) / 2;
    const candidateBlob = await encodeCanvas(canvas, type, candidateQuality);

    if (candidateBlob.size <= maxBytes) {
      bestBlob = candidateBlob;
      bestQuality = candidateQuality;
      low = candidateQuality;
    } else {
      high = candidateQuality;
    }
  }

  return { blob: bestBlob, quality: bestQuality };
}

export function drawCroppedImage(
  ctx: RasterContext,
  img: RasterSource,
  crop: ProjectState["crop"],
  canvasW: number,
  canvasH: number,
  applyCropTransform = true,
): void {
  const croppedCanvas = getRectifiedCropCanvas(img, crop, canvasW, canvasH);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const centerX = canvasW / 2;
  const centerY = canvasH / 2;
  if (applyCropTransform) {
    ctx.translate(centerX, centerY);
    ctx.rotate((crop.rotation * Math.PI) / 180);
    ctx.scale(crop.flipX ? -1 : 1, crop.flipY ? -1 : 1);
    ctx.translate(-centerX, -centerY);
  }
  ctx.drawImage(croppedCanvas, 0, 0, canvasW, canvasH);
  ctx.restore();
}

function getRectifiedCropCanvas(
  img: RasterSource,
  crop: ProjectState["crop"],
  canvasW: number,
  canvasH: number,
) {
  const { width: sourceWidth, height: sourceHeight } = getSourceSize(img);
  const geometry = getCropGeometry(sourceWidth, sourceHeight, crop);
  const width = Math.max(1, Math.round(canvasW));
  const height = Math.max(1, Math.round(canvasH));
  const pointKey = [
    geometry.points.tl,
    geometry.points.tr,
    geometry.points.br,
    geometry.points.bl,
  ]
    .map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
    .join(":");
  const cacheKey = `${width}x${height}:${pointKey}`;
  const sourceCache = cropCanvasCache.get(img) ?? new Map();
  const cached = sourceCache.get(cacheKey);

  if (cached) {
    sourceCache.delete(cacheKey);
    sourceCache.set(cacheKey, cached);
    return cached;
  }

  const canvas = createWorkingCanvas(width, height);
  const context = getWorkingContext(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (geometry.isAxisAligned) {
    const sourceCropWidth = Math.max(1, geometry.bounds.maxX - geometry.bounds.minX);
    const sourceCropHeight = Math.max(1, geometry.bounds.maxY - geometry.bounds.minY);
    context.drawImage(
      img,
      geometry.bounds.minX,
      geometry.bounds.minY,
      sourceCropWidth,
      sourceCropHeight,
      0,
      0,
      width,
      height,
    );
  } else {
    drawPerspectiveCropMesh(context, img, geometry.points, width, height);
  }

  sourceCache.set(cacheKey, canvas);
  cropCanvasCache.set(img, sourceCache);

  while (sourceCache.size > CROP_CACHE_LIMIT_PER_SOURCE) {
    const oldestKey = sourceCache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    sourceCache.delete(oldestKey);
  }

  return canvas;
}

function drawPerspectiveCropMesh(
  ctx: RasterContext,
  img: RasterSource,
  points: ProjectState["crop"]["perspective"],
  width: number,
  height: number,
) {
  // Canvas2D has no native quadrilateral draw. Subdividing the crop into a
  // modest mesh gives a stable perspective correction while keeping export
  // memory bounded on mobile browsers.
  const columns = clamp(Math.ceil(width / 72), 8, 24);
  const rows = clamp(Math.ceil(height / 72), 8, 24);

  for (let row = 0; row < rows; row++) {
    const v0 = row / rows;
    const v1 = (row + 1) / rows;
    const y0 = (row * height) / rows;
    const y1 = ((row + 1) * height) / rows;

    for (let column = 0; column < columns; column++) {
      const u0 = column / columns;
      const u1 = (column + 1) / columns;
      const x0 = (column * width) / columns;
      const x1 = ((column + 1) * width) / columns;
      const sourceTopLeft = interpolateCropPoint(points, u0, v0);
      const sourceTopRight = interpolateCropPoint(points, u1, v0);
      const sourceBottomRight = interpolateCropPoint(points, u1, v1);
      const sourceBottomLeft = interpolateCropPoint(points, u0, v1);

      drawImageTriangle(
        ctx,
        img,
        [sourceTopLeft, sourceTopRight, sourceBottomRight],
        [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
        ],
      );
      drawImageTriangle(
        ctx,
        img,
        [sourceTopLeft, sourceBottomRight, sourceBottomLeft],
        [
          { x: x0, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ],
      );
    }
  }
}

function drawImageTriangle(
  ctx: RasterContext,
  img: RasterSource,
  source: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
  destination: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
) {
  const [s0, s1, s2] = source;
  const [d0, d1, d2] = destination;
  const denominator =
    s0.x * (s1.y - s2.y) +
    s1.x * (s2.y - s0.y) +
    s2.x * (s0.y - s1.y);

  if (Math.abs(denominator) < 0.000001) {
    return;
  }

  const a =
    (d0.x * (s1.y - s2.y) +
      d1.x * (s2.y - s0.y) +
      d2.x * (s0.y - s1.y)) /
    denominator;
  const c =
    (d0.x * (s2.x - s1.x) +
      d1.x * (s0.x - s2.x) +
      d2.x * (s1.x - s0.x)) /
    denominator;
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    denominator;
  const b =
    (d0.y * (s1.y - s2.y) +
      d1.y * (s2.y - s0.y) +
      d2.y * (s0.y - s1.y)) /
    denominator;
  const d =
    (d0.y * (s2.x - s1.x) +
      d1.y * (s0.x - s2.x) +
      d2.y * (s1.x - s0.x)) /
    denominator;
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    denominator;
  const center = {
    x: (d0.x + d1.x + d2.x) / 3,
    y: (d0.y + d1.y + d2.y) / 3,
  };
  const expanded = destination.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;

    return {
      x: point.x + (dx / length) * 0.55,
      y: point.y + (dy / length) * 0.55,
    };
  });

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(expanded[0].x, expanded[0].y);
  ctx.lineTo(expanded[1].x, expanded[1].y);
  ctx.lineTo(expanded[2].x, expanded[2].y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// ────────────────────────────────────────────────────────────────────────────
// Color pipeline (CSS filters + SVG feColorMatrix in a single ImageData pass)
// ────────────────────────────────────────────────────────────────────────────

function resolveMatrix(look: LookDefinition, acrosChannel: string): string {
  if (look.id === "acros" && look.acrosChannels) {
    return look.acrosChannels[acrosChannel as keyof typeof look.acrosChannels] || look.matrix;
  }
  return look.matrix;
}

type ParsedCssFilter =
  | { type: "brightness" | "contrast" | "saturate" | "sepia"; value: number }
  | { type: "hue-rotate"; value: number; cos: number; sin: number };

const parsedFilterCache = new Map<string, readonly ParsedCssFilter[]>();
const parsedMatrixCache = new Map<string, readonly number[]>();

function getParsedFilter(filterString: string): readonly ParsedCssFilter[] {
  const cached = parsedFilterCache.get(filterString);

  if (cached) {
    return cached;
  }

  const parsed = parseCssFilterString(filterString);
  parsedFilterCache.set(filterString, parsed);
  return parsed;
}

function getParsedMatrix(matrixStr: string): readonly number[] | null {
  const cached = parsedMatrixCache.get(matrixStr);

  if (cached) {
    return cached;
  }

  const parsed = matrixStr.trim().split(/\s+/).map(Number);

  if (parsed.length !== 20 || parsed.some((value) => !Number.isFinite(value))) {
    return null;
  }

  parsedMatrixCache.set(matrixStr, parsed);
  return parsed;
}

function applyLookTransformToCanvas(
  ctx: RasterContext,
  filterString: string,
  matrixStr: string,
  w: number,
  h: number,
): void {
  const matrix = getParsedMatrix(matrixStr);

  if (!matrix) {
    return;
  }

  const operations = getParsedFilter(filterString);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const m0 = matrix[0];
  const m1 = matrix[1];
  const m2 = matrix[2];
  const m3 = matrix[3];
  const m4 = matrix[4] * 255;
  const m5 = matrix[5];
  const m6 = matrix[6];
  const m7 = matrix[7];
  const m8 = matrix[8];
  const m9 = matrix[9] * 255;
  const m10 = matrix[10];
  const m11 = matrix[11];
  const m12 = matrix[12];
  const m13 = matrix[13];
  const m14 = matrix[14] * 255;

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    const a = data[i + 3];

    for (let operationIndex = 0; operationIndex < operations.length; operationIndex++) {
      const operation = operations[operationIndex];

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
        case "saturate": {
          const luminance = 0.213 * r + 0.715 * g + 0.072 * b;
          r = luminance + (r - luminance) * operation.value;
          g = luminance + (g - luminance) * operation.value;
          b = luminance + (b - luminance) * operation.value;
          break;
        }
        case "hue-rotate": {
          const nextR =
            (0.213 + operation.cos * 0.787 - operation.sin * 0.213) * r +
            (0.715 - operation.cos * 0.715 - operation.sin * 0.715) * g +
            (0.072 - operation.cos * 0.072 + operation.sin * 0.928) * b;
          const nextG =
            (0.213 - operation.cos * 0.213 + operation.sin * 0.143) * r +
            (0.715 + operation.cos * 0.285 + operation.sin * 0.14) * g +
            (0.072 - operation.cos * 0.072 - operation.sin * 0.283) * b;
          const nextB =
            (0.213 - operation.cos * 0.213 - operation.sin * 0.787) * r +
            (0.715 - operation.cos * 0.715 + operation.sin * 0.715) * g +
            (0.072 + operation.cos * 0.928 + operation.sin * 0.072) * b;

          r = nextR;
          g = nextG;
          b = nextB;
          break;
        }
        case "sepia": {
          const nextR = 0.393 * r + 0.769 * g + 0.189 * b;
          const nextG = 0.349 * r + 0.686 * g + 0.168 * b;
          const nextB = 0.272 * r + 0.534 * g + 0.131 * b;

          r += (nextR - r) * operation.value;
          g += (nextG - g) * operation.value;
          b += (nextB - b) * operation.value;
          break;
        }
      }

      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        r = 0;
        g = 0;
        b = 0;
        break;
      }
    }

    const packed = packGamutMappedRgb(
      m0 * r + m1 * g + m2 * b + m3 * a + m4,
      m5 * r + m6 * g + m7 * b + m8 * a + m9,
      m10 * r + m11 * g + m12 * b + m13 * a + m14,
    );
    data[i] = packed >> 16;
    data[i + 1] = (packed >> 8) & 0xff;
    data[i + 2] = packed & 0xff;
  }

  ctx.putImageData(imageData, 0, 0);
}

function compositeLookLayer(
  ctx: RasterContext,
  img: RasterSource,
  look: LookDefinition,
  acrosChannel: string,
  w: number,
  h: number,
  intensity: number,
  drawSource: DrawSourceImage,
  sourceVariantKey: string,
): void {
  const lookCanvas = getLookCanvas(
    img,
    look,
    acrosChannel,
    w,
    h,
    drawSource,
    sourceVariantKey,
  );

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

function parseCssFilterString(filterString: string): ParsedCssFilter[] {
  const operations: ParsedCssFilter[] = [];

  for (const [, rawType, rawValue] of filterString.matchAll(
    /([a-z-]+)\(([^)]+)\)/g,
  )) {
    const value = parseCssFilterValue(rawType, rawValue);

    if (value === null) {
      continue;
    }

    if (rawType === "hue-rotate") {
      const angle = (value * Math.PI) / 180;
      operations.push({
        type: rawType,
        value,
        cos: Math.cos(angle),
        sin: Math.sin(angle),
      });
      continue;
    }

    if (
      rawType === "brightness" ||
      rawType === "contrast" ||
      rawType === "saturate" ||
      rawType === "sepia"
    ) {
      operations.push({ type: rawType, value });
    }
  }

  return operations;
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
  for (let i = 0; i < 256; i++) {
    const buildChannel = (offset: number): number => {
      return clampByte(mapToneValue((i + offset) / 255, adj) * 255);
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
      r = lum + (r - lum) * satScale;
      g = lum + (g - lum) * satScale;
      b = lum + (b - lum) * satScale;
    }

    if (adj.vibrance !== 0) {
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
      const vibBoost = vibStrength * (1 - sat);
      const lum = 0.213 * r + 0.715 * g + 0.072 * b;
      r = lum + (r - lum) * (1 + vibBoost);
      g = lum + (g - lum) * (1 + vibBoost);
      b = lum + (b - lum) * (1 + vibBoost);
    }

    const packed = packGamutMappedRgb(r, g, b);
    r = packed >> 16;
    g = (packed >> 8) & 0xff;
    b = packed & 0xff;

    const lum = 0.213 * r + 0.715 * g + 0.072 * b;
    const dr = r - lum;
    const dg = g - lum;
    const db = b - lum;
    const chromaDeviation = Math.max(
      Math.abs(dr),
      Math.abs(dg),
      Math.abs(db),
    );

    if (chromaDeviation > CHROMA_STABILITY_MAX_DEVIATION) {
      const chromaScale = CHROMA_STABILITY_MAX_DEVIATION / chromaDeviation;
      r = clampByte(lum + dr * chromaScale);
      g = clampByte(lum + dg * chromaScale);
      b = clampByte(lum + db * chromaScale);
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
    applyEdgePreservingNoiseReduction(ctx, w, h, adj.noiseReduction);
  }

  // Keep the perceived radius stable between low-resolution interaction,
  // settled preview, and full export instead of treating it as a raw pixel size.
  const radiusScale = clamp(Math.max(w, h) / 1000, 0.45, 5);

  if (adj.clarity !== 0) {
    applyUnsharpMask(ctx, w, h, 1.8 * radiusScale, adj.clarity / 240);
  }

  if (adj.texture !== 0) {
    applyUnsharpMask(ctx, w, h, 0.9 * radiusScale, adj.texture / 320);
  }

  if (adj.sharpness !== 0) {
    applyUnsharpMask(ctx, w, h, 0.6 * radiusScale, adj.sharpness / 180);
  }
}

export function resolveNoiseReductionParameters(
  amount: number,
  maxDimension: number,
) {
  const strength = Math.pow(clamp(amount / 100, 0, 1), 0.78);
  const radiusScale = clamp(maxDimension / 1000, 0.45, 5);

  return {
    strength,
    radius: radiusScale * (0.65 + strength * 1.85),
    lumaMix: strength * (0.42 + strength * 0.44),
    chromaMix: strength * (0.62 + strength * 0.34),
    edgeThreshold: 6 + strength * 18,
  };
}

function applyEdgePreservingNoiseReduction(
  ctx: RasterContext,
  w: number,
  h: number,
  amount: number,
) {
  const settings = resolveNoiseReductionParameters(amount, Math.max(w, h));
  const padding = Math.max(2, Math.ceil(settings.radius * 3));
  const paddedWidth = w + padding * 2;
  const paddedHeight = h + padding * 2;
  const source = ctx.canvas as CanvasImageSource;
  const paddedCanvas = createWorkingCanvas(paddedWidth, paddedHeight);
  const paddedContext = getWorkingContext(paddedCanvas);

  // Extend the outermost pixels before blurring. Transparent pixels outside a
  // canvas otherwise darken the image perimeter at stronger denoise settings.
  paddedContext.drawImage(source, 0, 0, w, h, padding, padding, w, h);
  paddedContext.drawImage(source, 0, 0, w, 1, padding, 0, w, padding);
  paddedContext.drawImage(source, 0, h - 1, w, 1, padding, padding + h, w, padding);
  paddedContext.drawImage(source, 0, 0, 1, h, 0, padding, padding, h);
  paddedContext.drawImage(source, w - 1, 0, 1, h, padding + w, padding, padding, h);
  paddedContext.drawImage(source, 0, 0, 1, 1, 0, 0, padding, padding);
  paddedContext.drawImage(source, w - 1, 0, 1, 1, padding + w, 0, padding, padding);
  paddedContext.drawImage(source, 0, h - 1, 1, 1, 0, padding + h, padding, padding);
  paddedContext.drawImage(
    source,
    w - 1,
    h - 1,
    1,
    1,
    padding + w,
    padding + h,
    padding,
    padding,
  );

  const blurCanvas = createWorkingCanvas(paddedWidth, paddedHeight);
  const blurContext = getWorkingContext(blurCanvas);
  blurContext.filter = `blur(${settings.radius}px)`;
  blurContext.drawImage(paddedCanvas, 0, 0, paddedWidth, paddedHeight);

  const original = ctx.getImageData(0, 0, w, h);
  const blurred = blurContext.getImageData(padding, padding, w, h);
  const originalData = original.data;
  const blurredData = blurred.data;
  const edgeThresholdSquared = settings.edgeThreshold ** 2;

  for (let i = 0; i < originalData.length; i += 4) {
    const originalR = originalData[i];
    const originalG = originalData[i + 1];
    const originalB = originalData[i + 2];
    const blurredR = blurredData[i];
    const blurredG = blurredData[i + 1];
    const blurredB = blurredData[i + 2];
    const originalLuma =
      0.213 * originalR + 0.715 * originalG + 0.072 * originalB;
    const blurredLuma =
      0.213 * blurredR + 0.715 * blurredG + 0.072 * blurredB;
    const lumaDifference = originalLuma - blurredLuma;
    const edgeWeight =
      edgeThresholdSquared /
      (edgeThresholdSquared + lumaDifference * lumaDifference * 2.5);
    const lumaMix = settings.lumaMix * edgeWeight;
    const chromaMix = settings.chromaMix * (0.15 + edgeWeight * 0.85);
    const outputLuma = originalLuma - lumaDifference * lumaMix;

    originalData[i] = clampByte(
      outputLuma +
        (originalR - originalLuma) +
        ((blurredR - blurredLuma) - (originalR - originalLuma)) * chromaMix,
    );
    originalData[i + 1] = clampByte(
      outputLuma +
        (originalG - originalLuma) +
        ((blurredG - blurredLuma) - (originalG - originalLuma)) * chromaMix,
    );
    originalData[i + 2] = clampByte(
      outputLuma +
        (originalB - originalLuma) +
        ((blurredB - blurredLuma) - (originalB - originalLuma)) * chromaMix,
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
    const originalR = original.data[i];
    const originalG = original.data[i + 1];
    const originalB = original.data[i + 2];
    const blurredR = blurred.data[i];
    const blurredG = blurred.data[i + 1];
    const blurredB = blurred.data[i + 2];

    // Sharpen luminance only to avoid color fringing and blotchy chroma noise.
    const originalLum =
      0.213 * originalR + 0.715 * originalG + 0.072 * originalB;
    const blurredLum =
      0.213 * blurredR + 0.715 * blurredG + 0.072 * blurredB;
    const lumDelta = (originalLum - blurredLum) * amount;

    original.data[i] = clampByte(originalR + lumDelta);
    original.data[i + 1] = clampByte(originalG + lumDelta);
    original.data[i + 2] = clampByte(originalB + lumDelta);
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

  // Generate grain in normalized image space so the same seeded pattern stays
  // locked to the photo when preview resolution changes. Basing texture size
  // on output pixels made the grain visibly pop between draft, full, and export.
  const aspect = clamp(Math.round((w / h) * 100) / 100, 0.2, 5);
  const grainScale = clamp(1 - (size - 20) / 100, 0.3, 0.9);
  const longSide = Math.max(192, Math.round(768 * grainScale));
  const nw = aspect >= 1 ? longSide : Math.max(1, Math.round(longSide * aspect));
  const nh = aspect >= 1 ? Math.max(1, Math.round(longSide / aspect)) : longSide;

  const noiseCanvas = getGrainTextureCanvas(nw, nh, intensity, size, seed);
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(noiseCanvas, 0, 0, w, h);
  ctx.imageSmoothingEnabled = smoothing;
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
    const borderW = Math.max(1, Math.round(w * 0.022));
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, borderW);
    ctx.fillRect(0, h - borderW, w, borderW);
    ctx.fillRect(0, 0, borderW * 0.5, h);
    ctx.fillRect(w - borderW * 0.5, 0, borderW * 0.5, h);
  } else if (presetId === "negative-strip") {
    const stripW = Math.max(2, Math.round(w * 0.085));
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, stripW, h);
    ctx.fillRect(w - stripW, 0, stripW, h);

    const holeWidth = Math.max(1, stripW * 0.38);
    const holeHeight = Math.max(2, h * 0.026);
    const holeGap = Math.max(2, h * 0.052);
    const holeInset = (stripW - holeWidth) / 2;
    ctx.fillStyle = "rgba(238,224,190,0.82)";

    for (let y = holeGap * 0.45; y < h; y += holeGap) {
      ctx.fillRect(holeInset, y, holeWidth, holeHeight);
      ctx.fillRect(w - stripW + holeInset, y, holeWidth, holeHeight);
    }
  } else if (presetId === "polaroid-border") {
    const side = Math.round(w * 0.048);
    const top = Math.round(h * 0.048);
    const bottom = Math.round(h * 0.148);
    ctx.fillStyle = "#ede8df";
    ctx.fillRect(0, 0, w, top);
    ctx.fillRect(0, h - bottom, w, bottom);
    ctx.fillRect(0, 0, side, h);
    ctx.fillRect(w - side, 0, side, h);
  } else if (presetId === "super8-border") {
    const side = Math.max(2, Math.round(w * 0.065));
    const top = Math.max(2, Math.round(h * 0.035));
    const bottom = Math.max(2, Math.round(h * 0.055));
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, w, top);
    ctx.fillRect(0, h - bottom, w, bottom);
    ctx.fillRect(0, 0, side, h);
    ctx.fillRect(w - side * 0.72, 0, side * 0.72, h);

    ctx.fillStyle = "rgba(242,229,190,0.72)";
    const perforationWidth = Math.max(1, side * 0.28);
    const perforationHeight = Math.max(2, h * 0.036);
    const perforationGap = Math.max(2, h * 0.078);
    for (let y = perforationGap * 0.4; y < h; y += perforationGap) {
      ctx.fillRect(
        side * 0.22,
        y,
        perforationWidth,
        perforationHeight,
      );
    }
  } else if (presetId === "instax-border") {
    const side = Math.max(2, Math.round(w * 0.052));
    const top = Math.max(2, Math.round(h * 0.052));
    const bottom = Math.max(2, Math.round(h * 0.19));
    ctx.fillStyle = "#f4f1e9";
    ctx.fillRect(0, 0, w, top);
    ctx.fillRect(0, h - bottom, w, bottom);
    ctx.fillRect(0, 0, side, h);
    ctx.fillRect(w - side, 0, side, h);

    ctx.strokeStyle = "rgba(82,78,70,0.18)";
    ctx.lineWidth = Math.max(1, Math.round(Math.min(w, h) * 0.002));
    ctx.strokeRect(side, top, w - side * 2, h - top - bottom);
  }
}

function drawDustOverlay(
  ctx: RasterContext,
  w: number,
  h: number,
  seed: number,
): void {
  const random = createSeededRandom(seed);
  const detailScale = clamp(Math.min(w, h) / 800, 0.6, 5);
  // Procedural dust specks and scratches
  ctx.fillStyle = "rgba(255,255,255,0.68)";
  const specks = 10;
  for (let i = 0; i < specks; i++) {
    const x = random() * w;
    const y = random() * h;
    const r = Math.max(0.45, random() * 1.5 * detailScale);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  ctx.lineWidth = Math.max(0.5, 0.5 * detailScale);
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
  ctx: RasterContext,
  layer: TextLayer,
  w: number,
  h: number,
  fabric: Pick<typeof import("fabric"), "Shadow" | "StaticCanvas" | "Textbox">,
  stageSize?: { width: number; height: number },
): void {
  // Create a temporary HTML canvas in the browser document
  const tempCanvasEl = document.createElement("canvas");
  tempCanvasEl.width = w;
  tempCanvasEl.height = h;

  // Initialize a Fabric StaticCanvas on it
  const staticCanvas = new fabric.StaticCanvas(tempCanvasEl, {
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  });

  // Calculate the options for the Fabric Textbox using the shared builder
  const options = getFabricTextboxOptions(layer, w, h);

  // Create the Textbox object
  const textbox = new fabric.Textbox(layer.text, {
    ...options,
    editable: false,
  } as ConstructorParameters<typeof fabric.Textbox>[1]);

  // Calculate shadow scaling factor:
  // Ratio of export canvas height to the preview stage height.
  // Default to 1 if stageSize is not available.
  const scaleFactor = stageSize?.height ? h / stageSize.height : 1;
  const shadow = getScaledTextShadowOptions(
    layer.shadowPreset,
    layer.color,
    scaleFactor,
  );
  textbox.shadow = shadow ? new fabric.Shadow(shadow) : null;

  // Add the textbox to the canvas and render
  staticCanvas.add(textbox);
  staticCanvas.renderAll();

  // Composite the rendered temporary canvas onto the export context
  ctx.save();
  // Fabric already applies the layer opacity while drawing the textbox and
  // its background. Applying it again here made exports more transparent than
  // both editor renderers.
  ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode);
  ctx.drawImage(tempCanvasEl, 0, 0);
  ctx.restore();

  // Dispose of the static canvas to free resources
  staticCanvas.dispose();
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

export function downloadImageBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoke after delay to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
