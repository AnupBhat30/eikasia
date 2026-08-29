"use client";

import * as React from "react";
import Image from "next/image";
import {
  ChevronDown,
  ChevronUp,
  Crop,
  Download,
  Film,
  Layers3,
  LoaderCircle,
  Pencil,
  Redo2,
  SlidersHorizontal,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";

import { exportProjectImage } from "@/lib/exportImage";
import {
  CanvasStage,
  type CanvasStageHandle,
} from "@/components/editor/canvas-stage";
import { EditorProvider, useEditor } from "@/components/editor/editor-context";
import { InspectorPanel } from "@/components/editor/inspector-panel";
import type { EditorTabId } from "@/components/editor/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  EXPORT_TARGETS,
  getCroppedSourceDimensions,
  getExportCompatibilityMessage,
  getExportTarget,
  resolveExportDimensions,
  type ExportTarget,
} from "@/lib/social-export";

const SIDEBAR_TABS: {
  id: EditorTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "filters", label: "Filters", icon: Film },
  { id: "adjustments", label: "Adjustments", icon: SlidersHorizontal },
  { id: "text", label: "Text", icon: Type },
  { id: "overlays", label: "Overlays", icon: Layers3 },
  { id: "crop", label: "Crop & Transform", icon: Crop },
];

const EXPORT_QUALITY_OPTIONS = [
  { label: "95", value: "95" },
  { label: "92", value: "92" },
  { label: "88", value: "88" },
  { label: "80", value: "80" },
  { label: "70", value: "70" },
];

const MAX_SOURCE_PIXELS = 100_000_000;
const MAX_SOURCE_SIDE = 24_000;

function loadImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The selected image could not be decoded."));
    image.src = src;
  });
}

function MobileProjectMenu({
  exportFormat,
  exportQuality,
  exportTarget,
  exportSize,
  exportWarning,
  onExportFormatChange,
  onExportQualityChange,
  onExportTargetChange,
  onRequestUpload,
  onResetProject,
  onExport,
  exporting,
  exportDisabled,
}: {
  exportFormat: "png" | "jpeg";
  exportQuality: number;
  exportTarget: ExportTarget;
  exportSize: { width: number; height: number } | null;
  exportWarning: string | null;
  onExportFormatChange: (format: "png" | "jpeg") => void;
  onExportQualityChange: (quality: number) => void;
  onExportTargetChange: (target: ExportTarget) => void;
  onRequestUpload: () => void;
  onResetProject: () => void;
  onExport: () => void;
  exporting: boolean;
  exportDisabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="amber"
          className="size-10 rounded-full"
          aria-label="Open export settings"
        >
          <Download className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex max-h-[min(80dvh,620px)] w-[min(92vw,340px)] flex-col overflow-hidden rounded-2xl p-0"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Export image
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
              Choose where you will share it, then confirm the file settings.
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
              Destination
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {EXPORT_TARGETS.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  aria-pressed={exportTarget === target.id}
                  onClick={() => onExportTargetChange(target.id)}
                  className={cn(
                    "min-w-0 overflow-hidden break-words rounded-lg border px-1.5 py-2 text-[9px] uppercase leading-4 tracking-[0.08em] [overflow-wrap:anywhere] sm:px-2 sm:text-[10px] sm:tracking-[0.1em]",
                    exportTarget === target.id
                      ? "border-[var(--accent)] bg-[rgba(197,160,89,0.12)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-muted)]",
                  )}
                >
                  {target.shortLabel}
                </button>
              ))}
            </div>
            <div className="mt-2 rounded-lg bg-[rgba(255,255,255,0.025)] px-3 py-2">
              <p className="font-mono text-[10px] leading-4 text-[var(--text-primary)]">
                {exportSize
                  ? `${exportSize.width} × ${exportSize.height}px`
                  : getExportTarget(exportTarget).detail}
              </p>
              {exportSize ? (
                <p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">
                  {getExportTarget(exportTarget).detail}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">
                Best crop: {getExportTarget(exportTarget).recommendedCrop}
              </p>
              {exportTarget !== "original" && exportFormat === "png" ? (
                <p className="mt-1 text-[10px] leading-4 text-amber-300">
                  JPG 92 is recommended for social photos; apps commonly convert PNG.
                </p>
              ) : null}
              {exportWarning ? (
                <p className="mt-1 text-[10px] leading-4 text-amber-300">
                  {exportWarning}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
              Export format
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["jpeg", "png"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  aria-pressed={exportFormat === format}
                  onClick={() => onExportFormatChange(format)}
                  className={cn(
                    "min-h-10 rounded-lg border text-[10px] uppercase tracking-[0.18em]",
                    exportFormat === format
                      ? "border-[var(--accent)] bg-[rgba(197,160,89,0.12)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-muted)]",
                  )}
                >
                  {format === "jpeg" ? "JPG" : "PNG"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
              Quality
            </p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {EXPORT_QUALITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={exportQuality === Number(option.value)}
                  onClick={() => onExportQualityChange(Number(option.value))}
                  className={cn(
                    "min-h-10 rounded-lg border font-mono text-[10px]",
                    exportQuality === Number(option.value)
                      ? "border-[var(--accent)] bg-[rgba(197,160,89,0.12)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-muted)]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Project
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="min-w-0 px-2"
                onClick={() => {
                  setOpen(false);
                  onRequestUpload();
                }}
              >
                <Upload className="size-4" />
                Replace
              </Button>
              <Button
                variant="outline"
                className="min-w-0 px-2"
                onClick={() => {
                  onResetProject();
                  setOpen(false);
                }}
              >
                New
              </Button>
            </div>
          </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] p-4">
          <Button
            variant="amber"
            className="h-12 w-full rounded-xl"
            aria-busy={exporting}
            disabled={exportDisabled}
            onClick={() => {
              setOpen(false);
              onExport();
            }}
          >
            {exporting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            <span>{exporting ? "Rendering Image" : "Export Image"}</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DesktopExportMenu({
  exportFormat,
  exportQuality,
  exportTarget,
  exportSize,
  exportWarning,
  onExportFormatChange,
  onExportQualityChange,
  onExportTargetChange,
}: {
  exportFormat: "png" | "jpeg";
  exportQuality: number;
  exportTarget: ExportTarget;
  exportSize: { width: number; height: number } | null;
  exportWarning: string | null;
  onExportFormatChange: (format: "png" | "jpeg") => void;
  onExportQualityChange: (quality: number) => void;
  onExportTargetChange: (target: ExportTarget) => void;
}) {
  const target = getExportTarget(exportTarget);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-11 w-[210px] justify-between rounded-lg bg-[rgba(255,255,255,0.025)] px-3 normal-case tracking-normal"
        >
          <span className="min-w-0 text-left">
            <span className="block truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-primary)]">
              {target.label}
            </span>
            <span className="mt-0.5 block truncate font-mono text-[9px] text-[var(--text-muted)]">
              {exportSize
                ? `${exportSize.width} × ${exportSize.height}px · ${exportFormat === "jpeg" ? `JPG ${exportQuality}` : "PNG"}`
                : target.detail}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-[var(--text-muted)]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[360px] rounded-xl p-4 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
      >
        <div className="space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
              Export destination
            </p>
            <Select
              value={exportTarget}
              onValueChange={(value) => onExportTargetChange(value as ExportTarget)}
            >
              <SelectTrigger className="mt-3 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                {EXPORT_TARGETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5">
              <p className="font-mono text-[10px] text-[var(--text-primary)]">
                {exportSize
                  ? `${exportSize.width} × ${exportSize.height}px`
                  : target.detail}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">
                Recommended crop: {target.recommendedCrop}
              </p>
              {exportWarning ? (
                <p className="mt-1 text-[10px] leading-4 text-amber-300">
                  {exportWarning}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1.6fr] gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Format
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {(["jpeg", "png"] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    aria-pressed={exportFormat === format}
                    onClick={() => onExportFormatChange(format)}
                    className={cn(
                      "h-9 rounded-lg border text-[9px] uppercase tracking-[0.1em]",
                      exportFormat === format
                        ? "border-[var(--accent)] bg-[rgba(197,160,89,0.12)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-muted)]",
                    )}
                  >
                    {format === "jpeg" ? "JPG" : "PNG"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Quality
              </p>
              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {EXPORT_QUALITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={exportQuality === Number(option.value)}
                    onClick={() => onExportQualityChange(Number(option.value))}
                    className={cn(
                      "h-9 min-w-0 rounded-lg border font-mono text-[9px]",
                      exportQuality === Number(option.value)
                        ? "border-[var(--accent)] bg-[rgba(197,160,89,0.12)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-muted)]",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {exportTarget !== "original" && exportFormat === "png" ? (
            <p className="text-[10px] leading-4 text-amber-300">
              JPG 92 gives more predictable results for social photographs.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EikasiaEditorShell() {
  const {
    project,
    activeTab,
    setActiveTab,
    exportFormat,
    setExportFormat,
    exportQuality,
    setExportQuality,
    exportTarget,
    setExportTarget,
    resetProject,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedTextId,
    setSelectedTextId,
    setImage,
  } = useEditor();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const stageRef = React.useRef<CanvasStageHandle>(null);
  const objectUrlsRef = React.useRef<string[]>([]);
  const imageLoadRevisionRef = React.useRef(0);
  const previousProjectRef = React.useRef(project);
  const [exporting, setExporting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [hasUnexportedChanges, setHasUnexportedChanges] = React.useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = React.useState(false);
  const [mobileToolsExpanded, setMobileToolsExpanded] = React.useState(false);
  const mobileDrawerRef = React.useRef<HTMLElement>(null);
  const [mobileDrawerHeight, setMobileDrawerHeight] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);
  const exportPreview = React.useMemo(() => {
    if (!project.imageWidth || !project.imageHeight) {
      return { size: null, warning: null };
    }

    const cropped = getCroppedSourceDimensions(
      project.imageWidth,
      project.imageHeight,
      project.crop,
    );
    const size = resolveExportDimensions(cropped.width, cropped.height, exportTarget);

    return {
      size,
      warning: getExportCompatibilityMessage(
        exportTarget,
        cropped.width,
        cropped.height,
      ),
    };
  }, [exportTarget, project.crop, project.imageHeight, project.imageWidth]);

  React.useEffect(() => {
    const urls = objectUrlsRef.current;

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  React.useEffect(() => {
    if (previousProjectRef.current === project) {
      return;
    }

    previousProjectRef.current = project;
    setHasUnexportedChanges(Boolean(project.imageSrc));
  }, [project]);

  React.useEffect(() => {
    if (!project.imageSrc || !hasUnexportedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnexportedChanges, project.imageSrc]);

  React.useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      const tagName = element?.tagName.toLowerCase();

      return Boolean(
        element?.isContentEditable ||
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select" ||
          element?.closest("[contenteditable='true']"),
      );
    };

    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const requestsUndo = key === "z" && !event.shiftKey;
      const requestsRedo = key === "y" || (key === "z" && event.shiftKey);

      if (requestsUndo && canUndo) {
        event.preventDefault();
        undo();
      } else if (requestsRedo && canRedo) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [canRedo, canUndo, redo, undo]);

  React.useEffect(() => {
    if (!mobileToolsOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setMobileToolsOpen(false);
      setMobileToolsExpanded(false);
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileToolsOpen]);

  React.useEffect(() => {
    if (!mobileToolsOpen) {
      return;
    }

    const drawer = mobileDrawerRef.current;

    if (!drawer) {
      return;
    }

    let frame = window.requestAnimationFrame(() => {
      frame = 0;
      setMobileDrawerHeight(Math.round(drawer.getBoundingClientRect().height));
    });
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const nextHeight = Math.round(drawer.getBoundingClientRect().height);
        setMobileDrawerHeight((current) =>
          current === nextHeight ? current : nextHeight,
        );
      });
    });
    observer.observe(drawer);

    return () => {
      observer.disconnect();
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [mobileToolsOpen]);

  const handleMobileTextLayerAdded = React.useCallback(() => {
    setMobileToolsOpen(false);
    setMobileToolsExpanded(false);
    setNotice("Text added — drag it on the photo. Reopen Text for styling.");
  }, []);

  React.useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const requestUpload = React.useCallback(() => {
    if (exporting || importing) {
      setNotice(exporting ? "Finish exporting before replacing the frame." : "An image is already loading.");
      return;
    }

    fileInputRef.current?.click();
  }, [exporting, importing]);

  const handleFrameLoad = React.useCallback(
    async (file: File) => {
      const acceptedTypes = ["image/png", "image/jpeg", "image/webp"];

      if (!acceptedTypes.includes(file.type)) {
        setNotice("Only PNG, JPG, and WEBP frames are supported.");
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        setNotice("Frames larger than 50MB are not accepted.");
        return;
      }

      if (
        project.imageSrc &&
        hasUnexportedChanges &&
        !window.confirm("Replace this unexported project with the selected image?")
      ) {
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const revision = imageLoadRevisionRef.current + 1;
      imageLoadRevisionRef.current = revision;
      setImporting(true);
      setNotice("Preparing image…");

      try {
        const dimensions = await loadImageDimensions(objectUrl);

        if (revision !== imageLoadRevisionRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        if (
          dimensions.width > MAX_SOURCE_SIDE ||
          dimensions.height > MAX_SOURCE_SIDE ||
          dimensions.width * dimensions.height > MAX_SOURCE_PIXELS
        ) {
          URL.revokeObjectURL(objectUrl);
          setNotice(
            "This frame is too large to edit safely. Use an image below 100 megapixels and 24,000px per side.",
          );
          return;
        }

        const previousUrls = objectUrlsRef.current;
        objectUrlsRef.current = [objectUrl];
        setImage(objectUrl, file.name);
        setNotice(null);
        setSelectedTextId(null);
        setMobileToolsOpen(false);
        setMobileToolsExpanded(false);
        setExportFormat("jpeg");

        window.requestAnimationFrame(() => {
          previousUrls.forEach((url) => URL.revokeObjectURL(url));
        });
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        setNotice(
          error instanceof Error
            ? error.message
            : "The selected image could not be decoded.",
        );
      } finally {
        if (revision === imageLoadRevisionRef.current) {
          setImporting(false);
        }
      }
    },
    [
      hasUnexportedChanges,
      project.imageSrc,
      setExportFormat,
      setImage,
      setSelectedTextId,
    ],
  );

  const handleNewProject = React.useCallback(() => {
    if (exporting || importing) {
      setNotice(exporting ? "Finish exporting before starting over." : "Wait for the image to finish loading.");
      return;
    }

    if (
      project.imageSrc &&
      hasUnexportedChanges &&
      !window.confirm("Discard this unexported project and start a new one?")
    ) {
      return;
    }

    imageLoadRevisionRef.current += 1;
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
    resetProject();
    setSelectedTextId(null);
    setMobileToolsOpen(false);
    setMobileToolsExpanded(false);
    setHasUnexportedChanges(false);
    setNotice(null);
  }, [exporting, hasUnexportedChanges, importing, project.imageSrc, resetProject, setSelectedTextId]);

  const handleExport = React.useCallback(async () => {
    if (!project.imageSrc) {
      return;
    }

    try {
      setExporting(true);
      stageRef.current?.deselectText();
      setSelectedTextId(null);

      // Allow DOM to settle before export
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      const stageSize = stageRef.current?.getStageSize();
      // Canvas-first export from state (not DOM screenshot)
      const result = await exportProjectImage(project, {
        format: exportFormat,
        quality: exportQuality,
        target: exportTarget,
        stageSize,
      });
      const megabytes = (result.bytes / 1_000_000).toFixed(1);
      const qualityNote =
        exportFormat === "jpeg" && result.quality < exportQuality
          ? ` · Q${result.quality} to stay within the upload limit`
          : "";

      setNotice(
        `${getExportTarget(result.target).label} ready · ${result.width}×${result.height} · ${megabytes} MB${qualityNote}`,
      );
      setHasUnexportedChanges(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      setNotice(message);
    } finally {
      setExporting(false);
    }
  }, [exportFormat, exportQuality, exportTarget, project, setSelectedTextId]);

  return (
    <div className="app-shell relative min-h-screen min-h-[100dvh] overflow-hidden bg-[var(--background)] text-[var(--text-primary)]">
      <h1 className="sr-only">
        Eikasia — private cinematic photo editor and film simulation app
      </h1>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            handleFrameLoad(file);
          }

          event.currentTarget.value = "";
        }}
      />

      <div className="relative flex h-[100dvh] flex-col">
        <header className="relative z-40 shrink-0 border-b border-[var(--border)] bg-[#0a0a0a] pt-[env(safe-area-inset-top)] md:hidden">
          <div className="flex h-14 items-center justify-between gap-2 px-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Image
                src="/favicon.svg"
                alt=""
                width={30}
                height={30}
                className="size-7 shrink-0 rounded-md border border-[var(--border)] bg-[rgba(255,255,255,0.03)] p-1"
              />
              <p className="truncate font-logo text-[13px] uppercase tracking-[0.18em] text-[var(--text-primary)]">
                Eikasia
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                className="size-10 rounded-full"
                size="icon"
                variant="ghost"
                aria-label="Undo"
                disabled={!canUndo}
                onClick={undo}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                className="size-10 rounded-full"
                size="icon"
                variant="ghost"
                aria-label="Redo"
                disabled={!canRedo}
                onClick={redo}
              >
                <Redo2 className="size-4" />
              </Button>
              <MobileProjectMenu
                exportFormat={exportFormat}
                exportQuality={exportQuality}
                exportTarget={exportTarget}
                exportSize={exportPreview.size}
                exportWarning={exportPreview.warning}
                onExportFormatChange={setExportFormat}
                onExportQualityChange={setExportQuality}
                onExportTargetChange={setExportTarget}
                onRequestUpload={requestUpload}
                onResetProject={handleNewProject}
                onExport={handleExport}
                exporting={exporting}
                exportDisabled={!project.imageSrc || exporting || importing}
              />
            </div>
          </div>
        </header>

        <header className="relative z-40 hidden border-b border-[var(--border)] bg-[rgba(9,9,11,0.9)] shadow-[0_10px_35px_rgba(0,0,0,0.18)] backdrop-blur-xl md:block">
          <div className="grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 xl:grid-cols-[1fr_auto_1fr] xl:px-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <Image
                  src="/favicon.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 shrink-0 rounded-sm border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-1"
                />
                <div className="min-w-0">
                  <p className="truncate whitespace-nowrap font-logo text-lg leading-none uppercase tracking-[0.48em] text-[var(--text-primary)]">
                    EIKASIA
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                    cinematic image editor
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 sm:gap-3">
              <Button
                variant="amber"
                size="sm"
                className="h-10 rounded-lg px-4"
                onClick={requestUpload}
                disabled={exporting || importing}
              >
                {importing ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                <span>{importing ? "Loading" : "Upload"}</span>
              </Button>
              <Button
                className="h-10 rounded-lg px-4"
                variant="outline"
                size="sm"
                onClick={handleNewProject}
                disabled={exporting || importing}
              >
                New Project
              </Button>
            </div>

            <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)]/70 pt-3 xl:col-span-1 xl:border-t-0 xl:pt-0">
              <div className="mr-auto flex items-center gap-1 xl:mr-1">
                <Button
                  className="size-10 rounded-lg"
                  size="icon"
                  variant="ghost"
                  disabled={!canUndo}
                  aria-label="Undo"
                  onClick={undo}
                >
                  <Undo2 className="size-4" />
                </Button>
                <Button
                  className="size-10 rounded-lg"
                  size="icon"
                  variant="ghost"
                  disabled={!canRedo}
                  aria-label="Redo"
                  onClick={redo}
                >
                  <Redo2 className="size-4" />
                </Button>
              </div>

              <DesktopExportMenu
                exportFormat={exportFormat}
                exportQuality={exportQuality}
                exportTarget={exportTarget}
                exportSize={exportPreview.size}
                exportWarning={exportPreview.warning}
                onExportFormatChange={setExportFormat}
                onExportQualityChange={setExportQuality}
                onExportTargetChange={setExportTarget}
              />

              <Button
                className="h-11 rounded-lg px-5"
                variant="amber"
                size="sm"
                aria-busy={exporting}
                disabled={!project.imageSrc || exporting || importing}
                onClick={handleExport}
              >
                {exporting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                <span>
                  {exporting ? "Rendering" : "Export"}
                </span>
              </Button>
            </div>
          </div>

          {notice ? (
            <div aria-live="polite" className="border-t border-[var(--border)] px-4 py-3 xl:px-6">
              <p className="break-words font-mono text-[10px] leading-5 uppercase tracking-[0.16em] text-[var(--accent)] sm:text-[11px] sm:tracking-[0.22em]">
                {notice}
              </p>
            </div>
          ) : null}
        </header>

        {notice ? (
          <div aria-live="polite" className="absolute left-3 right-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-50 rounded-xl border border-[rgba(197,160,89,0.45)] bg-[rgba(16,16,20,0.96)] px-4 py-3 shadow-[0_16px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl md:hidden">
            <p className="break-words font-mono text-[10px] leading-5 uppercase tracking-[0.14em] text-[var(--accent)]">
              {notice}
            </p>
          </div>
        ) : null}

        <div className="relative grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[72px_minmax(0,1fr)_292px] lg:grid-cols-[188px_minmax(0,1fr)_308px] xl:grid-cols-[220px_minmax(0,1fr)_332px] 2xl:grid-cols-[232px_minmax(0,1fr)_348px]">
          <aside className="hidden min-h-0 overflow-hidden border-r border-[var(--border)] bg-[linear-gradient(180deg,rgba(21,21,24,0.98),rgba(14,14,17,0.98))] md:col-start-1 md:row-start-1 md:block">
            <div className="flex h-full min-h-0 flex-col">
              <div className="hidden px-4 pb-2 pt-5 lg:block">
                <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  Tools
                </p>
              </div>

              <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain p-2">
                {SIDEBAR_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setActiveTab(tab.id);
                      }}
                      className={cn(
                        "relative flex min-h-12 min-w-0 items-center justify-center gap-3 overflow-hidden rounded-lg px-3 py-3 text-left transition-colors lg:justify-start",
                        active
                          ? "bg-[rgba(197,160,89,0.12)] text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(197,160,89,0.16)]"
                          : "text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.045)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute inset-y-2 left-0 w-0.5 rounded-full bg-transparent",
                          active && "bg-[var(--accent)] shadow-[0_0_14px_rgba(197,160,89,0.55)]",
                        )}
                      />
                      <Icon className="size-5 shrink-0" />
                      <span className="hidden min-w-0 truncate text-[10px] uppercase tracking-[0.14em] lg:inline">
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="mt-auto hidden border-t border-[var(--border)] p-4 lg:block">
                <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Active Tool
                </p>
                <p className="mt-2 truncate text-xs font-medium text-[var(--text-primary)]">
                  {SIDEBAR_TABS.find((tab) => tab.id === activeTab)?.label}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">
                  {project.imageName
                    ? `Editing ${project.imageName}`
                    : "Drop an image to start grading, titling, and framing."}
                </p>
              </div>
            </div>
          </aside>

          <main className="relative row-start-1 min-h-0 min-w-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(197,160,89,0.075),transparent_34%),#0d0d0f] md:col-start-2">
            <CanvasStage
              key={project.imageSrc ?? "empty-project"}
              ref={stageRef}
              onRequestUpload={requestUpload}
              onDropFile={handleFrameLoad}
              mobileBottomInset={mobileToolsOpen ? mobileDrawerHeight : 0}
            />
            {!mobileToolsOpen && activeTab === "text" && selectedTextId ? (
              <div className="absolute inset-x-3 bottom-3 z-30 flex items-center justify-between gap-3 rounded-xl border border-[rgba(197,160,89,0.38)] bg-[rgba(12,12,15,0.92)] px-3 py-2.5 shadow-[0_14px_44px_rgba(0,0,0,0.48)] backdrop-blur-lg md:hidden">
                <p className="min-w-0 text-[10px] leading-4 text-[var(--text-primary)]">
                  Text selected. Drag it to position, or open its style controls.
                </p>
                <Button
                  size="sm"
                  variant="amber"
                  className="h-9 shrink-0 rounded-lg px-3"
                  onClick={() => stageRef.current?.editSelectedText()}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
              </div>
            ) : null}
          </main>

          <aside className="hidden min-h-0 overflow-hidden border-l border-[var(--border)] bg-[rgba(17,17,20,0.97)] shadow-[-14px_0_40px_rgba(0,0,0,0.12)] md:col-start-3 md:row-start-1 md:block">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Controls
                  </p>
                  <p className="mt-1 text-xs font-medium text-[var(--text-primary)]">
                    {SIDEBAR_TABS.find((tab) => tab.id === activeTab)?.label}
                  </p>
                </div>
                <span className="size-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_12px_rgba(197,160,89,0.7)]" />
              </div>
              <div className="min-h-0 flex-1">
                <InspectorPanel />
              </div>
            </div>
          </aside>

          {mobileToolsOpen ? (
            <>
              <button
                type="button"
                aria-label="Close tool controls"
                className="absolute inset-0 z-20 md:hidden"
                onClick={() => {
                  setMobileToolsOpen(false);
                  setMobileToolsExpanded(false);
                }}
              />
              <aside
                ref={mobileDrawerRef}
                aria-label={`${SIDEBAR_TABS.find((tab) => tab.id === activeTab)?.label} controls`}
                className={cn(
                  "mobile-tool-drawer absolute inset-x-0 bottom-0 z-30 flex max-h-[calc(100%-0.5rem)] flex-col overflow-hidden rounded-t-2xl border-x border-t border-[var(--border)] bg-[#111114] shadow-[0_-22px_70px_rgba(0,0,0,0.68)] animate-[mobile-drawer-in_180ms_ease-out] md:hidden",
                  mobileToolsExpanded
                    ? "h-[min(68dvh,620px)] max-h-[calc(100%-5rem)]"
                    : "h-[clamp(210px,42dvh,360px)] max-h-[calc(100%-9rem)]",
                )}
              >
              <div className="shrink-0 border-b border-[var(--border)] px-3 pb-2">
                <button
                  type="button"
                  className="flex h-7 w-full items-center justify-center"
                  aria-label={mobileToolsExpanded ? "Collapse tool drawer" : "Expand tool drawer"}
                  onClick={() => setMobileToolsExpanded((expanded) => !expanded)}
                >
                  <span className="h-1 w-10 rounded-full bg-[#3a3a42]" />
                </button>
                <div className="flex h-9 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {(() => {
                      const tool = SIDEBAR_TABS.find((tab) => tab.id === activeTab);
                      const Icon = tool?.icon;

                      return (
                        <>
                          {Icon ? <Icon className="size-4 text-[var(--accent)]" /> : null}
                          <p className="truncate text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-primary)]">
                            {tool?.label}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="flex size-9 items-center justify-center rounded-full text-[var(--text-muted)]"
                      aria-label={mobileToolsExpanded ? "Collapse controls" : "Expand controls"}
                      onClick={() => setMobileToolsExpanded((expanded) => !expanded)}
                    >
                      <ChevronUp
                        className={cn(
                          "size-4 transition-transform",
                          mobileToolsExpanded && "rotate-180",
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      className="flex size-9 items-center justify-center rounded-full text-[var(--text-muted)]"
                      aria-label="Close controls"
                      onClick={() => {
                        setMobileToolsOpen(false);
                        setMobileToolsExpanded(false);
                      }}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <InspectorPanel
                  compact
                  onTextLayerAdded={handleMobileTextLayerAdded}
                  onRequestEditSelectedText={() => {
                    setMobileToolsOpen(false);
                    setMobileToolsExpanded(false);
                    window.requestAnimationFrame(() => stageRef.current?.editSelectedText());
                  }}
                />
              </div>
              </aside>
            </>
          ) : null}
        </div>

        <nav
          aria-label="Editor tools"
          className="relative z-40 shrink-0 border-t border-[var(--border)] bg-[#0c0c0f] pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <div className="scrollbar-none flex h-[68px] touch-pan-x gap-1 overflow-x-auto px-1.5">
            {SIDEBAR_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={active && mobileToolsOpen}
                  onClick={() => {
                    if (activeTab === tab.id) {
                      setMobileToolsOpen((open) => !open);
                      if (mobileToolsOpen) {
                        setMobileToolsExpanded(false);
                      }
                    } else {
                      setActiveTab(tab.id);
                      setMobileToolsOpen(true);
                      setMobileToolsExpanded(false);
                    }
                  }}
                  className={cn(
                    "relative flex min-w-[72px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[9px] uppercase tracking-[0.1em] transition-colors",
                    active && mobileToolsOpen
                      ? "bg-[rgba(197,160,89,0.11)] text-[var(--accent)]"
                      : "text-[var(--text-muted)]",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="max-w-full truncate">
                    {tab.id === "adjustments" ? "Adjust" : tab.id === "crop" ? "Crop" : tab.label}
                  </span>
                  {active && mobileToolsOpen ? (
                    <span className="absolute bottom-1 h-0.5 w-5 rounded-full bg-[var(--accent)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export function EikasiaEditor() {
  return (
    <EditorProvider>
      <EikasiaEditorShell />
    </EditorProvider>
  );
}
