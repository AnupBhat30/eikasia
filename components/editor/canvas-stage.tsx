"use client";

import * as React from "react";
import { Canvas, Shadow, Textbox } from "fabric";
import { Trash2, Upload } from "lucide-react";

import {
  BLEND_MODE_OPTIONS,
  FONT_FAMILY_OPTIONS,
  SHADOW_PRESET_OPTIONS,
  getLookDefinition,
} from "@/components/editor/constants";
import { useEditor } from "@/components/editor/editor-context";
import type {
  BlendMode,
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
import { getTextShadowStyle, resolveTextFontFamily } from "@/lib/text-style";
import { drawCoverImage, renderProjectRaster } from "@/lib/exportImage";
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

interface CropBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const CONTAINER_SIZE_JITTER_TOLERANCE_PX = 2;
const CONTAINER_SIZE_SETTLE_MS = 80;

export interface CanvasStageHandle {
  getElement: () => HTMLDivElement | null;
  deselectText: () => void;
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

function fitStage(natural: StageSize | null, available: StageSize): StageSize {
  const minSide = Math.min(available.width, available.height);
  const compactness = clamp((760 - minSide) / 240, 0, 1);
  const minWidth = Math.round(320 - 100 * compactness);
  const minHeight = Math.round(220 - 60 * compactness);
  const horizontalPadding = Math.round(96 - 68 * compactness);
  const verticalPadding = Math.round(96 - 68 * compactness);
  const maxWidth = Math.max(available.width - horizontalPadding, minWidth);
  const maxHeight = Math.max(available.height - verticalPadding, minHeight);

  if (!natural || !natural.width || !natural.height) {
    return {
      width: Math.round(Math.min(960 - 240 * compactness, maxWidth)),
      height: Math.round(Math.min(620 - 100 * compactness, maxHeight)),
    };
  }

  const scale = Math.min(maxWidth / natural.width, maxHeight / natural.height);

  return {
    width: Math.round(Math.max(minWidth, natural.width * scale)),
    height: Math.round(Math.max(minHeight, natural.height * scale)),
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

function createTextShadow(preset: ShadowPreset, color: string) {
  const shadow = getTextShadowStyle(preset, color);

  return shadow ? new Shadow(shadow) : null;
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
  const baseSize = stageSize.height;
  const fontSize = fromPercentage(layer.fontSizePct, baseSize);

  textbox.set({
    left: fromPercentage(layer.xPct, stageSize.width),
    top: fromPercentage(layer.yPct, stageSize.height),
    originX: "center",
    originY: "center",
    scaleX: 1,
    scaleY: 1,
    width: fromPercentage(layer.widthPct, stageSize.width),
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
    editable: true,
    padding: Math.max(4, Math.round(fontSize * 0.05)),
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
  textbox.shadow = createTextShadow(layer.shadowPreset, layer.color);
  textbox.globalCompositeOperation = blendModeToComposite(layer.blendMode);
  textbox.data = { layerId: layer.id };
  textbox.setCoords();
}

function getCropBounds(
  perspective: ReturnType<typeof useEditor>["project"]["crop"]["perspective"],
  stageSize: StageSize,
): CropBounds {
  const points = [
    perspective.tl,
    perspective.tr,
    perspective.br,
    perspective.bl,
  ];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    left: fromPercentage(minX, stageSize.width),
    top: fromPercentage(minY, stageSize.height),
    right: fromPercentage(maxX, stageSize.width),
    bottom: fromPercentage(maxY, stageSize.height),
  };
}

function snapTextboxToCropGuides(
  textbox: EditorTextbox,
  perspective: ReturnType<typeof useEditor>["project"]["crop"]["perspective"],
  stageSize: StageSize,
) {
  const bounds = getCropBounds(perspective, stageSize);
  const safePad = Math.max(
    8,
    Math.min(stageSize.width, stageSize.height) * 0.02,
  );
  const halfWidth = (textbox.getScaledWidth?.() ?? textbox.width ?? 0) / 2;
  const halfHeight = (textbox.getScaledHeight?.() ?? textbox.height ?? 0) / 2;
  const minX = bounds.left + halfWidth + safePad;
  const maxX = bounds.right - halfWidth - safePad;
  const minY = bounds.top + halfHeight + safePad;
  const maxY = bounds.bottom - halfHeight - safePad;
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const snapThreshold = Math.max(
    8,
    Math.min(stageSize.width, stageSize.height) * 0.018,
  );

  const snap = (value: number, targets: number[]) => {
    let snapped = value;
    let closestDistance = snapThreshold + 1;

    targets.forEach((target) => {
      const distance = Math.abs(value - target);

      if (distance <= snapThreshold && distance < closestDistance) {
        snapped = target;
        closestDistance = distance;
      }
    });

    return snapped;
  };

  const currentLeft = textbox.left ?? 0;
  const currentTop = textbox.top ?? 0;
  const nextLeft = snap(
    currentLeft,
    minX <= maxX ? [minX, centerX, maxX] : [centerX],
  );
  const nextTop = snap(
    currentTop,
    minY <= maxY ? [minY, centerY, maxY] : [centerY],
  );

  if (nextLeft === currentLeft && nextTop === currentTop) {
    return;
  }

  textbox.set({
    left: nextLeft,
    top: nextTop,
  } as never);
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

function getTouchDistance(first: React.Touch, second: React.Touch) {
  return Math.hypot(
    first.clientX - second.clientX,
    first.clientY - second.clientY,
  );
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

export const CanvasStage = React.forwardRef<
  CanvasStageHandle,
  {
    onRequestUpload: () => void;
    onDropFile: (file: File) => void;
  }
>(function CanvasStage({ onRequestUpload, onDropFile }, ref) {
  const {
    project,
    activeTab,
    selectedTextId,
    setSelectedTextId,
    setTextLayers,
    updateTextLayer,
    removeTextLayer,
    setCropPerspective,
  } = useEditor();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const captureRef = React.useRef<HTMLDivElement>(null);
  const previewCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = React.useRef<Canvas | null>(null);
  const isSyncingRef = React.useRef(false);
  const latestPerspectiveRef = React.useRef(project.crop.perspective);
  const latestTextLayersRef = React.useRef(project.textLayers);
  const panOriginRef = React.useRef<{
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
  const [draftPerspective, setDraftPerspective] = React.useState<
    typeof project.crop.perspective | null
  >(null);
  const [viewport, setViewport] = React.useState({
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [editingTextId, setEditingTextId] = React.useState<string | null>(null);
  const [spacePressed, setSpacePressed] = React.useState(false);
  const [panning, setPanning] = React.useState(false);
  const touchPanOriginRef = React.useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const touchPinchRef = React.useRef<{
    distance: number;
    zoom: number;
  } | null>(null);
  const viewportRafRef = React.useRef(0);
  const pendingViewportRef = React.useRef<{
    zoom: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const latestViewportRef = React.useRef(viewport);

  const containerSize = useContainerSize(containerRef);
  const stageSize = React.useMemo(
    () => fitStage(naturalSize, containerSize),
    [containerSize, naturalSize],
  );
  const latestStageSizeRef = React.useRef(stageSize);

  const activeLook = React.useMemo(
    () => getLookDefinition(project.activeLookId),
    [project.activeLookId],
  );
  const rasterProject = React.useMemo<
    Pick<
      ProjectState,
      | "activeLookId"
      | "filterIntensity"
      | "acrosChannel"
      | "adjustments"
      | "overlayLayers"
    >
  >(
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
  const selectedTextLayer = React.useMemo(
    () =>
      project.textLayers.find((layer) => layer.id === selectedTextId) ?? null,
    [project.textLayers, selectedTextId],
  );
  const selectedTextFontSize = selectedTextLayer
    ? fromPercentage(selectedTextLayer.fontSizePct, stageSize.height)
    : 0;
  const selectedTextTracking = selectedTextLayer
    ? charSpacingToPixels(selectedTextLayer.letterSpacing, selectedTextFontSize)
    : 0;
  const trackingSliderMax = Math.max(40, Math.ceil(selectedTextTracking + 4));
  const selectedTextWidth = selectedTextLayer
    ? fromPercentage(selectedTextLayer.widthPct, stageSize.width)
    : 0;

  const displayedPerspective = draftPerspective ?? project.crop.perspective;

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
    }),
    [exitCanvasTextEditing],
  );

  React.useEffect(() => {
    latestPerspectiveRef.current = displayedPerspective;
  }, [displayedPerspective]);

  React.useEffect(() => {
    latestTextLayersRef.current = project.textLayers;
  }, [project.textLayers]);

  React.useEffect(() => {
    latestStageSizeRef.current = stageSize;
  }, [stageSize]);

  React.useEffect(() => {
    latestViewportRef.current = viewport;
  }, [viewport]);

  React.useEffect(
    () => () => {
      if (viewportRafRef.current) {
        window.cancelAnimationFrame(viewportRafRef.current);
      }
    },
    [],
  );

  const queueViewport = React.useCallback(
    (nextViewport: { zoom: number; offsetX: number; offsetY: number }) => {
      const normalizedZoom =
        Math.abs(nextViewport.zoom - 1) < 0.01 ? 1 : nextViewport.zoom;
      const finalViewport =
        normalizedZoom === 1
          ? { zoom: 1, offsetX: 0, offsetY: 0 }
          : {
              zoom: normalizedZoom,
              offsetX: round(nextViewport.offsetX, 2),
              offsetY: round(nextViewport.offsetY, 2),
            };

      pendingViewportRef.current = finalViewport;

      if (viewportRafRef.current) {
        return;
      }

      viewportRafRef.current = window.requestAnimationFrame(() => {
        viewportRafRef.current = 0;
        const pendingViewport = pendingViewportRef.current;
        pendingViewportRef.current = null;

        if (pendingViewport) {
          setViewport((previous) => {
            const sameViewport =
              Math.abs(previous.zoom - pendingViewport.zoom) < 0.001 &&
              Math.abs(previous.offsetX - pendingViewport.offsetX) < 0.01 &&
              Math.abs(previous.offsetY - pendingViewport.offsetY) < 0.01;

            return sameViewport ? previous : pendingViewport;
          });
        }
      });
    },
    [],
  );

  React.useEffect(() => {
    if (!selectedTextId) {
      setEditingTextId(null);
      exitCanvasTextEditing();
      return;
    }

    if (editingTextId && editingTextId !== selectedTextId) {
      setEditingTextId(null);
    }
  }, [editingTextId, exitCanvasTextEditing, selectedTextId]);

  React.useEffect(() => {
    if (activeTab === "text") {
      return;
    }

    setEditingTextId(null);
    exitCanvasTextEditing();
  }, [activeTab, exitCanvasTextEditing]);

  React.useEffect(() => {
    setViewport({
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    });
  }, [project.imageSrc]);

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
      setNaturalSize(null);
      setSourceImage(null);
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
    };
    image.src = project.imageSrc;

    return () => {
      cancelled = true;
    };
  }, [project.imageSrc]);

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
    const grainOverlay = rasterProject.overlayLayers.find(
      (layer) => layer.type === "grain",
    );
    const grainLoadScore =
      rasterProject.adjustments.grainAmount +
      (grainOverlay?.intensity ?? 0) * (grainOverlay?.opacity ?? 0.14);
    const isHeavyGrain = grainLoadScore > 24;
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const isCoarsePointer = mediaQuery.matches;
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
    const fullDpr = useMobileProfile
      ? Math.min(devicePixelRatio, isHeavyGrain ? 1.8 : 2.2)
      : Math.min(devicePixelRatio, isHeavyGrain ? 1.35 : 1.5);
    const fastDpr = useMobileProfile
      ? Math.min(fullDpr, isHeavyGrain ? 1.4 : 1.8)
      : Math.min(fullDpr, isHeavyGrain ? 0.74 : 0.92);
    const fastBudget = useMobileProfile
      ? isHeavyGrain
        ? 1_200_000
        : 1_800_000
      : isHeavyGrain
        ? 780_000
        : 1_080_000;
    const fullBudget = useMobileProfile
      ? isHeavyGrain
        ? 2_200_000
        : 3_200_000
      : isHeavyGrain
        ? 1_420_000
        : 2_000_000;
    const shouldRenderHighQuality =
      !useMobileProfile && fullDpr - fastDpr > 0.01;
    let fastFrameId = 0;
    let fullFrameId = 0;
    let fullRenderTimer = 0;

    const renderPreview = (targetDpr: number, pixelBudget: number) => {
      const estimatedPixels =
        renderWidth * renderHeight * targetDpr * targetDpr;
      const budgetScale =
        estimatedPixels > pixelBudget
          ? Math.sqrt(pixelBudget / estimatedPixels)
          : 1;
      const effectiveDpr = Math.max(0.55, targetDpr * budgetScale);
      const pixelWidth = Math.max(1, Math.round(renderWidth * effectiveDpr));
      const pixelHeight = Math.max(1, Math.round(renderHeight * effectiveDpr));

      if (
        previewCanvas.width !== pixelWidth ||
        previewCanvas.height !== pixelHeight
      ) {
        previewCanvas.width = pixelWidth;
        previewCanvas.height = pixelHeight;
      }

      const context = previewCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) {
        return;
      }

      renderProjectRaster({
        ctx: context,
        state: rasterProject,
        source: sourceImage,
        width: pixelWidth,
        height: pixelHeight,
        drawSource: (renderContext, renderSource, width, height) =>
          drawCoverImage(renderContext, renderSource, width, height),
      });
    };

    fastFrameId = window.requestAnimationFrame(() => {
      renderPreview(fastDpr, fastBudget);
    });

    if (shouldRenderHighQuality) {
      fullRenderTimer = window.setTimeout(() => {
        fullFrameId = window.requestAnimationFrame(() => {
          renderPreview(fullDpr, fullBudget);
        });
      }, 90);
    }

    return () => {
      window.cancelAnimationFrame(fastFrameId);
      window.cancelAnimationFrame(fullFrameId);
      window.clearTimeout(fullRenderTimer);
    };
  }, [rasterProject, sourceImage, stageSize.height, stageSize.width]);

  React.useEffect(() => {
    if (!canvasRef.current || fabricCanvasRef.current) {
      return;
    }

    const canvas = new Canvas(canvasRef.current, {
      preserveObjectStacking: true,
      selectionColor: "rgba(245,158,11,0.08)",
      selectionBorderColor: "#f59e0b",
      backgroundColor: "transparent",
    });

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
        serializeCanvas(canvas, latestTextLayersRef.current, currentStageSize),
      );
    };

    const handleObjectMoving = (event: { target?: unknown }) => {
      const target = event.target as EditorTextbox | null | undefined;
      const currentStageSize = latestStageSizeRef.current;
      const currentPerspective = latestPerspectiveRef.current;

      if (!target || target.type !== "textbox") {
        return;
      }

      if (!currentStageSize.width || !currentStageSize.height) {
        return;
      }

      snapTextboxToCropGuides(target, currentPerspective, currentStageSize);
      keepTextboxPartiallyVisible(target, currentStageSize);
    };

    const handleObjectScaling = (event: { target?: unknown }) => {
      const target = event.target as EditorTextbox | null | undefined;
      const currentStageSize = latestStageSizeRef.current;
      const currentPerspective = latestPerspectiveRef.current;

      if (!target || target.type !== "textbox") {
        return;
      }

      if (!currentStageSize.width || !currentStageSize.height) {
        return;
      }

      normalizeTextboxScale(target);
      snapTextboxToCropGuides(target, currentPerspective, currentStageSize);
      keepTextboxPartiallyVisible(target, currentStageSize);
      canvas.requestRenderAll();
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
    canvas.on("text:editing:entered", openTextControls);
    canvas.on("text:editing:exited", commitLayers);
    canvas.on("object:moving", handleObjectMoving);
    canvas.on("object:scaling", handleObjectScaling);
    canvas.on("object:modified", commitLayers);
    canvas.on("text:changed", commitLayers);

    fabricCanvasRef.current = canvas;

    return () => {
      canvas.off("selection:cleared", handleSelectionCleared);
      canvas.off("object:moving", handleObjectMoving);
      canvas.off("object:scaling", handleObjectScaling);
      canvas.off("mouse:dblclick", openTextControls);
      canvas.off("text:editing:entered", openTextControls);
      canvas.off("text:editing:exited", commitLayers);
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

      if (existing) {
        applyLayerToTextbox(existing, layer, stageSize);
      } else {
        const textbox = new Textbox(layer.text) as EditorTextbox;
        applyLayerToTextbox(textbox, layer, stageSize);
        canvas.add(textbox);
      }

      seen.add(layer.id);
    });

    objectMap.forEach((object, layerId) => {
      if (layerId && !seen.has(layerId)) {
        canvas.remove(object);
      }
    });

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
    isSyncingRef.current = false;
  }, [project.crop.perspective, project.textLayers, selectedTextId, stageSize]);

  React.useEffect(() => {
    if (!dragCorner) {
      return;
    }

    const handleMove = (event: PointerEvent) => {
      const stageNode = captureRef.current;

      if (!stageNode) {
        return;
      }

      const rect = stageNode.getBoundingClientRect();
      const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
      const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

      setDraftPerspective((current) =>
        current
          ? {
              ...current,
              [dragCorner]: { x, y },
            }
          : current,
      );
    };

    const handleUp = () => {
      setDragCorner(null);

      if (latestPerspectiveRef.current) {
        setCropPerspective(latestPerspectiveRef.current);
      }

      setDraftPerspective(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragCorner, setCropPerspective]);

  React.useEffect(() => {
    if (!panning) {
      return;
    }

    const handleMove = (event: PointerEvent) => {
      const origin = panOriginRef.current;

      if (!origin) {
        return;
      }

      queueViewport({
        ...latestViewportRef.current,
        offsetX: origin.offsetX + (event.clientX - origin.x),
        offsetY: origin.offsetY + (event.clientY - origin.y),
      });
    };

    const handleUp = () => {
      setPanning(false);
      panOriginRef.current = null;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [panning, queueViewport]);

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

  const resetViewport = React.useCallback(() => {
    setViewport({
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    });
  }, []);

  const nudgeZoom = React.useCallback((delta: number) => {
    setViewport((current) => {
      let nextZoom = clamp(round(current.zoom + delta, 2), 0.6, 2.6);

      if (Math.abs(nextZoom - 1.0) < 0.06) {
        nextZoom = 1.0;
      }

      if (nextZoom === 1) {
        return { zoom: 1, offsetX: 0, offsetY: 0 };
      }

      return {
        ...current,
        zoom: nextZoom,
      };
    });
  }, []);

  const handleViewportPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!project.imageSrc) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("button, input, textarea, select, label")) {
      return;
    }

    const currentViewport = latestViewportRef.current;
    // Disable panning close to 1.0 zoom to prevent jitter
    const allowPointerPan =
      spacePressed ||
      (event.pointerType === "touch" && currentViewport.zoom > 1.05);

    if (!allowPointerPan) {
      return;
    }

    event.preventDefault();
    panOriginRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: currentViewport.offsetX,
      offsetY: currentViewport.offsetY,
    };
    setPanning(true);
  };

  const handleViewportWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!project.imageSrc) {
      return;
    }

    // Allow browser zoom shortcuts (Ctrl/Cmd + wheel) to behave normally.
    if (event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();

    const currentViewport = latestViewportRef.current;
    const zoomDelta = event.deltaY < 0 ? 0.08 : -0.08;
    const nextZoom = clamp(
      round(currentViewport.zoom + zoomDelta, 2),
      0.6,
      2.6,
    );

    queueViewport({
      ...currentViewport,
      zoom: nextZoom,
    });
  };

  const handleViewportTouchStart = (
    event: React.TouchEvent<HTMLDivElement>,
  ) => {
    if (!project.imageSrc) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, label")) {
      return;
    }

    const currentViewport = latestViewportRef.current;

    if (event.touches.length === 2) {
      const [first, second] = [event.touches[0], event.touches[1]];
      touchPinchRef.current = {
        distance: Math.max(1, getTouchDistance(first, second)),
        zoom: currentViewport.zoom,
      };
      touchPanOriginRef.current = null;
      return;
    }

    if (event.touches.length === 1 && currentViewport.zoom > 1.01) {
      const touch = event.touches[0];
      touchPanOriginRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        offsetX: currentViewport.offsetX,
        offsetY: currentViewport.offsetY,
      };
    }
  };

  const handleViewportTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!project.imageSrc) {
      return;
    }

    if (event.touches.length === 2 && touchPinchRef.current) {
      event.preventDefault();
      const [first, second] = [event.touches[0], event.touches[1]];
      const distance = Math.max(1, getTouchDistance(first, second));
      const pinchScale = distance / touchPinchRef.current.distance;
      const nextZoom = clamp(
        round(touchPinchRef.current.zoom * pinchScale, 2),
        0.6,
        2.6,
      );

      queueViewport({
        ...latestViewportRef.current,
        zoom: nextZoom,
      });
      return;
    }

    if (event.touches.length === 1 && touchPanOriginRef.current) {
      event.preventDefault();
      const touch = event.touches[0];
      queueViewport({
        ...latestViewportRef.current,
        offsetX:
          touchPanOriginRef.current.offsetX +
          (touch.clientX - touchPanOriginRef.current.x),
        offsetY:
          touchPanOriginRef.current.offsetY +
          (touch.clientY - touchPanOriginRef.current.y),
      });
    }
  };

  const handleViewportTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 0) {
      touchPinchRef.current = null;
      touchPanOriginRef.current = null;
      return;
    }

    if (event.touches.length === 1) {
      touchPinchRef.current = null;
      const currentViewport = latestViewportRef.current;
      if (currentViewport.zoom <= 1.01) {
        touchPanOriginRef.current = null;
        return;
      }

      const touch = event.touches[0];
      touchPanOriginRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        offsetX: currentViewport.offsetX,
        offsetY: currentViewport.offsetY,
      };
    }
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
                PNG, JPG, WEBP up to 50MB
              </p>
            </div>
            <div className="mx-auto flex h-11 items-center justify-center border border-[var(--border)] bg-[var(--surface)] px-5 text-[11px] uppercase tracking-[0.28em] text-[var(--text-primary)]">
              Click To Upload
            </div>
          </div>
        </button>
      ) : (
        <div
          className="relative flex h-full w-full items-center justify-center px-3 py-3 sm:px-6 sm:py-6 lg:px-10 lg:py-10"
          onWheel={handleViewportWheel}
        >
          <div className="absolute left-3 top-3 z-20 flex items-center gap-2 sm:left-6 sm:top-6 sm:gap-3">
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
            className={cn(
              "relative flex items-center justify-center [will-change:transform]",
              project.imageSrc && spacePressed && "cursor-grab",
              panning && "cursor-grabbing",
            )}
            onPointerDownCapture={handleViewportPointerDown}
            onTouchStart={handleViewportTouchStart}
            onTouchMove={handleViewportTouchMove}
            onTouchEnd={handleViewportTouchEnd}
            onTouchCancel={handleViewportTouchEnd}
            style={{
              transform: `translate3d(${Math.round(viewport.offsetX)}px, ${Math.round(viewport.offsetY)}px, 0) scale(${viewport.zoom})`,
              transformOrigin: "center center",
              touchAction: "none",
              backfaceVisibility: "hidden",
              WebkitFontSmoothing: "antialiased",
              willChange: "transform",
            }}
          >
            <div
              ref={captureRef}
              className="relative overflow-hidden border border-[var(--border)] bg-[#111111] shadow-[0_28px_100px_rgba(0,0,0,0.6)]"
              style={{ width: stageSize.width, height: stageSize.height }}
            >
              <div className="absolute inset-0" style={transformStyle}>
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath }}
                >
                  <div className="absolute inset-0 isolate overflow-hidden">
                    <canvas
                      ref={previewCanvasRef}
                      className="absolute inset-0 z-0 h-full w-full"
                    />
                  </div>
                </div>

                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 z-10 h-full w-full"
                />
              </div>

              {activeTab === "crop" ? (
                <div className="absolute inset-0 z-20">
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <polyline
                      points={`${displayedPerspective.tl.x},${displayedPerspective.tl.y} ${displayedPerspective.tr.x},${displayedPerspective.tr.y} ${displayedPerspective.br.x},${displayedPerspective.br.y} ${displayedPerspective.bl.x},${displayedPerspective.bl.y} ${displayedPerspective.tl.x},${displayedPerspective.tl.y}`}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="0.4"
                      strokeDasharray="1 1.2"
                    />
                  </svg>
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
                        setDraftPerspective(
                          structuredClone(project.crop.perspective),
                        );
                        setDragCorner(corner);
                      }}
                      className="absolute z-30 size-4 -translate-x-1/2 -translate-y-1/2 border border-black bg-[var(--accent)] shadow-[0_0_0_1px_rgba(245,158,11,0.35)]"
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                    />
                  ))}
                </div>
              ) : null}
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
              selectedTextLayer && editingTextId === selectedTextId,
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
              <PopoverContent align="end" className="w-[min(92vw,380px)]">
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
                        value={[selectedTextLayer.fontSizePct]}
                        onValueChange={([value]) =>
                          updateTextLayer(selectedTextLayer.id, {
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
                        value={[selectedTextLayer.widthPct]}
                        onValueChange={([value]) =>
                          updateTextLayer(selectedTextLayer.id, {
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
              </PopoverContent>
            ) : null}
          </Popover>
        </div>
      )}

      {project.imageSrc ? (
        <>
          <div className="pointer-events-none absolute right-3 z-10 flex items-center gap-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] sm:bottom-6 sm:right-6 sm:gap-3">
            <div className="hidden border border-[var(--border)] bg-[rgba(10,10,10,0.82)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)] sm:block">
              {Math.round(stageSize.width)} x {Math.round(stageSize.height)}
            </div>
            <button
              type="button"
              onClick={onRequestUpload}
              className="pointer-events-auto flex items-center gap-2 border border-[var(--border)] bg-[rgba(10,10,10,0.82)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-primary)] transition-colors hover:border-[rgba(245,158,11,0.4)] hover:text-[var(--accent)] sm:text-[11px] sm:tracking-[0.24em]"
            >
              <Upload className="size-3.5" />
              Replace
            </button>
          </div>

          <div className="absolute left-3 right-3 z-10 flex items-center justify-start gap-2 overflow-x-auto whitespace-nowrap border border-[var(--border)] bg-[rgba(10,10,10,0.88)] px-2 py-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:bottom-6 sm:left-1/2 sm:right-auto sm:justify-center sm:-translate-x-1/2">
            {selectedTextLayer ? (
              <Button
                size="sm"
                variant="ghost"
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
                variant={
                  editingTextId === selectedTextLayer.id ? "amber" : "outline"
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
            <Button size="sm" variant="ghost" onClick={() => nudgeZoom(-0.1)}>
              -
            </Button>
            <div className="min-w-[88px] px-3 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              {Math.round(viewport.zoom * 100)}%
            </div>
            <Button size="sm" variant="ghost" onClick={() => nudgeZoom(0.1)}>
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
