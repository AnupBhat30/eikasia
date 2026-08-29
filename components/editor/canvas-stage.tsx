"use client";

import * as React from "react";
import { Canvas, Shadow, Textbox } from "fabric";
import { Check, Trash2, Upload } from "lucide-react";

import {
  ASPECT_RATIO_PRESETS,
  BLEND_MODE_OPTIONS,
  FONT_FAMILY_OPTIONS,
  SHADOW_PRESET_OPTIONS,
  getLookDefinition,
} from "@/components/editor/constants";
import { useEditor } from "@/components/editor/editor-context";
import type {
  BlendMode,
  CropPoint,
  FontFamilyKey,
  ProjectState,
  ShadowPreset,
  TextLayer,
} from "@/components/editor/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  getFabricTextboxOptions,
  getScaledTextShadowOptions,
  resolveTextFontFamily,
} from "@/lib/text-style";
import {
  drawCoverImage,
  drawCroppedImage,
  renderProjectRaster,
  type RasterProjectState,
} from "@/lib/exportImage";
import {
  canvasViewportTransform,
  normalizeCanvasViewport,
  translateCanvasViewport,
  zoomCanvasViewportAtPoint,
  type CanvasViewport,
  type ViewportPoint,
} from "@/lib/canvas-viewport";
import { selectPendingPreviewJob } from "@/lib/preview-render-scheduling";
import {
  getCropGeometry,
  interpolateCropPoint,
  mapSourcePointToCrop,
  type CropGeometry,
} from "@/lib/social-export";
import { clamp, cn, fromPercentage, round, toPercentage } from "@/lib/utils";

type EditorTextbox = Textbox & {
  data?: {
    layerId: string;
  };
  globalCompositeOperation?: string;
  hiddenTextarea?: HTMLTextAreaElement | null;
  isEditing?: boolean;
  exitEditing?: () => EditorTextbox;
};

interface StageSize {
  width: number;
  height: number;
}

type CropPerspective = ProjectState["crop"]["perspective"];
type PreviewQuality = "fast" | "full";

interface PreviewRenderJob {
  revision: number;
  quality: PreviewQuality;
  width: number;
  height: number;
  state: RasterProjectState;
  crop: ProjectState["crop"] | null;
}

type PreviewWorkerResponse =
  | { type: "ready" }
  | {
      type: "rendered";
      revision: number;
      quality: PreviewQuality;
      width: number;
      height: number;
      bitmap: ImageBitmap;
    }
  | { type: "error"; message: string };

const CONTAINER_SIZE_JITTER_TOLERANCE_PX = 2;
const CONTAINER_SIZE_SETTLE_MS = 80;
const PREVIEW_FULL_SETTLE_MS = 140;
const PREVIEW_FALLBACK_FULL_SETTLE_MS = 260;

export interface CanvasStageHandle {
  getElement: () => HTMLDivElement | null;
  deselectText: () => void;
  editSelectedText: () => void;
  getStageSize: () => { width: number; height: number };
}

function useContainerSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const previousSizeRef = React.useRef({ width: 0, height: 0 });

  React.useEffect(() => {
    const node = ref.current;

    if (!node) {
      return;
    }

    let frame = 0;
    let settleTimeout = 0;
    let pendingSize: { width: number; height: number } | null = null;
    const commitSize = (width: number, height: number) => {
      const previous = previousSizeRef.current;

      if (
        Math.abs(previous.width - width) <=
          CONTAINER_SIZE_JITTER_TOLERANCE_PX &&
        Math.abs(previous.height - height) <= CONTAINER_SIZE_JITTER_TOLERANCE_PX
      ) {
        return;
      }

      previousSizeRef.current = { width, height };
      setSize({ width, height });
    };

    const scheduleCommit = (width: number, height: number) => {
      pendingSize = { width, height };

      if (settleTimeout) {
        window.clearTimeout(settleTimeout);
      }

      settleTimeout = window.setTimeout(() => {
        settleTimeout = 0;

        if (!pendingSize) {
          return;
        }

        commitSize(pendingSize.width, pendingSize.height);
        pendingSize = null;
      }, CONTAINER_SIZE_SETTLE_MS);
    };

    const update = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const rect = node.getBoundingClientRect();
        const width = Math.max(0, Math.round(rect.width));
        const height = Math.max(0, Math.round(rect.height));
        scheduleCommit(width, height);
      });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      if (settleTimeout) {
        window.clearTimeout(settleTimeout);
      }
    };
  }, [ref]);

  return size;
}

function fitStage(
  natural: StageSize | null,
  available: StageSize,
  constrainToAvailable = false,
): StageSize {
  const minSide = Math.min(available.width, available.height);
  const compactness = clamp((760 - minSide) / 240, 0, 1);
  const minWidth = Math.round(320 - 100 * compactness);
  const minHeight = Math.round(220 - 60 * compactness);
  const horizontalPadding = Math.round(96 - 68 * compactness);
  const verticalPadding = Math.round(96 - 68 * compactness);
  const maxWidth = Math.max(
    available.width - horizontalPadding,
    constrainToAvailable ? 1 : minWidth,
  );
  const maxHeight = Math.max(
    available.height - verticalPadding,
    constrainToAvailable ? 1 : minHeight,
  );

  if (!natural || !natural.width || !natural.height) {
    return {
      width: Math.round(Math.min(960 - 240 * compactness, maxWidth)),
      height: Math.round(Math.min(620 - 100 * compactness, maxHeight)),
    };
  }

  const scale = Math.min(maxWidth / natural.width, maxHeight / natural.height);

  return {
    // Never clamp the two axes independently: doing so changes the visible
    // aspect ratio for narrow/ultrawide crops and makes the workspace disagree
    // with the exported pixels.
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

function mapTextLayerToCropWorkspace(
  layer: TextLayer,
  geometry: CropGeometry | null,
  sourceSize: StageSize | null,
): TextLayer {
  if (!geometry || !sourceSize) {
    return layer;
  }

  const position = mapSourcePointToCrop(
    {
      x: (layer.xPct / 100) * sourceSize.width,
      y: (layer.yPct / 100) * sourceSize.height,
    },
    geometry,
  );

  return {
    ...layer,
    xPct: position.x * 100,
    yPct: position.y * 100,
    widthPct:
      (((layer.widthPct / 100) * sourceSize.width) / geometry.width) * 100,
    fontSizePct:
      (((layer.fontSizePct / 100) * sourceSize.height) / geometry.height) * 100,
  };
}

function mapTextLayerFromCropWorkspace(
  layer: TextLayer,
  geometry: CropGeometry | null,
  sourceSize: StageSize | null,
): TextLayer {
  if (!geometry || !sourceSize) {
    return layer;
  }

  const position = interpolateCropPoint(
    geometry.points,
    layer.xPct / 100,
    layer.yPct / 100,
  );

  return {
    ...layer,
    xPct: (position.x / sourceSize.width) * 100,
    yPct: (position.y / sourceSize.height) * 100,
    widthPct:
      (((layer.widthPct / 100) * geometry.width) / sourceSize.width) * 100,
    fontSizePct:
      (((layer.fontSizePct / 100) * geometry.height) / sourceSize.height) * 100,
  };
}

function inferFontFamily(fontFamily?: string): FontFamilyKey {
  if (!fontFamily) {
    return "sans";
  }

  if (fontFamily.includes("jetbrains") || fontFamily.includes("mono")) {
    return "mono";
  }

  if (fontFamily.includes("cormorant")) {
    return "serif";
  }

  if (fontFamily.includes("playfair")) {
    return "display";
  }

  return "sans";
}

function blendModeToComposite(mode: BlendMode) {
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

function inferBlendMode(mode?: string): BlendMode {
  switch (mode) {
    case "multiply":
      return "multiply";
    case "overlay":
      return "overlay";
    case "screen":
      return "screen";
    case "soft-light":
      return "soft-light";
    default:
      return "normal";
  }
}

function charSpacingToPixels(charSpacing: number, fontSize: number) {
  if (!fontSize) {
    return 0;
  }

  return (charSpacing / 1000) * fontSize;
}

function pixelsToCharSpacing(pixels: number, fontSize: number) {
  if (!fontSize) {
    return 0;
  }

  return (pixels / fontSize) * 1000;
}

function inferShadowPreset(shadow?: Shadow | null): ShadowPreset {
  if (!shadow) {
    return "none";
  }

  if ((shadow.blur ?? 0) >= 40) {
    return "neon";
  }

  if (
    (shadow.blur ?? 0) <= 6 &&
    ((shadow.offsetX ?? 0) > 1 || (shadow.offsetY ?? 0) > 1)
  ) {
    return "hard";
  }

  return "soft";
}

function exitTextboxEditing(textbox: EditorTextbox | null | undefined) {
  if (!textbox?.isEditing || typeof textbox.exitEditing !== "function") {
    return false;
  }

  textbox.exitEditing();
  textbox.hiddenTextarea?.blur();
  textbox.setCoords();

  return true;
}

function applyLayerToTextbox(
  textbox: EditorTextbox,
  layer: TextLayer,
  stageSize: StageSize,
) {
  const options = getFabricTextboxOptions(layer, stageSize.width, stageSize.height);

  textbox.set({
    ...options,
    editable: false,
    hoverCursor: "move",
    moveCursor: "move",
    padding: Math.max(4, Math.round(options.fontSize * 0.05)),
    lockScalingX: false,
    lockScalingY: false,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    transparentCorners: false,
    cornerStyle: "circle",
    cornerColor: "#f59e0b",
    cornerStrokeColor: "#ffffff",
    borderColor: "#f59e0b",
    cornerSize: 14,
    touchCornerSize: 28,
    borderDashArray: [4, 4],
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
  } as never);

  const layoutTextbox = textbox as EditorTextbox & {
    initDimensions?: () => void;
    dirty?: boolean;
  };

  layoutTextbox.initDimensions?.();
  layoutTextbox.dirty = true;
  textbox.setControlsVisibility({
    mt: true,
    mb: true,
    ml: true,
    mr: true,
    tl: true,
    tr: true,
    bl: true,
    br: true,
    mtr: false,
  });
  const shadow = getScaledTextShadowOptions(
    layer.shadowPreset,
    layer.color,
    1,
  );
  textbox.shadow = shadow ? new Shadow(shadow) : null;
  textbox.globalCompositeOperation = blendModeToComposite(layer.blendMode);
  textbox.data = { layerId: layer.id };
  textbox.setCoords();
}

function keepTextboxPartiallyVisible(
  textbox: EditorTextbox,
  stageSize: StageSize,
) {
  const halfWidth = (textbox.getScaledWidth?.() ?? textbox.width ?? 0) / 2;
  const halfHeight = (textbox.getScaledHeight?.() ?? textbox.height ?? 0) / 2;
  const minVisible = Math.max(
    24,
    Math.min(stageSize.width, stageSize.height) * 0.03,
  );
  const minLeft = -halfWidth + minVisible;
  const maxLeft = stageSize.width + halfWidth - minVisible;
  const minTop = -halfHeight + minVisible;
  const maxTop = stageSize.height + halfHeight - minVisible;
  const currentLeft = textbox.left ?? 0;
  const currentTop = textbox.top ?? 0;

  textbox.set({
    left: clamp(currentLeft, minLeft, maxLeft),
    top: clamp(currentTop, minTop, maxTop),
  } as never);
  textbox.setCoords();
}

function normalizeTextboxScale(textbox: EditorTextbox) {
  const scaleX = textbox.scaleX ?? 1;
  const scaleY = textbox.scaleY ?? 1;

  if (scaleX === 1 && scaleY === 1) {
    return;
  }

  const currentWidth = textbox.width ?? 0;
  const currentFontSize = textbox.fontSize ?? 16;

  // Scale width and font size respectively
  const newWidth = Math.max(20, currentWidth * scaleX);
  const newFontSize = Math.max(4, currentFontSize * scaleY);

  const layoutTextbox = textbox as EditorTextbox & {
    initDimensions?: () => void;
    dirty?: boolean;
  };

  textbox.set({
    width: newWidth,
    fontSize: newFontSize,
    scaleX: 1,
    scaleY: 1,
  } as never);
  layoutTextbox.initDimensions?.();
  layoutTextbox.dirty = true;
  textbox.setCoords();
}

function getPointDistance(first: ViewportPoint, second: ViewportPoint) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function getPointCentre(first: ViewportPoint, second: ViewportPoint) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function serializeCanvas(
  canvas: Canvas,
  currentLayers: TextLayer[],
  stageSize: StageSize,
) {
  const baseSize = stageSize.height;
  const currentLayerMap = new Map(
    currentLayers.map((layer) => [layer.id, layer]),
  );

  return canvas
    .getObjects()
    .filter((object) => object.type === "textbox")
    .map((object) => {
      const textbox = object as EditorTextbox;
      const layerId = textbox.data?.layerId;
      const existing = layerId ? currentLayerMap.get(layerId) : undefined;
      const center = textbox.getCenterPoint();

      return {
        id: layerId ?? existing?.id ?? crypto.randomUUID(),
        presetId: existing?.presetId ?? "custom",
        text: textbox.text ?? "",
        xPct: toPercentage(center.x ?? 0, stageSize.width),
        yPct: toPercentage(center.y ?? 0, stageSize.height),
        widthPct: toPercentage(textbox.width ?? 0, stageSize.width),
        fontSizePct: toPercentage(textbox.fontSize ?? 0, baseSize),
        fontFamily: inferFontFamily(textbox.fontFamily),
        color:
          typeof textbox.fill === "string"
            ? textbox.fill
            : (existing?.color ?? "#fafafa"),
        opacity: textbox.opacity ?? 1,
        letterSpacing: textbox.charSpacing ?? existing?.letterSpacing ?? 0,
        lineHeight: textbox.lineHeight ?? existing?.lineHeight ?? 1.1,
        shadowPreset: inferShadowPreset(textbox.shadow),
        blendMode: inferBlendMode(textbox.globalCompositeOperation),
        backgroundColor:
          typeof textbox.backgroundColor === "string"
            ? textbox.backgroundColor
            : null,
        fontStyle: textbox.fontStyle === "italic" ? "italic" : "normal",
        fontWeight: `${textbox.fontWeight ?? existing?.fontWeight ?? "500"}`,
        textAlign:
          textbox.textAlign === "right"
            ? "right"
            : textbox.textAlign === "left"
              ? "left"
              : "center",
      } satisfies TextLayer;
    });
}

function FilmFrameIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 80"
      className="mx-auto h-24 w-36 text-[rgba(255,255,255,0.85)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="10" y="10" width="100" height="60" strokeDasharray="6 4" />
      <rect x="26" y="20" width="68" height="40" />
      {Array.from({ length: 6 }).map((_, index) => (
        <rect
          key={`left-${index}`}
          x="4"
          y={14 + index * 9}
          width="4"
          height="5"
          fill="currentColor"
          stroke="none"
        />
      ))}
      {Array.from({ length: 6 }).map((_, index) => (
        <rect
          key={`right-${index}`}
          x="112"
          y={14 + index * 9}
          width="4"
          height="5"
          fill="currentColor"
          stroke="none"
        />
      ))}
    </svg>
  );
}

function mapScreenToImage(
  screenXPct: number,
  screenYPct: number,
  rotation: number,
  flipX: boolean,
  flipY: boolean,
): CropPoint {
  let dx = screenXPct - 50;
  let dy = screenYPct - 50;

  if (flipX) dx = -dx;
  if (flipY) dy = -dy;

  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;

  return {
    x: rx + 50,
    y: ry + 50,
  };
}

function getConstrainedPerspective(
  current: ProjectState["crop"]["perspective"],
  draggedCorner: keyof ProjectState["crop"]["perspective"],
  x: number,
  y: number,
  aspectRatio: number | null,
) {
  const minSize = 5;

  if (aspectRatio === null) {
    switch (draggedCorner) {
      case "tl": {
        const clampedX = clamp(x, 0, current.br.x - minSize);
        const clampedY = clamp(y, 0, current.br.y - minSize);
        return {
          tl: { x: clampedX, y: clampedY },
          tr: { x: current.tr.x, y: clampedY },
          br: current.br,
          bl: { x: clampedX, y: current.bl.y },
        };
      }
      case "tr": {
        const clampedX = clamp(x, current.bl.x + minSize, 100);
        const clampedY = clamp(y, 0, current.bl.y - minSize);
        return {
          tl: { x: current.tl.x, y: clampedY },
          tr: { x: clampedX, y: clampedY },
          br: { x: clampedX, y: current.br.y },
          bl: current.bl,
        };
      }
      case "br": {
        const clampedX = clamp(x, current.tl.x + minSize, 100);
        const clampedY = clamp(y, current.tl.y + minSize, 100);
        return {
          tl: current.tl,
          tr: { x: clampedX, y: current.tr.y },
          br: { x: clampedX, y: clampedY },
          bl: { x: current.bl.x, y: clampedY },
        };
      }
      case "bl": {
        const clampedX = clamp(x, 0, current.tr.x - minSize);
        const clampedY = clamp(y, current.tr.y + minSize, 100);
        return {
          tl: { x: clampedX, y: current.tl.y },
          tr: current.tr,
          br: { x: current.br.x, y: clampedY },
          bl: { x: clampedX, y: clampedY },
        };
      }
    }
  }

  // Aspect-locked mode
  let anchor: CropPoint;
  let sgnX: number;
  let sgnY: number;

  switch (draggedCorner) {
    case "tl":
      anchor = current.br;
      sgnX = -1;
      sgnY = -1;
      break;
    case "tr":
      anchor = current.bl;
      sgnX = 1;
      sgnY = -1;
      break;
    case "br":
      anchor = current.tl;
      sgnX = 1;
      sgnY = 1;
      break;
    case "bl":
      anchor = current.tr;
      sgnX = -1;
      sgnY = 1;
      break;
  }

  const dx = x - anchor.x;
  const dy = y - anchor.y;

  const R = aspectRatio;
  let t = (sgnX * R * dx + sgnY * dy) / (R * R + 1);

  const tMaxX = sgnX > 0 ? (100 - anchor.x) / R : anchor.x / R;
  const tMaxY = sgnY > 0 ? (100 - anchor.y) : anchor.y;
  const tMax = Math.min(tMaxX, tMaxY);
  const tMin = Math.max(minSize / R, minSize);

  t = clamp(t, tMin, tMax);

  const newX = anchor.x + t * sgnX * R;
  const newY = anchor.y + t * sgnY;

  switch (draggedCorner) {
    case "tl":
      return {
        tl: { x: newX, y: newY },
        tr: { x: anchor.x, y: newY },
        br: anchor,
        bl: { x: newX, y: anchor.y },
      };
    case "tr":
      return {
        tl: { x: anchor.x, y: newY },
        tr: { x: newX, y: newY },
        br: { x: newX, y: anchor.y },
        bl: anchor,
      };
    case "br":
      return {
        tl: anchor,
        tr: { x: newX, y: anchor.y },
        br: { x: newX, y: newY },
        bl: { x: anchor.x, y: newY },
      };
    case "bl":
      return {
        tl: { x: newX, y: anchor.y },
        tr: anchor,
        br: { x: anchor.x, y: newY },
        bl: { x: newX, y: newY },
      };
  }
}

function getConstrainedPerspectiveForEdge(
  current: ProjectState["crop"]["perspective"],
  draggedEdge: "top" | "right" | "bottom" | "left",
  x: number,
  y: number,
  aspectRatio: number | null,
) {
  const minSize = 5;

  if (aspectRatio === null) {
    switch (draggedEdge) {
      case "top": {
        const clampedY = clamp(y, 0, current.bl.y - minSize);
        return {
          tl: { x: current.tl.x, y: clampedY },
          tr: { x: current.tr.x, y: clampedY },
          br: current.br,
          bl: current.bl,
        };
      }
      case "bottom": {
        const clampedY = clamp(y, current.tl.y + minSize, 100);
        return {
          tl: current.tl,
          tr: current.tr,
          br: { x: current.br.x, y: clampedY },
          bl: { x: current.bl.x, y: clampedY },
        };
      }
      case "left": {
        const clampedX = clamp(x, 0, current.tr.x - minSize);
        return {
          tl: { x: clampedX, y: current.tl.y },
          tr: current.tr,
          br: current.br,
          bl: { x: clampedX, y: current.bl.y },
        };
      }
      case "right": {
        const clampedX = clamp(x, current.tl.x + minSize, 100);
        return {
          tl: current.tl,
          tr: { x: clampedX, y: current.tr.y },
          br: { x: clampedX, y: current.br.y },
          bl: current.bl,
        };
      }
    }
  }

  // Aspect-locked mode
  const R = aspectRatio;
  switch (draggedEdge) {
    case "top": {
      const y0 = current.bl.y;
      const cx = (current.tl.x + current.tr.x) / 2;
      let h = y0 - y;
      const hMax = Math.min(y0, (2 * cx) / R, (2 * (100 - cx)) / R);
      const hMin = Math.max(minSize, minSize / R);
      h = clamp(h, hMin, hMax);
      const newY = y0 - h;
      const hw = (h * R) / 2;
      return {
        tl: { x: cx - hw, y: newY },
        tr: { x: cx + hw, y: newY },
        br: { x: cx + hw, y: y0 },
        bl: { x: cx - hw, y: y0 },
      };
    }
    case "bottom": {
      const y0 = current.tl.y;
      const cx = (current.tl.x + current.tr.x) / 2;
      let h = y - y0;
      const hMax = Math.min(100 - y0, (2 * cx) / R, (2 * (100 - cx)) / R);
      const hMin = Math.max(minSize, minSize / R);
      h = clamp(h, hMin, hMax);
      const newY = y0 + h;
      const hw = (h * R) / 2;
      return {
        tl: { x: cx - hw, y: y0 },
        tr: { x: cx + hw, y: y0 },
        br: { x: cx + hw, y: newY },
        bl: { x: cx - hw, y: newY },
      };
    }
    case "left": {
      const x0 = current.tr.x;
      const cy = (current.tl.y + current.bl.y) / 2;
      let w = x0 - x;
      const wMax = Math.min(x0, 2 * cy * R, 2 * (100 - cy) * R);
      const wMin = Math.max(minSize, minSize * R);
      w = clamp(w, wMin, wMax);
      const newX = x0 - w;
      const hh = (w / R) / 2;
      return {
        tl: { x: newX, y: cy - hh },
        tr: { x: x0, y: cy - hh },
        br: { x: x0, y: cy + hh },
        bl: { x: newX, y: cy + hh },
      };
    }
    case "right": {
      const x0 = current.tl.x;
      const cy = (current.tl.y + current.bl.y) / 2;
      let w = x - x0;
      const wMax = Math.min(100 - x0, 2 * cy * R, 2 * (100 - cy) * R);
      const wMin = Math.max(minSize, minSize * R);
      w = clamp(w, wMin, wMax);
      const newX = x0 + w;
      const hh = (w / R) / 2;
      return {
        tl: { x: x0, y: cy - hh },
        tr: { x: newX, y: cy - hh },
        br: { x: newX, y: cy + hh },
        bl: { x: x0, y: cy + hh },
      };
    }
  }
}

export const CanvasStage = React.forwardRef<
  CanvasStageHandle,
  {
    onRequestUpload: () => void;
    onDropFile: (file: File) => void;
    mobileBottomInset?: number;
  }
>(function CanvasStage(
  { onRequestUpload, onDropFile, mobileBottomInset = 0 },
  ref,
) {
  const {
    project,
    activeTab,
    selectedTextId,
    setSelectedTextId,
    setTextLayers,
    updateTextLayer,
    removeTextLayer,
    setCropPerspective,
    setImageDimensions,
  } = useEditor();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewportSurfaceRef = React.useRef<HTMLDivElement>(null);
  const viewportTransformRef = React.useRef<HTMLDivElement>(null);
  const zoomReadoutRef = React.useRef<HTMLDivElement>(null);
  const captureRef = React.useRef<HTMLDivElement>(null);
  const previewCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const previewRendererRef = React.useRef<
    ((state: RasterProjectState) => void) | null
  >(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = React.useRef<Canvas | null>(null);
  const isSyncingRef = React.useRef(false);
  const latestPerspectiveRef = React.useRef<CropPerspective>(
    project.crop.perspective,
  );
  React.useEffect(() => {
    latestPerspectiveRef.current = project.crop.perspective;
  }, [project.crop.perspective]);
  const latestTextLayersRef = React.useRef(project.textLayers);
  const panOriginRef = React.useRef<{
    pointerId: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [naturalSize, setNaturalSize] = React.useState<StageSize | null>(null);
  const [sourceImage, setSourceImage] = React.useState<HTMLImageElement | null>(
    null,
  );
  const [dragActive, setDragActive] = React.useState(false);
  const [dragCorner, setDragCorner] = React.useState<
    keyof typeof project.crop.perspective | null
  >(null);
  const [dragEdge, setDragEdge] = React.useState<
    "top" | "right" | "bottom" | "left" | null
  >(null);
  const [isMovingCropBox, setIsMovingCropBox] = React.useState(false);
  const cropBoxDragStartRef = React.useRef<{
    pointerX: number;
    pointerY: number;
    perspective: CropPerspective;
  } | null>(null);
  const [draftPerspective, setDraftPerspective] =
    React.useState<CropPerspective | null>(null);
  const draftPerspectiveRef = React.useRef<CropPerspective | null>(null);
  const perspectiveRenderRafRef = React.useRef(0);
  const pendingPerspectiveRenderRef = React.useRef<CropPerspective | null>(null);
  const [viewport, setViewport] = React.useState<CanvasViewport>({
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [editingTextId, setEditingTextId] = React.useState<string | null>(null);
  const [draftTextLayerUpdates, setDraftTextLayerUpdates] = React.useState<
    Record<string, Partial<TextLayer>>
  >({});
  const textDraftRafRef = React.useRef(0);
  const pendingTextDraftRef = React.useRef<{
    layerId: string;
    updates: Partial<TextLayer>;
  } | null>(null);
  const [spacePressed, setSpacePressed] = React.useState(false);
  const activeTouchPointersRef = React.useRef(
    new Map<number, ViewportPoint>(),
  );
  const pointerPinchRef = React.useRef<{
    distance: number;
    viewport: CanvasViewport;
    centre: ViewportPoint;
  } | null>(null);
  const viewportRafRef = React.useRef(0);
  const viewportCommitTimeoutRef = React.useRef(0);
  const pendingViewportRef = React.useRef<CanvasViewport | null>(null);
  const viewportGestureActiveRef = React.useRef(false);
  const viewportRectRef = React.useRef<DOMRect | null>(null);
  const latestViewportRef = React.useRef(viewport);
  const latestActiveTabRef = React.useRef(activeTab);

  const containerSize = useContainerSize(containerRef);
  const visibleContainerSize = React.useMemo(
    () => ({
      width: containerSize.width,
      height: Math.max(0, containerSize.height - mobileBottomInset),
    }),
    [containerSize, mobileBottomInset],
  );
  const cropGeometry = React.useMemo(
    () =>
      naturalSize
        ? getCropGeometry(naturalSize.width, naturalSize.height, project.crop)
        : null,
    [naturalSize, project.crop],
  );
  const usesCroppedWorkspace = activeTab !== "crop";
  const workspaceNaturalSize = React.useMemo(
    () =>
      usesCroppedWorkspace && cropGeometry
        ? { width: cropGeometry.width, height: cropGeometry.height }
        : naturalSize,
    [cropGeometry, naturalSize, usesCroppedWorkspace],
  );
  const stageSize = React.useMemo(
    () =>
      fitStage(
        workspaceNaturalSize,
        visibleContainerSize,
        mobileBottomInset > 0,
      ),
    [mobileBottomInset, visibleContainerSize, workspaceNaturalSize],
  );
  const latestStageSizeRef = React.useRef(stageSize);

  const activeLook = React.useMemo(
    () => getLookDefinition(project.activeLookId),
    [project.activeLookId],
  );
  const rasterProject = React.useMemo<RasterProjectState>(
    () => ({
      activeLookId: project.activeLookId,
      filterIntensity: project.filterIntensity,
      acrosChannel: project.acrosChannel,
      adjustments: project.adjustments,
      overlayLayers: project.overlayLayers,
    }),
    [
      project.acrosChannel,
      project.activeLookId,
      project.adjustments,
      project.filterIntensity,
      project.overlayLayers,
    ],
  );
  const latestRasterProjectRef = React.useRef(rasterProject);
  React.useEffect(() => {
    latestRasterProjectRef.current = rasterProject;
  }, [rasterProject]);
  const selectedTextLayer = React.useMemo(
    () =>
      project.textLayers.find((layer) => layer.id === selectedTextId) ?? null,
    [project.textLayers, selectedTextId],
  );
  const mapLayerToWorkspace = React.useCallback(
    (layer: TextLayer) =>
      usesCroppedWorkspace
        ? mapTextLayerToCropWorkspace(layer, cropGeometry, naturalSize)
        : layer,
    [cropGeometry, naturalSize, usesCroppedWorkspace],
  );
  const mapLayerFromWorkspace = React.useCallback(
    (layer: TextLayer) =>
      usesCroppedWorkspace
        ? mapTextLayerFromCropWorkspace(layer, cropGeometry, naturalSize)
        : layer,
    [cropGeometry, naturalSize, usesCroppedWorkspace],
  );
  const latestMapLayerFromWorkspaceRef = React.useRef(mapLayerFromWorkspace);
  const updateTextLayerInWorkspace = React.useCallback(
    (layerId: string, updates: Partial<TextLayer>) => {
      const layer = project.textLayers.find((candidate) => candidate.id === layerId);

      if (!layer) {
        return;
      }

      updateTextLayer(
        layerId,
        mapLayerFromWorkspace({
          ...mapLayerToWorkspace(layer),
          ...updates,
        }),
      );
    },
    [mapLayerFromWorkspace, mapLayerToWorkspace, project.textLayers, updateTextLayer],
  );
  const selectedWorkspaceTextLayer = selectedTextLayer
    ? mapLayerToWorkspace(selectedTextLayer)
    : null;
  const effectiveEditingTextId =
    activeTab === "text" && editingTextId === selectedTextId
      ? editingTextId
      : null;
  const selectedTextFontSize = selectedWorkspaceTextLayer
    ? fromPercentage(selectedWorkspaceTextLayer.fontSizePct, stageSize.height)
    : 0;
  const selectedTextTracking = selectedTextLayer
    ? charSpacingToPixels(selectedTextLayer.letterSpacing, selectedTextFontSize)
    : 0;
  const trackingSliderMax = Math.max(40, Math.ceil(selectedTextTracking + 4));
  const selectedTextWidth = selectedWorkspaceTextLayer
    ? fromPercentage(selectedWorkspaceTextLayer.widthPct, stageSize.width)
    : 0;

  const displayedPerspective = draftPerspective ?? project.crop.perspective;

  const startCropDrag = React.useCallback(() => {
    const cloned = structuredClone(project.crop.perspective);
    draftPerspectiveRef.current = cloned;
    latestPerspectiveRef.current = cloned;
    setDraftPerspective(cloned);
  }, [project.crop.perspective]);

  const exitCanvasTextEditing = React.useCallback(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    let didExitEditing = false;

    canvas.getObjects().forEach((object) => {
      if (object.type !== "textbox") {
        return;
      }

      didExitEditing =
        exitTextboxEditing(object as EditorTextbox) || didExitEditing;
    });

    if (didExitEditing) {
      canvas.requestRenderAll();
    }
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      getElement: () => captureRef.current,
      deselectText: () => {
        const canvas = fabricCanvasRef.current;

        if (!canvas) {
          return;
        }

        exitCanvasTextEditing();
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      },
      editSelectedText: () => {
        if (selectedTextId) {
          setEditingTextId(selectedTextId);
        }
      },
      getStageSize: () => ({
        width: latestStageSizeRef.current.width,
        height: latestStageSizeRef.current.height,
      }),
    }),
    [exitCanvasTextEditing, selectedTextId],
  );

  React.useEffect(() => {
    latestTextLayersRef.current = project.textLayers;
  }, [project.textLayers]);

  React.useEffect(() => {
    latestMapLayerFromWorkspaceRef.current = mapLayerFromWorkspace;
  }, [mapLayerFromWorkspace]);

  React.useEffect(() => {
    latestStageSizeRef.current = stageSize;
  }, [stageSize]);

  React.useEffect(() => {
    latestViewportRef.current = viewport;
  }, [viewport]);

  React.useEffect(() => {
    latestActiveTabRef.current = activeTab;
  }, [activeTab]);

  React.useEffect(
    () => () => {
      if (viewportRafRef.current) {
        window.cancelAnimationFrame(viewportRafRef.current);
      }
      if (viewportCommitTimeoutRef.current) {
        window.clearTimeout(viewportCommitTimeoutRef.current);
      }
      if (perspectiveRenderRafRef.current) {
        window.cancelAnimationFrame(perspectiveRenderRafRef.current);
      }
      if (textDraftRafRef.current) {
        window.cancelAnimationFrame(textDraftRafRef.current);
      }
    },
    [],
  );

  const queueViewport = React.useCallback(
    (nextViewport: CanvasViewport) => {
      const finalViewport = normalizeCanvasViewport(nextViewport);
      // This ref is the camera source of truth during an interaction. Updating
      // it synchronously avoids accumulating deltas against a frame-old value.
      latestViewportRef.current = finalViewport;
      pendingViewportRef.current = finalViewport;

      if (viewportRafRef.current) {
        return finalViewport;
      }

      viewportRafRef.current = window.requestAnimationFrame(() => {
        viewportRafRef.current = 0;
        const pendingViewport = pendingViewportRef.current;
        pendingViewportRef.current = null;

        if (pendingViewport) {
          const node = viewportTransformRef.current;
          if (node) {
            node.style.transform = canvasViewportTransform(pendingViewport);
          }
          if (zoomReadoutRef.current) {
            zoomReadoutRef.current.textContent = `${Math.round(pendingViewport.zoom * 100)}%`;
          }
        }
      });

      return finalViewport;
    },
    [],
  );

  const commitViewport = React.useCallback(() => {
    if (viewportCommitTimeoutRef.current) {
      window.clearTimeout(viewportCommitTimeoutRef.current);
      viewportCommitTimeoutRef.current = 0;
    }
    viewportRectRef.current = null;

    const current = latestViewportRef.current;
    setViewport((previous) => {
      const sameViewport =
        Math.abs(previous.zoom - current.zoom) < 0.000_001 &&
        Math.abs(previous.offsetX - current.offsetX) < 0.000_001 &&
        Math.abs(previous.offsetY - current.offsetY) < 0.000_001;

      return sameViewport ? previous : current;
    });
  }, []);

  React.useEffect(() => {
    queueViewport({ zoom: 1, offsetX: 0, offsetY: 0 });
    commitViewport();
  }, [commitViewport, queueViewport, usesCroppedWorkspace]);

  const scheduleViewportCommit = React.useCallback(() => {
    if (viewportCommitTimeoutRef.current) {
      window.clearTimeout(viewportCommitTimeoutRef.current);
    }

    viewportCommitTimeoutRef.current = window.setTimeout(() => {
      viewportCommitTimeoutRef.current = 0;
      commitViewport();
    }, 120);
  }, [commitViewport]);

  const getViewportPoint = React.useCallback(
    (clientX: number, clientY: number) => {
      const rect =
        viewportRectRef.current ??
        viewportSurfaceRef.current?.getBoundingClientRect();

      if (!rect) {
        return { x: 0, y: 0 };
      }

      viewportRectRef.current = rect;

      return {
        x: clientX - (rect.left + rect.width / 2),
        y: clientY - (rect.top + rect.height / 2),
      };
    },
    [],
  );

  const queuePerspectiveRender = React.useCallback(
    (next: CropPerspective) => {
      draftPerspectiveRef.current = next;
      latestPerspectiveRef.current = next;
      pendingPerspectiveRenderRef.current = next;

      if (perspectiveRenderRafRef.current) {
        return;
      }

      perspectiveRenderRafRef.current = window.requestAnimationFrame(() => {
        perspectiveRenderRafRef.current = 0;
        const pending = pendingPerspectiveRenderRef.current;
        pendingPerspectiveRenderRef.current = null;
        if (pending) {
          setDraftPerspective(pending);
        }
      });
    },
    [],
  );

  const cancelPerspectiveRender = React.useCallback(() => {
    if (perspectiveRenderRafRef.current) {
      window.cancelAnimationFrame(perspectiveRenderRafRef.current);
      perspectiveRenderRafRef.current = 0;
    }
    pendingPerspectiveRenderRef.current = null;
  }, []);

  const queueTextDraftRender = React.useCallback(
    (layerId: string, updates: Partial<TextLayer>) => {
      pendingTextDraftRef.current = { layerId, updates };

      if (textDraftRafRef.current) {
        return;
      }

      textDraftRafRef.current = window.requestAnimationFrame(() => {
        textDraftRafRef.current = 0;
        const pending = pendingTextDraftRef.current;
        pendingTextDraftRef.current = null;
        if (pending) {
          setDraftTextLayerUpdates((current) => ({
            ...current,
            [pending.layerId]: {
              ...current[pending.layerId],
              ...pending.updates,
            },
          }));
        }
      });
    },
    [],
  );

  const cancelTextDraftRender = React.useCallback(() => {
    if (textDraftRafRef.current) {
      window.cancelAnimationFrame(textDraftRafRef.current);
      textDraftRafRef.current = 0;
    }
    pendingTextDraftRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!effectiveEditingTextId) {
      exitCanvasTextEditing();
    }
  }, [effectiveEditingTextId, exitCanvasTextEditing]);

  React.useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;

      if (!node) {
        return false;
      }

      const tag = node.tagName.toLowerCase();
      return (
        node.isContentEditable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        Boolean(node.closest("[contenteditable='true']"))
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpacePressed(true);
        return;
      }

      // Handle delete key - must be Delete or Backspace
      const isDeleteKey = event.key === "Delete" || event.key === "Backspace";

      if (!isDeleteKey) {
        return;
      }

      // Don't delete if user has keyboard modifiers pressed
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      // Don't delete if no text is selected
      if (!selectedTextId) {
        return;
      }

      // Don't delete if user is typing in a text input
      if (isTypingTarget(event.target)) {
        return;
      }

      // Check if text is being edited - allow backspace in editor
      const canvas = fabricCanvasRef.current;
      const activeTextbox = canvas?.getActiveObject() as EditorTextbox | null;

      if (activeTextbox?.isEditing) {
        // Allow normal backspace behavior while editing text
        return;
      }

      // Delete the text layer
      event.preventDefault();
      removeTextLayer(selectedTextId);
      setSelectedTextId(null);
      setEditingTextId(null);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [removeTextLayer, selectedTextId, setSelectedTextId]);

  React.useEffect(() => {
    if (!project.imageSrc) {
      return;
    }

    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (cancelled) {
        return;
      }

      setNaturalSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      setSourceImage(image);
      setImageDimensions(image.naturalWidth, image.naturalHeight);
    };
    image.src = project.imageSrc;

    return () => {
      cancelled = true;
    };
  }, [project.imageSrc, setImageDimensions]);

  const previewCrop = usesCroppedWorkspace ? project.crop : null;

  React.useEffect(() => {
    const previewCanvas = previewCanvasRef.current;

    if (
      !previewCanvas ||
      !sourceImage ||
      !stageSize.width ||
      !stageSize.height
    ) {
      return;
    }

    const renderWidth = Math.max(1, Math.round(stageSize.width));
    const renderHeight = Math.max(1, Math.round(stageSize.height));
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const smallestViewportSide = Math.min(
      window.innerWidth || renderWidth,
      window.innerHeight || renderHeight,
    );
    const isSmallViewport = smallestViewportSide <= 900;
    const hardwareConcurrency = navigator.hardwareConcurrency ?? 8;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
      .deviceMemory;
    const isLowPowerDevice =
      hardwareConcurrency <= 6 ||
      (typeof deviceMemory === "number" && deviceMemory <= 4);
    const useMobileProfile =
      isCoarsePointer && (isSmallViewport || isLowPowerDevice);
    const devicePixelRatio = window.devicePixelRatio || 1;
    const allowFullRender = true;
    let cancelled = false;
    let fallbackFrameId = 0;
    let worker: Worker | null = null;
    let workerReady = false;
    let workerBusy = false;
    let usingFallback = false;
    let pendingWorkerJob: PreviewRenderJob | null = null;
    let pendingFallbackJob: PreviewRenderJob | null = null;
    let fullRenderTimeout = 0;
    let currentRevision = 0;
    let lastScheduledState: RasterProjectState | null = null;

    const getRenderSize = (targetDpr: number, pixelBudget: number) => {
      const estimatedPixels =
        renderWidth * renderHeight * targetDpr * targetDpr;
      const budgetScale =
        estimatedPixels > pixelBudget
          ? Math.sqrt(pixelBudget / estimatedPixels)
          : 1;
      const effectiveDpr = Math.max(0.55, targetDpr * budgetScale);
      return {
        width: Math.max(1, Math.round(renderWidth * effectiveDpr)),
        height: Math.max(1, Math.round(renderHeight * effectiveDpr)),
      };
    };

    const getRenderSizes = (state: RasterProjectState) => {
      const grainOverlay = state.overlayLayers.find(
        (layer) => layer.type === "grain",
      );
      const grainLoadScore =
        state.adjustments.grainAmount +
        (grainOverlay?.intensity ?? 0) * (grainOverlay?.opacity ?? 0.14);
      const isHeavyGrain = grainLoadScore > 24;
      const fullDprLimit = useMobileProfile
        ? isHeavyGrain
          ? 1.3
          : isLowPowerDevice
            ? 1.4
            : 1.6
        : isHeavyGrain
          ? 1.3
          : 1.5;
      const fullDpr = Math.min(devicePixelRatio, fullDprLimit);
      const fastDpr = useMobileProfile
        ? Math.min(devicePixelRatio, 1)
        : Math.min(fullDpr, isHeavyGrain ? 0.7 : 0.85);
      const fastBudget = useMobileProfile
        ? isHeavyGrain
          ? 320_000
          : 460_000
        : isHeavyGrain
          ? 560_000
          : 720_000;
      const fullBudget = useMobileProfile
        ? isHeavyGrain
          ? 900_000
          : 1_400_000
        : isHeavyGrain
          ? 1_100_000
          : 1_800_000;

      return {
        fast: getRenderSize(fastDpr, fastBudget),
        full: getRenderSize(fullDpr, fullBudget),
      };
    };

    const paintBitmap = (bitmap: ImageBitmap, width: number, height: number) => {
      if (cancelled) {
        bitmap.close();
        return;
      }

      if (previewCanvas.width !== width || previewCanvas.height !== height) {
        previewCanvas.width = width;
        previewCanvas.height = height;
      }

      const context = previewCanvas.getContext("2d", { colorSpace: "srgb" });

      if (!context) {
        bitmap.close();
        return;
      }

      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
    };

    const flushFallback = () => {
      if (fallbackFrameId || cancelled || !pendingFallbackJob) {
        return;
      }

      fallbackFrameId = window.requestAnimationFrame(() => {
        fallbackFrameId = 0;
        const job = pendingFallbackJob;
        pendingFallbackJob = null;

        if (cancelled || !job) {
          return;
        }

        const { width, height } = job;
        if (previewCanvas.width !== width || previewCanvas.height !== height) {
          previewCanvas.width = width;
          previewCanvas.height = height;
        }

        const context = previewCanvas.getContext("2d", {
          willReadFrequently: true,
          colorSpace: "srgb",
        });

        if (!context) {
          return;
        }

        renderProjectRaster({
          ctx: context,
          state: job.state,
          source: sourceImage,
          width,
          height,
          sourceVariantKey: job.crop
            ? JSON.stringify(job.crop.perspective)
            : "full-source",
          drawSource: job.crop
            ? (renderContext, renderSource, renderCanvasWidth, renderCanvasHeight) =>
                drawCroppedImage(
                  renderContext,
                  renderSource,
                  job.crop!,
                  renderCanvasWidth,
                  renderCanvasHeight,
                  false,
                )
            : drawCoverImage,
        });
        flushFallback();
      });
    };

    const queueFallback = (job: PreviewRenderJob) => {
      pendingFallbackJob = job;
      flushFallback();
    };

    const postWorkerJob = (job: PreviewRenderJob) => {
      if (!worker || !workerReady || workerBusy || cancelled) {
        pendingWorkerJob = job;
        return;
      }

      workerBusy = true;
      worker.postMessage({ type: "render", ...job });
    };

    const queueWorkerJob = (job: PreviewRenderJob) => {
      if (!workerReady || workerBusy) {
        pendingWorkerJob = selectPendingPreviewJob(pendingWorkerJob, job);
        return;
      }

      postWorkerJob(job);
    };

    const flushWorker = () => {
      if (!pendingWorkerJob || workerBusy || !workerReady || cancelled) {
        return;
      }

      const job = pendingWorkerJob;
      pendingWorkerJob = null;
      postWorkerJob(job);
    };

    const schedulePreview = (state: RasterProjectState) => {
      if (cancelled || state === lastScheduledState) {
        return;
      }

      lastScheduledState = state;
      currentRevision += 1;
      const revision = currentRevision;
      const sizes = getRenderSizes(state);

      if (fullRenderTimeout) {
        window.clearTimeout(fullRenderTimeout);
        fullRenderTimeout = 0;
      }

      const fastJob: PreviewRenderJob = {
        revision,
        quality: "fast",
        ...sizes.fast,
        state,
        crop: previewCrop,
      };

      if (usingFallback) {
        queueFallback(fastJob);

        if (allowFullRender) {
          fullRenderTimeout = window.setTimeout(() => {
            fullRenderTimeout = 0;

            if (cancelled || revision !== currentRevision) {
              return;
            }

            queueFallback({
              revision,
              quality: "full",
              ...sizes.full,
              state,
              crop: previewCrop,
            });
          }, PREVIEW_FALLBACK_FULL_SETTLE_MS);
        }

        return;
      }

      queueWorkerJob(fastJob);

      if (allowFullRender) {
        fullRenderTimeout = window.setTimeout(() => {
          fullRenderTimeout = 0;

          if (cancelled || revision !== currentRevision) {
            return;
          }

          queueWorkerJob({
            revision,
            quality: "full",
            ...sizes.full,
            state,
            crop: previewCrop,
          });
        }, PREVIEW_FULL_SETTLE_MS);
      }
    };

    const switchToFallback = () => {
      if (usingFallback || cancelled) {
        return;
      }

      usingFallback = true;
      worker?.terminate();
      worker = null;
      workerReady = false;
      workerBusy = false;
      pendingWorkerJob = null;
      lastScheduledState = null;
      schedulePreview(latestRasterProjectRef.current);
    };

    const supportsWorkerPreview =
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      typeof createImageBitmap === "function";

    if (supportsWorkerPreview) {
      worker = new Worker(
        new URL("../../workers/preview-render.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (event: MessageEvent<PreviewWorkerResponse>) => {
        if (event.data.type === "ready") {
          workerReady = true;
          flushWorker();
          return;
        }

        if (event.data.type === "rendered") {
          workerBusy = false;

          if (event.data.revision === currentRevision) {
            paintBitmap(event.data.bitmap, event.data.width, event.data.height);
          } else {
            event.data.bitmap.close();
          }

          flushWorker();
          return;
        }

        switchToFallback();
      };
      worker.onerror = (event) => {
        event.preventDefault();
        switchToFallback();
      };

      void createImageBitmap(sourceImage)
        .then((bitmap) => {
          if (cancelled || !worker) {
            bitmap.close();
            return;
          }

          worker.postMessage({ type: "init", source: bitmap }, [bitmap]);
        })
        .catch(switchToFallback);
    } else {
      usingFallback = true;
    }

    previewRendererRef.current = schedulePreview;
    schedulePreview(latestRasterProjectRef.current);

    return () => {
      cancelled = true;
      if (previewRendererRef.current === schedulePreview) {
        previewRendererRef.current = null;
      }
      worker?.terminate();
      worker = null;
      if (fullRenderTimeout) {
        window.clearTimeout(fullRenderTimeout);
      }
      if (fallbackFrameId) {
        window.cancelAnimationFrame(fallbackFrameId);
      }
    };
  }, [previewCrop, sourceImage, stageSize.height, stageSize.width]);

  React.useEffect(() => {
    previewRendererRef.current?.(rasterProject);
  }, [rasterProject]);

  React.useEffect(() => {
    if (!canvasRef.current || fabricCanvasRef.current) {
      return;
    }

    const canvas = new Canvas(canvasRef.current, {
      preserveObjectStacking: true,
      selectionColor: "rgba(245,158,11,0.08)",
      selectionBorderColor: "#f59e0b",
      backgroundColor: "transparent",
      containerClass: "fabric-text-canvas",
    });

    canvas.wrapperEl.style.position = "absolute";
    canvas.wrapperEl.style.inset = "0";
    canvas.wrapperEl.style.width = "100%";
    canvas.wrapperEl.style.height = "100%";
    canvas.wrapperEl.style.zIndex = "10";
    canvas.wrapperEl.style.pointerEvents = "auto";
    canvas.wrapperEl.style.opacity =
      latestActiveTabRef.current === "text" ? "0" : "1";
    canvas.upperCanvasEl.style.pointerEvents = "auto";
    canvas.upperCanvasEl.style.position = "absolute";
    canvas.upperCanvasEl.style.inset = "0";
    canvas.lowerCanvasEl.style.pointerEvents = "none";
    canvas.lowerCanvasEl.style.position = "absolute";
    canvas.lowerCanvasEl.style.inset = "0";

    const updateSelection = () => {
      const activeObject = canvas.getActiveObject() as EditorTextbox | null;
      setSelectedTextId(activeObject?.data?.layerId ?? null);
    };

    const openTextControls = (event: { target?: unknown }) => {
      const target = event.target as EditorTextbox | null | undefined;
      const layerId = target?.data?.layerId;

      if (!layerId) {
        return;
      }

      setSelectedTextId(layerId);
      setEditingTextId(layerId);
    };

    const commitLayers = () => {
      const currentStageSize = latestStageSizeRef.current;

      if (
        isSyncingRef.current ||
        !currentStageSize.width ||
        !currentStageSize.height
      ) {
        return;
      }

      setTextLayers(
        serializeCanvas(canvas, latestTextLayersRef.current, currentStageSize).map(
          latestMapLayerFromWorkspaceRef.current,
        ),
      );
    };

    const handleObjectMoving = (event: { target?: unknown }) => {
      const target = event.target as EditorTextbox | null | undefined;
      const currentStageSize = latestStageSizeRef.current;

      if (!target || target.type !== "textbox") {
        return;
      }

      if (!currentStageSize.width || !currentStageSize.height) {
        return;
      }

      keepTextboxPartiallyVisible(target, currentStageSize);
    };

    const handleObjectScaling = (event: { target?: unknown }) => {
      const target = event.target as EditorTextbox | null | undefined;
      const currentStageSize = latestStageSizeRef.current;

      if (!target || target.type !== "textbox") {
        return;
      }

      if (!currentStageSize.width || !currentStageSize.height) {
        return;
      }

      keepTextboxPartiallyVisible(target, currentStageSize);
    };

    const handleObjectModified = (event: { target?: unknown }) => {
      const target = event.target as EditorTextbox | null | undefined;
      const currentStageSize = latestStageSizeRef.current;

      if (
        target &&
        target.type === "textbox" &&
        currentStageSize.width &&
        currentStageSize.height
      ) {
        normalizeTextboxScale(target);
        keepTextboxPartiallyVisible(target, currentStageSize);
        canvas.requestRenderAll();
      }

      commitLayers();
    };

    const handleSelectionCleared = () => {
      setSelectedTextId(null);
      setEditingTextId(null);
      exitCanvasTextEditing();
    };

    canvas.on("selection:created", updateSelection);
    canvas.on("selection:updated", updateSelection);
    canvas.on("selection:cleared", handleSelectionCleared);
    canvas.on("mouse:dblclick", openTextControls);
    canvas.on("object:moving", handleObjectMoving);
    canvas.on("object:scaling", handleObjectScaling);
    canvas.on("object:modified", handleObjectModified);

    fabricCanvasRef.current = canvas;

    return () => {
      canvas.off("selection:created", updateSelection);
      canvas.off("selection:updated", updateSelection);
      canvas.off("selection:cleared", handleSelectionCleared);
      canvas.off("object:moving", handleObjectMoving);
      canvas.off("object:scaling", handleObjectScaling);
      canvas.off("object:modified", handleObjectModified);
      canvas.off("mouse:dblclick", openTextControls);
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [exitCanvasTextEditing, setSelectedTextId, setTextLayers]);

  React.useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas || !stageSize.width || !stageSize.height) {
      return;
    }

    isSyncingRef.current = true;
    canvas.setDimensions({
      width: stageSize.width,
      height: stageSize.height,
    });
    // Explicitly sync CSS px dimensions so Fabric's getPointer() coordinate
    // mapping is correct (CSS size must equal canvas pixel size).
    const pxW = `${stageSize.width}px`;
    const pxH = `${stageSize.height}px`;
    canvas.wrapperEl.style.width = pxW;
    canvas.wrapperEl.style.height = pxH;
    canvas.upperCanvasEl.style.width = pxW;
    canvas.upperCanvasEl.style.height = pxH;
    canvas.lowerCanvasEl.style.width = pxW;
    canvas.lowerCanvasEl.style.height = pxH;
    canvas.calcOffset();

    const objectMap = new Map(
      canvas
        .getObjects()
        .filter((object) => object.type === "textbox")
        .map((object) => {
          const textbox = object as EditorTextbox;
          return [textbox.data?.layerId, textbox] as const;
        }),
    );

    const seen = new Set<string>();

    project.textLayers.forEach((layer) => {
      const existing = objectMap.get(layer.id);
      const workspaceLayer = mapLayerToWorkspace(layer);

      if (existing) {
        applyLayerToTextbox(existing, workspaceLayer, stageSize);
      } else {
        const textbox = new Textbox(layer.text) as EditorTextbox;
        applyLayerToTextbox(textbox, workspaceLayer, stageSize);
        canvas.add(textbox);
      }

      seen.add(layer.id);
    });

    objectMap.forEach((object, layerId) => {
      if (layerId && !seen.has(layerId)) {
        canvas.remove(object);
      }
    });

    canvas.requestRenderAll();
    isSyncingRef.current = false;
  }, [mapLayerToWorkspace, project.textLayers, stageSize]);

  React.useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const currentActiveObject = canvas.getActiveObject() as EditorTextbox | null;
    const currentLayerId = currentActiveObject?.data?.layerId ?? null;

    if (currentLayerId === selectedTextId) {
      return;
    }

    if (selectedTextId) {
      const activeObject = canvas
        .getObjects()
        .find(
          (object) =>
            object.type === "textbox" &&
            (object as EditorTextbox).data?.layerId === selectedTextId,
        );

      if (activeObject) {
        canvas.setActiveObject(activeObject);
      } else {
        canvas.discardActiveObject();
      }
    } else {
      canvas.discardActiveObject();
    }

    canvas.requestRenderAll();
  }, [selectedTextId]);

  React.useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const pointerEvents = activeTab === "text" ? "none" : "auto";
    canvas.wrapperEl.style.pointerEvents = pointerEvents;
    canvas.upperCanvasEl.style.pointerEvents = pointerEvents;
    canvas.wrapperEl.style.opacity = activeTab === "text" ? "0" : "1";
  }, [activeTab]);

  const handleCropBoxPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    const stageNode = captureRef.current;
    if (!stageNode) return;

    const rect = stageNode.getBoundingClientRect();
    const screenXPct = ((event.clientX - rect.left) / rect.width) * 100;
    const screenYPct = ((event.clientY - rect.top) / rect.height) * 100;

    const cloned = structuredClone(project.crop.perspective);
    cropBoxDragStartRef.current = {
      pointerX: screenXPct,
      pointerY: screenYPct,
      perspective: cloned,
    };
    draftPerspectiveRef.current = cloned;
    latestPerspectiveRef.current = cloned;
    setDraftPerspective(cloned);
    setIsMovingCropBox(true);
  };

  React.useEffect(() => {
    if (!dragCorner) {
      return;
    }

    const handleMove = (event: PointerEvent) => {
      if (viewportGestureActiveRef.current) {
        return;
      }

      const stageNode = captureRef.current;

      if (!stageNode) {
        return;
      }

      const rect = stageNode.getBoundingClientRect();
      const screenXPct = ((event.clientX - rect.left) / rect.width) * 100;
      const screenYPct = ((event.clientY - rect.top) / rect.height) * 100;

      // Map to local unrotated image space
      const localPt = mapScreenToImage(
        screenXPct,
        screenYPct,
        project.crop.rotation,
        project.crop.flipX,
        project.crop.flipY
      );

      const activePreset = ASPECT_RATIO_PRESETS.find(
        (p) => p.id === project.crop.presetId
      );
      const ratioValue = activePreset?.value ?? null;

      const current = draftPerspectiveRef.current;
      if (current) {
        const next = getConstrainedPerspective(
          current,
          dragCorner,
          localPt.x,
          localPt.y,
          ratioValue
        );
        queuePerspectiveRender(next);
      }
    };

    const handleUp = () => {
      setDragCorner(null);
      cancelPerspectiveRender();

      if (latestPerspectiveRef.current) {
        setCropPerspective(latestPerspectiveRef.current);
      }

      draftPerspectiveRef.current = null;
      setDraftPerspective(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [
    dragCorner,
    cancelPerspectiveRender,
    queuePerspectiveRender,
    setCropPerspective,
    project.crop.presetId,
    project.crop.rotation,
    project.crop.flipX,
    project.crop.flipY,
  ]);

  React.useEffect(() => {
    if (!dragEdge) {
      return;
    }

    const handleMove = (event: PointerEvent) => {
      if (viewportGestureActiveRef.current) {
        return;
      }

      const stageNode = captureRef.current;

      if (!stageNode) {
        return;
      }

      const rect = stageNode.getBoundingClientRect();
      const screenXPct = ((event.clientX - rect.left) / rect.width) * 100;
      const screenYPct = ((event.clientY - rect.top) / rect.height) * 100;

      // Map to local unrotated image space
      const localPt = mapScreenToImage(
        screenXPct,
        screenYPct,
        project.crop.rotation,
        project.crop.flipX,
        project.crop.flipY
      );

      const activePreset = ASPECT_RATIO_PRESETS.find(
        (p) => p.id === project.crop.presetId
      );
      const ratioValue = activePreset?.value ?? null;

      const current = draftPerspectiveRef.current;
      if (current) {
        const next = getConstrainedPerspectiveForEdge(
          current,
          dragEdge,
          localPt.x,
          localPt.y,
          ratioValue
        );
        queuePerspectiveRender(next);
      }
    };

    const handleUp = () => {
      setDragEdge(null);
      cancelPerspectiveRender();

      if (latestPerspectiveRef.current) {
        setCropPerspective(latestPerspectiveRef.current);
      }

      draftPerspectiveRef.current = null;
      setDraftPerspective(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [
    dragEdge,
    cancelPerspectiveRender,
    queuePerspectiveRender,
    setCropPerspective,
    project.crop.presetId,
    project.crop.rotation,
    project.crop.flipX,
    project.crop.flipY,
  ]);

  React.useEffect(() => {
    if (!isMovingCropBox) {
      return;
    }

    const handleMove = (event: PointerEvent) => {
      if (viewportGestureActiveRef.current) {
        return;
      }

      const start = cropBoxDragStartRef.current;
      const stageNode = captureRef.current;

      if (!start || !stageNode) {
        return;
      }

      const rect = stageNode.getBoundingClientRect();
      const screenXPct = ((event.clientX - rect.left) / rect.width) * 100;
      const screenYPct = ((event.clientY - rect.top) / rect.height) * 100;

      // Map current cursor to local space
      const localPt = mapScreenToImage(
        screenXPct,
        screenYPct,
        project.crop.rotation,
        project.crop.flipX,
        project.crop.flipY
      );

      // Map start cursor to local space
      const startLocalPt = mapScreenToImage(
        start.pointerX,
        start.pointerY,
        project.crop.rotation,
        project.crop.flipX,
        project.crop.flipY
      );

      const dxPct = localPt.x - startLocalPt.x;
      const dyPct = localPt.y - startLocalPt.y;

      const xs = [
        start.perspective.tl.x,
        start.perspective.tr.x,
        start.perspective.br.x,
        start.perspective.bl.x,
      ];
      const ys = [
        start.perspective.tl.y,
        start.perspective.tr.y,
        start.perspective.br.y,
        start.perspective.bl.y,
      ];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const clampedDx = clamp(dxPct, -minX, 100 - maxX);
      const clampedDy = clamp(dyPct, -minY, 100 - maxY);

      const next = {
        tl: {
          x: start.perspective.tl.x + clampedDx,
          y: start.perspective.tl.y + clampedDy,
        },
        tr: {
          x: start.perspective.tr.x + clampedDx,
          y: start.perspective.tr.y + clampedDy,
        },
        br: {
          x: start.perspective.br.x + clampedDx,
          y: start.perspective.br.y + clampedDy,
        },
        bl: {
          x: start.perspective.bl.x + clampedDx,
          y: start.perspective.bl.y + clampedDy,
        },
      };

      queuePerspectiveRender(next);
    };

    const handleUp = () => {
      setIsMovingCropBox(false);
      cropBoxDragStartRef.current = null;
      cancelPerspectiveRender();

      if (latestPerspectiveRef.current) {
        setCropPerspective(latestPerspectiveRef.current);
      }

      draftPerspectiveRef.current = null;
      setDraftPerspective(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [
    isMovingCropBox,
    cancelPerspectiveRender,
    queuePerspectiveRender,
    setCropPerspective,
    project.crop.rotation,
    project.crop.flipX,
    project.crop.flipY,
  ]);

  const clipPath = React.useMemo(
    () =>
      `polygon(${displayedPerspective.tl.x}% ${displayedPerspective.tl.y}%, ${displayedPerspective.tr.x}% ${displayedPerspective.tr.y}%, ${displayedPerspective.br.x}% ${displayedPerspective.br.y}%, ${displayedPerspective.bl.x}% ${displayedPerspective.bl.y}%)`,
    [displayedPerspective],
  );

  const transformStyle = React.useMemo(
    () => ({
      transform: `rotate(${project.crop.rotation}deg) scaleX(${
        project.crop.flipX ? -1 : 1
      }) scaleY(${project.crop.flipY ? -1 : 1})`,
      transformOrigin: "center center",
    }),
    [project.crop.flipX, project.crop.flipY, project.crop.rotation],
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      onDropFile(file);
    }
  };

  const handleTextPopoverOpenChange = (open: boolean) => {
    if (!open) {
      setEditingTextId(null);
      exitCanvasTextEditing();
      return;
    }

    setEditingTextId(selectedTextId);
  };

  const getVisibleTextLayer = React.useCallback(
    (layer: TextLayer): TextLayer => ({
      ...mapLayerToWorkspace(layer),
      ...draftTextLayerUpdates[layer.id],
    }),
    [draftTextLayerUpdates, mapLayerToWorkspace],
  );

  const commitTextLayerDraft = React.useCallback(
    (layerId: string, updates: Partial<TextLayer>) => {
      setDraftTextLayerUpdates((current) => {
        const next = { ...current };
        delete next[layerId];
        return next;
      });

      if (!Object.keys(updates).length) {
        return;
      }

      updateTextLayerInWorkspace(layerId, updates);
    },
    [updateTextLayerInWorkspace],
  );

  const startTextLayerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>, layer: TextLayer) => {
      if (!stageSize.width || !stageSize.height) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectedTextId(layer.id);
      setEditingTextId(null);

      const stageNode = captureRef.current;

      if (!stageNode) {
        return;
      }

      const rect = stageNode.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLayer = getVisibleTextLayer(layer);
      let nextUpdates: Partial<TextLayer> = {};

      const handleMove = (moveEvent: PointerEvent) => {
        if (viewportGestureActiveRef.current) {
          return;
        }

        moveEvent.preventDefault();
        const dxPct = ((moveEvent.clientX - startX) / rect.width) * 100;
        const dyPct = ((moveEvent.clientY - startY) / rect.height) * 100;
        nextUpdates = {
          xPct: clamp(startLayer.xPct + dxPct, 0, 100),
          yPct: clamp(startLayer.yPct + dyPct, 0, 100),
        };

        queueTextDraftRender(layer.id, nextUpdates);
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        cancelTextDraftRender();
        commitTextLayerDraft(
          layer.id,
          viewportGestureActiveRef.current ? {} : nextUpdates,
        );
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp, { once: true });
    },
    [
      commitTextLayerDraft,
      cancelTextDraftRender,
      getVisibleTextLayer,
      queueTextDraftRender,
      setSelectedTextId,
      stageSize.height,
      stageSize.width,
    ],
  );

  const startTextLayerResize = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, layer: TextLayer) => {
      if (!stageSize.width || !stageSize.height) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectedTextId(layer.id);
      setEditingTextId(null);

      const stageNode = captureRef.current;

      if (!stageNode) {
        return;
      }

      const rect = stageNode.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLayer = getVisibleTextLayer(layer);
      let nextUpdates: Partial<TextLayer> = {};

      const handleMove = (moveEvent: PointerEvent) => {
        if (viewportGestureActiveRef.current) {
          return;
        }

        moveEvent.preventDefault();
        const dxPct = ((moveEvent.clientX - startX) / rect.width) * 100;
        const dyPct = ((moveEvent.clientY - startY) / rect.height) * 100;
        nextUpdates = {
          widthPct: clamp(startLayer.widthPct + dxPct * 2, 8, 100),
          fontSizePct: clamp(startLayer.fontSizePct + dyPct, 1.2, 42),
        };

        queueTextDraftRender(layer.id, nextUpdates);
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        cancelTextDraftRender();
        commitTextLayerDraft(
          layer.id,
          viewportGestureActiveRef.current ? {} : nextUpdates,
        );
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp, { once: true });
    },
    [
      commitTextLayerDraft,
      cancelTextDraftRender,
      getVisibleTextLayer,
      queueTextDraftRender,
      setSelectedTextId,
      stageSize.height,
      stageSize.width,
    ],
  );

  const resetViewport = React.useCallback(() => {
    queueViewport({
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    });
    commitViewport();
  }, [commitViewport, queueViewport]);

  const nudgeZoom = React.useCallback((delta: number) => {
    const current = latestViewportRef.current;
    let nextZoom = clamp(round(current.zoom + delta, 2), 0.6, 2.6);

    if (Math.abs(nextZoom - 1.0) < 0.06) {
      nextZoom = 1.0;
    }

    queueViewport(zoomCanvasViewportAtPoint(current, nextZoom, { x: 0, y: 0 }));
    commitViewport();
  }, [commitViewport, queueViewport]);

  const handleViewportPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!project.imageSrc) {
      return;
    }

    if (event.pointerType === "touch") {
      const pointers = activeTouchPointersRef.current;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size >= 2) {
        event.preventDefault();
        event.stopPropagation();
        viewportGestureActiveRef.current = true;
        const [first, second] = [...pointers.values()];
        const centre = getPointCentre(first, second);
        pointerPinchRef.current = {
          distance: Math.max(1, getPointDistance(first, second)),
          viewport: latestViewportRef.current,
          centre: getViewportPoint(centre.x, centre.y),
        };
        panOriginRef.current = null;

        for (const pointerId of pointers.keys()) {
          try {
            event.currentTarget.setPointerCapture(pointerId);
          } catch {
            // A pointer may have ended between the event and capture request.
          }
        }
        return;
      }

      const target = event.target as HTMLElement;
      const editsCanvasObject = activeTab === "crop" || activeTab === "text";
      const isControl = Boolean(
        target.closest("button, input, textarea, select, label"),
      );
      const currentViewport = latestViewportRef.current;

      if (!editsCanvasObject && !isControl && currentViewport.zoom > 1.01) {
        event.preventDefault();
        event.stopPropagation();
        viewportGestureActiveRef.current = true;
        viewportRectRef.current =
          viewportSurfaceRef.current?.getBoundingClientRect() ?? null;
        panOriginRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          offsetX: currentViewport.offsetX,
          offsetY: currentViewport.offsetY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }

    const currentViewport = latestViewportRef.current;
    const allowPointerPan = spacePressed || event.button === 1;

    if (!allowPointerPan) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    viewportGestureActiveRef.current = true;
    viewportRectRef.current =
      viewportSurfaceRef.current?.getBoundingClientRect() ?? null;
    panOriginRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: currentViewport.offsetX,
      offsetY: currentViewport.offsetY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.style.cursor = "grabbing";
  };

  const handleViewportPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const pointer = coalesced.length
      ? coalesced[coalesced.length - 1]
      : event.nativeEvent;

    if (event.pointerType === "touch") {
      const pointers = activeTouchPointersRef.current;
      if (!pointers.has(event.pointerId)) {
        return;
      }

      pointers.set(event.pointerId, {
        x: pointer.clientX,
        y: pointer.clientY,
      });

      if (pointers.size >= 2 && pointerPinchRef.current) {
        event.preventDefault();
        event.stopPropagation();
        const [first, second] = [...pointers.values()];
        const distance = Math.max(1, getPointDistance(first, second));
        const pinchScale = distance / pointerPinchRef.current.distance;
        const centre = getPointCentre(first, second);
        const currentCentre = getViewportPoint(centre.x, centre.y);
        const zoomed = zoomCanvasViewportAtPoint(
          pointerPinchRef.current.viewport,
          pointerPinchRef.current.viewport.zoom * pinchScale,
          pointerPinchRef.current.centre,
        );

        queueViewport(
          translateCanvasViewport(zoomed, {
            x: currentCentre.x - pointerPinchRef.current.centre.x,
            y: currentCentre.y - pointerPinchRef.current.centre.y,
          }),
        );
        return;
      }
    }

    const origin = panOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    queueViewport({
      ...latestViewportRef.current,
      offsetX: origin.offsetX + (pointer.clientX - origin.x),
      offsetY: origin.offsetY + (pointer.clientY - origin.y),
    });
  };

  const handleViewportPointerEnd = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.pointerType === "touch") {
      const pointers = activeTouchPointersRef.current;
      const wasViewportGesture = viewportGestureActiveRef.current;
      pointers.delete(event.pointerId);

      if (pointers.size >= 2) {
        const [first, second] = [...pointers.values()];
        const centre = getPointCentre(first, second);
        pointerPinchRef.current = {
          distance: Math.max(1, getPointDistance(first, second)),
          viewport: latestViewportRef.current,
          centre: getViewportPoint(centre.x, centre.y),
        };
        return;
      }

      pointerPinchRef.current = null;

      if (pointers.size === 1 && wasViewportGesture) {
        const [[pointerId, remaining]] = [...pointers.entries()];
        const current = latestViewportRef.current;
        panOriginRef.current = {
          pointerId,
          x: remaining.x,
          y: remaining.y,
          offsetX: current.offsetX,
          offsetY: current.offsetY,
        };
        return;
      }

      if (pointers.size === 0 && wasViewportGesture) {
        panOriginRef.current = null;
        commitViewport();
        // Child tool listeners also finish on this pointerup. Keep the guard
        // set until native propagation completes so a pinch cannot commit a
        // half-moved crop or text layer.
        queueMicrotask(() => {
          viewportGestureActiveRef.current = false;
        });
      }
      return;
    }

    if (panOriginRef.current?.pointerId !== event.pointerId) {
      return;
    }

    panOriginRef.current = null;
    viewportGestureActiveRef.current = false;
    event.currentTarget.style.cursor = "";
    commitViewport();
  };

  const handleViewportWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!project.imageSrc) {
      return;
    }

    // Command-wheel is reserved for the browser. Ctrl-wheel is also how
    // browsers report a trackpad pinch, so it remains an editor gesture.
    if (event.metaKey) {
      return;
    }

    event.preventDefault();

    const currentViewport = latestViewportRef.current;
    const pageSize = viewportSurfaceRef.current?.clientHeight ?? 800;
    const deltaPixels =
      event.deltaY *
      (event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? pageSize
          : 1);
    const sensitivity = event.ctrlKey ? 0.008 : 0.0018;
    const nextZoom = currentViewport.zoom * Math.exp(-deltaPixels * sensitivity);
    const focalPoint = getViewportPoint(event.clientX, event.clientY);

    queueViewport(
      zoomCanvasViewportAtPoint(currentViewport, nextZoom, focalPoint),
    );
    scheduleViewportCommit();
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#111111]"
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) {
          return;
        }

        setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      {!project.imageSrc ? (
        <button
          type="button"
          onClick={onRequestUpload}
          className={cn(
            "relative flex w-full max-w-5xl items-center justify-center border border-dashed px-5 py-14 sm:px-10 sm:py-24 transition-colors",
            dragActive
              ? "border-[var(--accent)] bg-[rgba(245,158,11,0.04)]"
              : "border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(245,158,11,0.35)]",
          )}
        >
          <div className="space-y-8 text-center">
            <FilmFrameIcon />
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.34em] text-[var(--text-primary)] sm:text-lg sm:tracking-[0.72em]">
                Drop Your Frame
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                PNG, JPG, WEBP, AVIF, HEIC up to 50MB
              </p>
              <p className="mx-auto max-w-sm text-xs leading-5 text-[var(--text-muted)]">
                Your photo stays in this browser while you apply film looks,
                color adjustments, grain, crops, overlays, and text.
              </p>
            </div>
            <div className="mx-auto flex h-11 items-center justify-center border border-[var(--border)] bg-[var(--surface)] px-5 text-[11px] uppercase tracking-[0.28em] text-[var(--text-primary)]">
              Click To Upload
            </div>
          </div>
        </button>
      ) : (
        <div
          ref={viewportSurfaceRef}
          className="relative flex h-full w-full items-center justify-center px-3 py-3 sm:px-6 sm:py-6 lg:px-10 lg:py-10"
          onWheel={handleViewportWheel}
          style={
            mobileBottomInset
              ? { paddingBottom: mobileBottomInset + 12 }
              : undefined
          }
        >
          <div className="absolute left-6 top-6 z-20 hidden select-none items-center gap-3 sm:flex">
            <div className="max-w-[56vw] border border-[var(--border)] bg-[rgba(10,10,10,0.82)] px-3 py-2 sm:max-w-[320px]">
              <p className="truncate font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent)] sm:tracking-[0.24em]">
                {project.imageName ?? "Untitled Frame"}
              </p>
            </div>
            {activeLook ? (
              <div className="hidden max-w-[220px] border border-[var(--border)] bg-[rgba(10,10,10,0.82)] px-3 py-2 sm:block">
                <p className="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] sm:tracking-[0.22em]">
                  {activeLook.name}
                </p>
              </div>
            ) : null}
          </div>

          <div
            ref={viewportTransformRef}
            className={cn(
              "relative flex items-center justify-center [will-change:transform]",
              project.imageSrc && spacePressed && "cursor-grab",
            )}
            onPointerDownCapture={handleViewportPointerDown}
            onPointerMoveCapture={handleViewportPointerMove}
            onPointerUpCapture={handleViewportPointerEnd}
            onPointerCancelCapture={handleViewportPointerEnd}
            style={{
              transform: canvasViewportTransform(viewport),
              transformOrigin: "center center",
              touchAction: "none",
              backfaceVisibility: "hidden",
              WebkitFontSmoothing: "antialiased",
              willChange: "transform",
            }}
          >
            <div
              ref={captureRef}
              className="relative overflow-hidden bg-[#111111] shadow-[0_28px_100px_rgba(0,0,0,0.6)]"
              style={{ width: stageSize.width, height: stageSize.height }}
            >
              <div className="absolute inset-0" style={transformStyle}>
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: activeTab === "crop" ? clipPath : undefined }}
                >
                  <div className="absolute inset-0 isolate overflow-hidden">
                    <canvas
                      ref={previewCanvasRef}
                      className="absolute inset-0 z-0 h-full w-full"
                    />
                  </div>

                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 z-10 h-full w-full"
                  />

                  {activeTab === "text" ? (
                    <div className="absolute inset-0 z-20">
                      {project.textLayers.map((layer) => {
                        const visibleLayer = getVisibleTextLayer(layer);
                        const fontSize = fromPercentage(
                          visibleLayer.fontSizePct,
                          stageSize.height,
                        );
                        const isSelected = selectedTextId === layer.id;

                        return (
                          <div
                            key={layer.id}
                            role="button"
                            tabIndex={0}
                            onPointerDown={(event) =>
                              startTextLayerMove(event, layer)
                            }
                            onDoubleClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedTextId(layer.id);
                              setEditingTextId(layer.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") {
                                return;
                              }

                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedTextId(layer.id);
                              setEditingTextId(layer.id);
                            }}
                            className={cn(
                              "absolute -translate-x-1/2 -translate-y-1/2 cursor-move select-none border border-dashed px-1 py-0.5 outline-none touch-none",
                              isSelected
                                ? "border-[var(--accent)] bg-[rgba(245,158,11,0.08)]"
                                : "border-transparent hover:border-[rgba(245,158,11,0.55)]",
                            )}
                            style={{
                              left: `${visibleLayer.xPct}%`,
                              top: `${visibleLayer.yPct}%`,
                              width: `${visibleLayer.widthPct}%`,
                              color: visibleLayer.color,
                              opacity: visibleLayer.opacity,
                              fontFamily: resolveTextFontFamily(
                                visibleLayer.fontFamily,
                              ),
                              fontSize,
                              fontStyle: visibleLayer.fontStyle,
                              fontWeight: visibleLayer.fontWeight,
                              letterSpacing: charSpacingToPixels(
                                visibleLayer.letterSpacing,
                                fontSize,
                              ),
                              lineHeight: visibleLayer.lineHeight,
                              textAlign: visibleLayer.textAlign,
                              whiteSpace: "pre-wrap",
                              overflowWrap: "break-word",
                              textShadow: "none",
                            }}
                          >
                            {visibleLayer.text}
                            {isSelected ? (
                              <button
                                type="button"
                                aria-label="Resize text"
                                onPointerDown={(event) =>
                                  startTextLayerResize(event, layer)
                                }
                                className="absolute -bottom-5 -right-5 size-10 cursor-nwse-resize rounded-full border border-transparent bg-transparent after:absolute after:left-1/2 after:top-1/2 after:size-4 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border after:border-black after:bg-[var(--accent)] after:content-[''] sm:-bottom-2 sm:-right-2 sm:size-4 sm:rounded-none sm:border-black sm:bg-[var(--accent)] sm:after:hidden"
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {activeTab === "crop" ? (
                  <div className="absolute inset-0 z-20">
                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {/* Draggable crop box interior */}
                      <polygon
                        points={`${displayedPerspective.tl.x},${displayedPerspective.tl.y} ${displayedPerspective.tr.x},${displayedPerspective.tr.y} ${displayedPerspective.br.x},${displayedPerspective.br.y} ${displayedPerspective.bl.x},${displayedPerspective.bl.y}`}
                        fill="rgba(245, 158, 11, 0.05)"
                        className="pointer-events-auto cursor-move"
                        onPointerDown={handleCropBoxPointerDown}
                      />

                      {/* Rule of Thirds Grid Lines (fades in on drag/move) */}
                      <g
                        className="transition-opacity duration-200"
                        style={{
                          opacity: dragCorner !== null || dragEdge !== null || isMovingCropBox ? 0.45 : 0.1,
                        }}
                      >
                        {/* Vertical 1/3 */}
                        <line
                          x1={displayedPerspective.tl.x + (displayedPerspective.tr.x - displayedPerspective.tl.x) / 3}
                          y1={displayedPerspective.tl.y}
                          x2={displayedPerspective.bl.x + (displayedPerspective.br.x - displayedPerspective.bl.x) / 3}
                          y2={displayedPerspective.bl.y}
                          stroke="#f59e0b"
                          strokeWidth="0.25"
                          className="pointer-events-none"
                        />
                        {/* Vertical 2/3 */}
                        <line
                          x1={displayedPerspective.tl.x + 2 * (displayedPerspective.tr.x - displayedPerspective.tl.x) / 3}
                          y1={displayedPerspective.tl.y}
                          x2={displayedPerspective.bl.x + 2 * (displayedPerspective.br.x - displayedPerspective.bl.x) / 3}
                          y2={displayedPerspective.bl.y}
                          stroke="#f59e0b"
                          strokeWidth="0.25"
                          className="pointer-events-none"
                        />
                        {/* Horizontal 1/3 */}
                        <line
                          x1={displayedPerspective.tl.x}
                          y1={displayedPerspective.tl.y + (displayedPerspective.bl.y - displayedPerspective.tl.y) / 3}
                          x2={displayedPerspective.tr.x}
                          y2={displayedPerspective.tr.y + (displayedPerspective.br.y - displayedPerspective.tr.y) / 3}
                          stroke="#f59e0b"
                          strokeWidth="0.25"
                          className="pointer-events-none"
                        />
                        {/* Horizontal 2/3 */}
                        <line
                          x1={displayedPerspective.tl.x}
                          y1={displayedPerspective.tl.y + 2 * (displayedPerspective.bl.y - displayedPerspective.tl.y) / 3}
                          x2={displayedPerspective.tr.x}
                          y2={displayedPerspective.tr.y + 2 * (displayedPerspective.br.y - displayedPerspective.tr.y) / 3}
                          stroke="#f59e0b"
                          strokeWidth="0.25"
                          className="pointer-events-none"
                        />
                      </g>

                      {/* Main crop box border */}
                      <polyline
                        points={`${displayedPerspective.tl.x},${displayedPerspective.tl.y} ${displayedPerspective.tr.x},${displayedPerspective.tr.y} ${displayedPerspective.br.x},${displayedPerspective.br.y} ${displayedPerspective.bl.x},${displayedPerspective.bl.y} ${displayedPerspective.tl.x},${displayedPerspective.tl.y}`}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="0.4"
                        strokeDasharray="1 1.2"
                        className="pointer-events-none"
                      />
                    </svg>

                    {/* Edge Handle Overlays */}
                    {/* Top edge */}
                    <div
                      className="absolute z-30 cursor-ns-resize"
                      style={{
                        left: `${displayedPerspective.tl.x}%`,
                        top: `${displayedPerspective.tl.y - 1}%`,
                        width: `${displayedPerspective.tr.x - displayedPerspective.tl.x}%`,
                        height: "2%",
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startCropDrag();
                        setDragEdge("top");
                      }}
                    />
                    {/* Bottom edge */}
                    <div
                      className="absolute z-30 cursor-ns-resize"
                      style={{
                        left: `${displayedPerspective.bl.x}%`,
                        top: `${displayedPerspective.bl.y - 1}%`,
                        width: `${displayedPerspective.br.x - displayedPerspective.bl.x}%`,
                        height: "2%",
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startCropDrag();
                        setDragEdge("bottom");
                      }}
                    />
                    {/* Left edge */}
                    <div
                      className="absolute z-30 cursor-ew-resize"
                      style={{
                        left: `${displayedPerspective.tl.x - 1}%`,
                        top: `${displayedPerspective.tl.y}%`,
                        width: "2%",
                        height: `${displayedPerspective.bl.y - displayedPerspective.tl.y}%`,
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startCropDrag();
                        setDragEdge("left");
                      }}
                    />
                    {/* Right edge */}
                    <div
                      className="absolute z-30 cursor-ew-resize"
                      style={{
                        left: `${displayedPerspective.tr.x - 1}%`,
                        top: `${displayedPerspective.tr.y}%`,
                        width: "2%",
                        height: `${displayedPerspective.br.y - displayedPerspective.tr.y}%`,
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startCropDrag();
                        setDragEdge("right");
                      }}
                    />

                    {/* Corner handles */}
                    {(
                      Object.entries(displayedPerspective) as [
                        keyof typeof displayedPerspective,
                        { x: number; y: number },
                      ][]
                    ).map(([corner, point]) => (
                      <button
                        key={corner}
                        type="button"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          startCropDrag();
                          setDragCorner(corner);
                        }}
                        aria-label={`Resize crop from ${corner} corner`}
                        className="absolute z-40 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-transparent bg-transparent after:absolute after:left-1/2 after:top-1/2 after:size-5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border after:border-black after:bg-[var(--accent)] after:content-[''] sm:size-4 sm:rounded-none sm:border-black sm:bg-[var(--accent)] sm:after:hidden"
                        style={{ left: `${point.x}%`, top: `${point.y}%` }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

            </div>
          </div>

          {dragActive ? (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[rgba(0,0,0,0.45)]">
              <div className="border border-[var(--accent)] bg-[rgba(10,10,10,0.92)] px-5 py-4 text-[11px] uppercase tracking-[0.36em] text-[var(--accent)]">
                Drop To Replace Frame
              </div>
            </div>
          ) : null}

          <Popover
            open={Boolean(
              selectedTextLayer && effectiveEditingTextId === selectedTextId,
            )}
            onOpenChange={handleTextPopoverOpenChange}
          >
            <PopoverAnchor asChild>
              <button
                type="button"
                aria-hidden="true"
                className="pointer-events-none absolute right-6 top-6 size-0 opacity-0"
              />
            </PopoverAnchor>
            {selectedTextLayer ? (
              <PopoverContent
                align="end"
                className="flex max-h-[min(80dvh,720px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl p-0 sm:rounded-none"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                  <div className="space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
                        Text Overlay
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                        Edit this Fabric text layer directly on the canvas.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeTextLayer(selectedTextLayer.id)}
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-primary)]">
                      Copy
                    </p>
                    <textarea
                      value={selectedTextLayer.text}
                      onChange={(event) =>
                        updateTextLayer(selectedTextLayer.id, {
                          text: event.target.value,
                        })
                      }
                      className="min-h-[88px] w-full border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition-colors focus:border-[rgba(245,158,11,0.5)]"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-primary)]">
                        Font Family
                      </p>
                      <Select
                        value={selectedTextLayer.fontFamily}
                        onValueChange={(value) =>
                          updateTextLayer(selectedTextLayer.id, {
                            fontFamily: value as FontFamilyKey,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_FAMILY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-primary)]">
                        Weight
                      </p>
                      <Select
                        value={selectedTextLayer.fontWeight}
                        onValueChange={(value) =>
                          updateTextLayer(selectedTextLayer.id, {
                            fontWeight: value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="300">Light</SelectItem>
                          <SelectItem value="400">Regular</SelectItem>
                          <SelectItem value="500">Medium</SelectItem>
                          <SelectItem value="600">Semibold</SelectItem>
                          <SelectItem value="700">Bold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-primary)]">
                        Blend Mode
                      </p>
                      <Select
                        value={selectedTextLayer.blendMode}
                        onValueChange={(value) =>
                          updateTextLayer(selectedTextLayer.id, {
                            blendMode: value as BlendMode,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BLEND_MODE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-primary)]">
                        Style
                      </p>
                      <Button
                        size="sm"
                        variant={
                          selectedTextLayer.fontStyle === "italic"
                            ? "default"
                            : "outline"
                        }
                        className="w-full italic"
                        onClick={() =>
                          updateTextLayer(selectedTextLayer.id, {
                            fontStyle:
                              selectedTextLayer.fontStyle === "italic"
                                ? "normal"
                                : "italic",
                          })
                        }
                      >
                        Italic
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-primary)]">
                          Font Size
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {Math.round(
                            fromPercentage(
                              selectedWorkspaceTextLayer?.fontSizePct ??
                                selectedTextLayer.fontSizePct,
                              stageSize.height,
                            ),
                          )}
                          px
                        </span>
                      </div>
                      <Slider
                        min={1.2}
                        max={42}
                        step={0.2}
                        value={[
                          selectedWorkspaceTextLayer?.fontSizePct ??
                            selectedTextLayer.fontSizePct,
                        ]}
                        onValueChange={([value]) =>
                          updateTextLayerInWorkspace(selectedTextLayer.id, {
                            fontSizePct: value,
                            letterSpacing: pixelsToCharSpacing(
                              selectedTextTracking,
                              fromPercentage(value, stageSize.height),
                            ),
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-primary)]">
                          Box Width
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {Math.round(selectedTextWidth)}px
                        </span>
                      </div>
                      <Slider
                        min={12}
                        max={100}
                        step={1}
                        value={[
                          selectedWorkspaceTextLayer?.widthPct ??
                            selectedTextLayer.widthPct,
                        ]}
                        onValueChange={([value]) =>
                          updateTextLayerInWorkspace(selectedTextLayer.id, {
                            widthPct: value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-primary)]">
                          Tracking
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {round(selectedTextTracking, 1)}px
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={trackingSliderMax}
                        step={0.5}
                        value={[selectedTextTracking]}
                        onValueChange={([value]) =>
                          updateTextLayer(selectedTextLayer.id, {
                            letterSpacing: pixelsToCharSpacing(
                              value,
                              selectedTextFontSize,
                            ),
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-primary)]">
                          Line Height
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {round(selectedTextLayer.lineHeight, 2)}
                        </span>
                      </div>
                      <Slider
                        min={0.8}
                        max={2}
                        step={0.05}
                        value={[selectedTextLayer.lineHeight]}
                        onValueChange={([value]) =>
                          updateTextLayer(selectedTextLayer.id, {
                            lineHeight: value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-primary)]">
                          Opacity
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {Math.round(selectedTextLayer.opacity * 100)}%
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[selectedTextLayer.opacity * 100]}
                        onValueChange={([value]) =>
                          updateTextLayer(selectedTextLayer.id, {
                            opacity: value / 100,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_88px]">
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-primary)]">
                        Shadow
                      </p>
                      <Select
                        value={selectedTextLayer.shadowPreset}
                        onValueChange={(value) =>
                          updateTextLayer(selectedTextLayer.id, {
                            shadowPreset: value as ShadowPreset,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SHADOW_PRESET_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <label className="space-y-2">
                      <span className="block text-[11px] uppercase tracking-[0.24em] text-[var(--text-primary)]">
                        Color
                      </span>
                      <input
                        type="color"
                        value={selectedTextLayer.color}
                        onChange={(event) =>
                          updateTextLayer(selectedTextLayer.id, {
                            color: event.target.value,
                          })
                        }
                        className="h-11 w-full border border-[var(--border)] bg-transparent p-1"
                      />
                    </label>
                  </div>
                  </div>
                </div>
                <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] p-3">
                  <Button
                    variant="amber"
                    className="h-11 w-full rounded-xl"
                    onClick={() => handleTextPopoverOpenChange(false)}
                  >
                    <Check className="size-4" />
                    Done Editing
                  </Button>
                </div>
              </PopoverContent>
            ) : null}
          </Popover>
        </div>
      )}

      {project.imageSrc ? (
        <>
          <div className="pointer-events-none absolute right-3 z-10 hidden items-center gap-2 sm:bottom-6 sm:right-6 sm:flex sm:gap-3">
            <div className="hidden border border-[var(--border)] bg-[rgba(10,10,10,0.82)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)] sm:block">
              {Math.round(stageSize.width)} x {Math.round(stageSize.height)}
            </div>
            <button
              type="button"
              onClick={onRequestUpload}
              className="pointer-events-auto flex min-w-0 items-center gap-2 overflow-hidden border border-[var(--border)] bg-[rgba(10,10,10,0.82)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-primary)] transition-colors hover:border-[rgba(245,158,11,0.4)] hover:text-[var(--accent)] sm:text-[11px] sm:tracking-[0.16em]"
            >
              <Upload className="size-3.5" />
              Replace
            </button>
          </div>

          <div
            role="toolbar"
            aria-label="Canvas controls"
            className="scrollbar-none absolute bottom-3 left-1/2 z-10 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 touch-pan-x items-center justify-start gap-1 overflow-x-auto whitespace-nowrap rounded-full border border-[var(--border)] bg-[#0a0a0a] px-1.5 py-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.45)] sm:bottom-6 sm:gap-2 sm:rounded-none sm:bg-[rgba(10,10,10,0.9)] sm:px-2 sm:py-2 sm:backdrop-blur-xl"
          >
            {selectedTextLayer ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Delete selected text"
                onClick={() => {
                  removeTextLayer(selectedTextLayer.id);
                  setSelectedTextId(null);
                  setEditingTextId(null);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
            {selectedTextLayer ? (
              <Button
                size="sm"
                aria-label="Edit selected text"
                variant={
                  effectiveEditingTextId === selectedTextLayer.id ? "amber" : "outline"
                }
                onClick={() =>
                  setEditingTextId((current) => {
                    if (current === selectedTextLayer.id) {
                      exitCanvasTextEditing();
                      return null;
                    }

                    return selectedTextLayer.id;
                  })
                }
              >
                Text
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label="Zoom out"
              onClick={() => nudgeZoom(-0.1)}
            >
              -
            </Button>
            <div
              ref={zoomReadoutRef}
              className="min-w-[58px] px-1 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)] sm:min-w-[88px] sm:px-3 sm:text-[11px] sm:tracking-[0.22em]"
            >
              {Math.round(viewport.zoom * 100)}%
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Zoom in"
              onClick={() => nudgeZoom(0.1)}
            >
              +
            </Button>
            <Button size="sm" variant="outline" onClick={resetViewport}>
              Fit
            </Button>
            <div className="hidden min-w-0 max-w-[36vw] border-l border-[var(--border)] pl-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] xl:block">
              <span className="block truncate">
                Move • Resize Corners • Double-Click Edit • Space to Pan •
                Delete to Remove
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
});
