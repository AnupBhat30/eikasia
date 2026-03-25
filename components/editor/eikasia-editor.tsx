"use client";

import * as React from "react";
import Image from "next/image";
import {
  Crop,
  Download,
  Film,
  Layers3,
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
import { EditorSvgDefs } from "@/components/editor/editor-svg-defs";
import { InspectorPanel } from "@/components/editor/inspector-panel";
import type { EditorTabId } from "@/components/editor/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
  { label: "88", value: "88" },
  { label: "80", value: "80" },
  { label: "70", value: "70" },
];

function EikasiaEditorShell() {
  const {
    project,
    activeTab,
    setActiveTab,
    exportFormat,
    setExportFormat,
    exportQuality,
    setExportQuality,
    resetProject,
    undo,
    redo,
    canUndo,
    canRedo,
    setSelectedTextId,
    setImage,
  } = useEditor();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const stageRef = React.useRef<CanvasStageHandle>(null);
  const objectUrlsRef = React.useRef<string[]>([]);
  const [exporting, setExporting] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    const urls = objectUrlsRef.current;

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  React.useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const requestUpload = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFrameLoad = React.useCallback(
    (file: File) => {
      const acceptedTypes = ["image/png", "image/jpeg", "image/webp"];

      if (!acceptedTypes.includes(file.type)) {
        setNotice("Only PNG, JPG, and WEBP frames are supported.");
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        setNotice("Frames larger than 50MB are not accepted.");
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(objectUrl);
      setImage(objectUrl, file.name);
      setNotice(null);
      setSelectedTextId(null);
      setInspectorOpen(false);
      setExportFormat("jpeg");
    },
    [setExportFormat, setImage, setSelectedTextId],
  );

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

      // Canvas-first export from state (not DOM screenshot)
      await exportProjectImage(project, exportFormat, exportQuality);

      setNotice("Export complete — rendering from state, not screenshot.");
      window.setTimeout(() => setNotice(null), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      setNotice(message);
    } finally {
      setExporting(false);
    }
  }, [exportFormat, exportQuality, project, setSelectedTextId]);

  return (
    <div className="app-shell relative min-h-screen min-h-[100dvh] overflow-hidden bg-[var(--background)] text-[var(--text-primary)]">
      <EditorSvgDefs />

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
        <header className="border-b border-[var(--border)] bg-[rgba(10,10,10,0.88)] backdrop-blur-xl">
          <div className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4 sm:py-4 lg:grid-cols-[1fr_auto_1fr] xl:px-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <Image
                  src="/favicon.svg"
                  alt="Eikasia logo"
                  width={36}
                  height={36}
                  className="size-7 shrink-0 rounded-sm border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-1 sm:size-9"
                />
                <div className="min-w-0">
                  <p className="truncate whitespace-nowrap font-logo text-[clamp(11px,4.2vw,18px)] leading-none uppercase tracking-[0.14em] text-[var(--text-primary)] sm:tracking-[0.48em]">
                    EIKASIA
                  </p>
                  <p className="mt-1 hidden text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)] sm:block">
                    cinematic image editor
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 sm:gap-3">
              <Button
                variant="amber"
                size="sm"
                className="h-10 px-3 sm:h-11 sm:px-4"
                onClick={requestUpload}
              >
                <Upload className="size-4" />
                <span className="hidden min-[390px]:inline">Upload</span>
              </Button>
              <Button
                className="hidden sm:inline-flex"
                variant="outline"
                onClick={() => {
                  resetProject();
                  setSelectedTextId(null);
                }}
              >
                New Project
              </Button>
            </div>

            <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/70 pt-2 sm:gap-3 sm:pt-3 lg:col-span-1 lg:justify-end lg:border-t-0 lg:pt-0">
              <div className="hidden items-center gap-2 md:flex">
                <Select
                  value={exportFormat}
                  onValueChange={(value) =>
                    setExportFormat(value as typeof exportFormat)
                  }
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpeg">JPG</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={`${exportQuality}`}
                  onValueChange={(value) => setExportQuality(Number(value))}
                >
                  <SelectTrigger className="w-[92px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPORT_QUALITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="h-10 px-3 sm:h-11 sm:px-4"
                variant="amber"
                size="sm"
                disabled={!project.imageSrc || exporting}
                onClick={handleExport}
              >
                <Download className="size-4" />
                <span className="hidden sm:inline">
                  {exporting ? "Rendering" : "Export"}
                </span>
              </Button>

              <Button
                className="size-10 sm:size-11"
                size="icon"
                variant="ghost"
                disabled={!canUndo}
                onClick={undo}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                className="size-10 sm:size-11"
                size="icon"
                variant="ghost"
                disabled={!canRedo}
                onClick={redo}
              >
                <Redo2 className="size-4" />
              </Button>

              <Button
                className="lg:hidden"
                size="sm"
                variant="outline"
                onClick={() => setInspectorOpen(true)}
              >
                Controls
              </Button>
            </div>
          </div>

          {notice ? (
            <div className="border-t border-[var(--border)] px-4 py-3 xl:px-6">
              <p className="break-words font-mono text-[10px] leading-5 uppercase tracking-[0.16em] text-[var(--accent)] sm:text-[11px] sm:tracking-[0.22em]">
                {notice}
              </p>
            </div>
          ) : null}
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[84px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_320px] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="hidden min-h-0 overflow-hidden border-r border-[var(--border)] bg-[rgba(20,20,20,0.96)] sm:block">
            <div className="flex h-full min-h-0 flex-col">
              <div className="hidden px-5 pb-3 pt-5 lg:block">
                <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--text-muted)]">
                  Workspace
                </p>
              </div>

              <nav className="flex min-h-0 flex-col overflow-y-auto overscroll-contain">
                {SIDEBAR_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setInspectorOpen(true);
                      }}
                      className={cn(
                        "relative flex items-center gap-3 border-b border-[var(--border)] px-3 py-3 text-left transition-colors sm:px-4 sm:py-4",
                        active
                          ? "bg-[rgba(245,158,11,0.08)] text-[var(--accent)]"
                          : "text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute inset-y-0 left-0 w-px bg-transparent",
                          active && "bg-[var(--accent)]",
                        )}
                      />
                      <Icon className="size-5 shrink-0" />
                      <span className="hidden text-[11px] uppercase tracking-[0.28em] lg:inline">
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="mt-auto hidden border-t border-[var(--border)] p-5 lg:block">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">
                  Active Tool
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--text-primary)]">
                  {SIDEBAR_TABS.find((tab) => tab.id === activeTab)?.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  {project.imageName
                    ? `Editing ${project.imageName}`
                    : "Drop an image to start grading, titling, and framing."}
                </p>
              </div>
            </div>
          </aside>

          <main className="relative min-h-0 min-w-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.06),transparent_22%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.03),transparent_18%),#0f0f0f]">
            <CanvasStage
              ref={stageRef}
              onRequestUpload={requestUpload}
              onDropFile={handleFrameLoad}
            />
          </main>

          <aside className="hidden min-h-0 overflow-hidden border-l border-[var(--border)] bg-[rgba(17,17,17,0.96)] lg:block">
            <InspectorPanel />
          </aside>
        </div>

        <nav className="border-t border-[var(--border)] bg-[rgba(14,14,14,0.96)] px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:hidden">
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SIDEBAR_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setInspectorOpen(true);
                  }}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-center gap-1 border px-2 py-2 text-[9px] uppercase tracking-[0.12em] transition-colors",
                    active
                      ? "border-[var(--accent)] bg-[rgba(245,158,11,0.08)] text-[var(--accent)]"
                      : "border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-[var(--text-muted)]",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {inspectorOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(0,0,0,0.56)]"
            onClick={() => setInspectorOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-full flex-col overflow-hidden border-l border-[var(--border)] bg-[rgba(17,17,17,0.98)] shadow-[0_20px_60px_rgba(0,0,0,0.55)] sm:w-[min(92vw,360px)]">
            <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4 sm:h-16 sm:px-5">
              <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--text-primary)]">
                Inspector
              </p>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setInspectorOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">
              <InspectorPanel />
            </div>
          </aside>
        </div>
      ) : null}
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
