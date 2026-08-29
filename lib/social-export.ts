import type { CropPoint, CropState } from "@/components/editor/types";

export const EXPORT_TARGET_IDS = [
  "instagram-feed",
  "story-reel",
  "universal-feed",
  "original",
] as const;

export type ExportTarget = (typeof EXPORT_TARGET_IDS)[number];

export interface ExportTargetDefinition {
  id: ExportTarget;
  label: string;
  shortLabel: string;
  detail: string;
  recommendedCrop: string;
  maxWidth: number;
  maxHeight: number;
  maxBytes: number | null;
}

export const EXPORT_TARGETS: readonly ExportTargetDefinition[] = [
  {
    id: "instagram-feed",
    label: "Instagram Feed",
    shortLabel: "Instagram",
    detail: "Up to 1080 × 1440 · sRGB JPG",
    recommendedCrop: "3:4, 4:5, 1:1, or 1.91:1",
    maxWidth: 1080,
    maxHeight: 1440,
    maxBytes: 8_000_000,
  },
  {
    id: "story-reel",
    label: "Story / Reel",
    shortLabel: "Story / Reel",
    detail: "Up to 1080 × 1920 · full-screen vertical",
    recommendedCrop: "9:16",
    maxWidth: 1080,
    maxHeight: 1920,
    maxBytes: 8_000_000,
  },
  {
    id: "universal-feed",
    label: "Universal Social",
    shortLabel: "Universal",
    detail: "Up to 1080 × 1350 · kept below 5 MB",
    recommendedCrop: "1:1 or 4:5",
    maxWidth: 1080,
    maxHeight: 1350,
    maxBytes: 4_800_000,
  },
  {
    id: "original",
    label: "Original / Archive",
    shortLabel: "Original",
    detail: "Source resolution · capped at 4096 px",
    recommendedCrop: "Any crop",
    maxWidth: 4096,
    maxHeight: 4096,
    maxBytes: null,
  },
] as const;

export function getExportTarget(target: ExportTarget): ExportTargetDefinition {
  return EXPORT_TARGETS.find((preset) => preset.id === target) ?? EXPORT_TARGETS[0];
}

export interface CropGeometry {
  points: CropState["perspective"];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  width: number;
  height: number;
  isAxisAligned: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function sanitizeCropPoint(
  point: CropPoint,
  sourceWidth: number,
  sourceHeight: number,
): CropPoint {
  return {
    x: (clamp(Number.isFinite(point.x) ? point.x : 0, 0, 100) / 100) * sourceWidth,
    y: (clamp(Number.isFinite(point.y) ? point.y : 0, 0, 100) / 100) * sourceHeight,
  };
}

function distance(first: CropPoint, second: CropPoint) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/**
 * Resolves the crop in source-image pixels. A rectangular crop keeps exact
 * source dimensions; a perspective crop uses the average opposing edge
 * lengths so it can be rectified without inheriting its larger bounding box.
 */
export function getCropGeometry(
  sourceWidth: number,
  sourceHeight: number,
  crop: CropState,
): CropGeometry {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const points = {
    tl: sanitizeCropPoint(crop.perspective.tl, safeWidth, safeHeight),
    tr: sanitizeCropPoint(crop.perspective.tr, safeWidth, safeHeight),
    br: sanitizeCropPoint(crop.perspective.br, safeWidth, safeHeight),
    bl: sanitizeCropPoint(crop.perspective.bl, safeWidth, safeHeight),
  };
  const xs = Object.values(points).map((point) => point.x);
  const ys = Object.values(points).map((point) => point.y);
  const epsilon = 0.01;
  const isAxisAligned =
    Math.abs(points.tl.y - points.tr.y) < epsilon &&
    Math.abs(points.bl.y - points.br.y) < epsilon &&
    Math.abs(points.tl.x - points.bl.x) < epsilon &&
    Math.abs(points.tr.x - points.br.x) < epsilon;

  return {
    points,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
    width: Math.max(1, (distance(points.tl, points.tr) + distance(points.bl, points.br)) / 2),
    height: Math.max(1, (distance(points.tl, points.bl) + distance(points.tr, points.br)) / 2),
    isAxisAligned,
  };
}

export function interpolateCropPoint(
  points: CropState["perspective"],
  u: number,
  v: number,
): CropPoint {
  const topX = points.tl.x + (points.tr.x - points.tl.x) * u;
  const topY = points.tl.y + (points.tr.y - points.tl.y) * u;
  const bottomX = points.bl.x + (points.br.x - points.bl.x) * u;
  const bottomY = points.bl.y + (points.br.y - points.bl.y) * u;

  return {
    x: topX + (bottomX - topX) * v,
    y: topY + (bottomY - topY) * v,
  };
}

/** Maps a source-image point into the rectified crop's normalized space. */
export function mapSourcePointToCrop(
  point: CropPoint,
  geometry: CropGeometry,
): CropPoint {
  const { points } = geometry;
  let u =
    (point.x - geometry.bounds.minX) /
    Math.max(1, geometry.bounds.maxX - geometry.bounds.minX);
  let v =
    (point.y - geometry.bounds.minY) /
    Math.max(1, geometry.bounds.maxY - geometry.bounds.minY);

  if (geometry.isAxisAligned) {
    return { x: u, y: v };
  }

  // Invert the bilinear quadrilateral mapping with a short Newton solve. This
  // keeps text anchored to the same visual position when an old project has a
  // true off-axis crop rather than a simple rectangle.
  for (let iteration = 0; iteration < 8; iteration++) {
    const current = interpolateCropPoint(points, u, v);
    const errorX = current.x - point.x;
    const errorY = current.y - point.y;

    if (Math.abs(errorX) + Math.abs(errorY) < 0.001) {
      break;
    }

    const duX =
      (points.tr.x - points.tl.x) * (1 - v) +
      (points.br.x - points.bl.x) * v;
    const duY =
      (points.tr.y - points.tl.y) * (1 - v) +
      (points.br.y - points.bl.y) * v;
    const dvX =
      (points.bl.x - points.tl.x) * (1 - u) +
      (points.br.x - points.tr.x) * u;
    const dvY =
      (points.bl.y - points.tl.y) * (1 - u) +
      (points.br.y - points.tr.y) * u;
    const determinant = duX * dvY - duY * dvX;

    if (Math.abs(determinant) < 0.000001) {
      break;
    }

    u -= (errorX * dvY - errorY * dvX) / determinant;
    v -= (duX * errorY - duY * errorX) / determinant;
  }

  return { x: u, y: v };
}

export function getCroppedSourceDimensions(
  sourceWidth: number,
  sourceHeight: number,
  crop: CropState,
) {
  const geometry = getCropGeometry(sourceWidth, sourceHeight, crop);

  return {
    width: geometry.width,
    height: geometry.height,
  };
}

function roundSocialDimension(value: number) {
  const rounded = Math.max(1, Math.round(value));
  return rounded > 2 ? Math.max(2, Math.floor(rounded / 2) * 2) : rounded;
}

export function resolveExportDimensions(
  sourceWidth: number,
  sourceHeight: number,
  target: ExportTarget,
) {
  const preset = getExportTarget(target);
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const scale = Math.min(
    1,
    preset.maxWidth / safeWidth,
    preset.maxHeight / safeHeight,
  );
  const width = safeWidth * scale;
  const height = safeHeight * scale;

  if (target === "original") {
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }

  // Even dimensions avoid an extra chroma-subsampling edge in common JPEG
  // encoders and video-backed social upload pipelines.
  return {
    width: roundSocialDimension(width),
    height: roundSocialDimension(height),
  };
}

export function getExportCompatibilityMessage(
  target: ExportTarget,
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0 || target === "original") {
    return null;
  }

  const ratio = width / height;

  if (target === "instagram-feed" && (ratio < 3 / 4 - 0.01 || ratio > 1.91 + 0.01)) {
    return "Instagram may crop this shape. Use 3:4, 4:5, 1:1, or 1.91:1.";
  }

  if (target === "story-reel" && Math.abs(ratio - 9 / 16) > 0.01) {
    return "Use the 9:16 crop to fill Stories and Reels without padding.";
  }

  if (target === "universal-feed" && (ratio < 4 / 5 - 0.01 || ratio > 1.91 + 0.01)) {
    return "For consistent feeds, use 4:5, 1:1, or 1.91:1.";
  }

  return null;
}
