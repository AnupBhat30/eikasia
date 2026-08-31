"use client";

import * as React from "react";
import {
  Aperture,
  Crop,
  Layers3,
  Pencil,
  RotateCcw,
  Sparkles,
  Type,
  Wand2,
} from "lucide-react";

import {
  ACROS_CHANNEL_OPTIONS,
  ADJUSTMENT_GROUPS,
  ANALOG_FILM_LOOKS,
  ASPECT_RATIO_PRESETS,
  BORDER_PRESETS,
  CINEMA_LOOKS,
  COLORFUL_LOOKS,
  CHROMA_LOOKS,
  DEFAULT_FLARE_PRESET,
  DUST_PRESET,
  FUJIFILM_LOOKS,
  GRAIN_PRESETS,
  LIGHT_LEAK_PRESETS,
  TEXT_PRESETS,
  getLookDefinition,
} from "@/components/editor/constants";
import { useEditor } from "@/components/editor/editor-context";
import type {
  AdjustmentControlDefinition,
  LookDefinition,
  OverlayPresetDefinition,
  ProjectState,
  TextLayer,
} from "@/components/editor/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { interpolateCropPoint } from "@/lib/social-export";
import { resolveTextFontFamily } from "@/lib/text-style";
import { cn, formatSignedValue, round, uid } from "@/lib/utils";

const LOOK_CATEGORY_LABELS: Record<LookDefinition["category"], string> = {
  fujifilm: "Fujifilm",
  analog: "Analog Film",
  cinema: "Cinema Preset",
  bw: "Black & White",
  colorful: "Movie Pop & Pastels",
  chroma: "Chroma Pop & Golden Glow",
};

const LOOK_GROUPS = [
  { id: "fujifilm", label: "Fuji", looks: FUJIFILM_LOOKS },
  { id: "analog", label: "Film", looks: ANALOG_FILM_LOOKS },
  { id: "cinema", label: "Cinema", looks: CINEMA_LOOKS },
  { id: "colorful", label: "Pop", looks: COLORFUL_LOOKS },
  { id: "chroma", label: "Glow", looks: CHROMA_LOOKS },
] as const;

function PanelSection({
  icon: Icon,
  title,
  detail,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="editor-panel-section space-y-4 border-b border-(--border) pb-6 last:border-b-0 last:pb-0">
      <header className="editor-panel-section-header space-y-2">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center border border-(--border) bg-[rgba(255,255,255,0.02)]">
            <Icon className="size-4 text-(--accent)" />
          </span>
          <h3 className="text-[10px] font-medium uppercase tracking-[0.24em] leading-4 text-foreground sm:text-[11px] sm:tracking-[0.34em]">
            {title}
          </h3>
        </div>
        {detail ? (
          <p className="editor-panel-section-detail max-w-[32ch] text-sm leading-6 text-(--text-muted)">
            {detail}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function ResponsivePanelSection({
  compact,
  id,
  icon: Icon,
  title,
  detail,
  active = false,
  children,
}: {
  compact: boolean;
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail?: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  if (!compact) {
    return (
      <PanelSection icon={Icon} title={title} detail={detail}>
        {children}
      </PanelSection>
    );
  }

  return (
    <AccordionItem value={id}>
      <AccordionTrigger className="min-h-12 py-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center border border-(--border) bg-[rgba(255,255,255,0.02)]">
            <Icon className="size-4 text-(--accent)" />
          </span>
          <span className="truncate">{title}</span>
          {active ? (
            <span className="size-1.5 shrink-0 rounded-full bg-(--accent) shadow-[0_0_9px_rgba(197,160,89,0.7)]">
              <span className="sr-only">Active</span>
            </span>
          ) : null}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-1">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

const ToneCard = React.memo(function ToneCard({
  look,
  active,
  disabled,
  onSelect,
}: {
  look: LookDefinition;
  active: boolean;
  disabled: boolean;
  onSelect: (lookId: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(look.id)}
      className={cn(
        "group flex w-22 shrink-0 flex-col gap-2 text-left transition-transform duration-150 disabled:opacity-40 sm:w-23.5",
        active ? "-translate-y-0.5" : "hover:-translate-y-0.5",
      )}
    >
      <span
        className={cn(
          "relative block h-18 w-18 overflow-hidden border bg-black shadow-[0_20px_40px_rgba(0,0,0,0.25)] sm:h-20 sm:w-20",
          active
            ? "border-(--accent)"
            : "border-(--border) group-hover:border-[rgba(245,158,11,0.55)]",
        )}
      >
        <span
          className="absolute inset-0"
          style={{ backgroundImage: look.thumbnail }}
        />
        {look.renderRecipe.washes.map((wash, index) => (
          <span
            key={`${look.id}-wash-${index}`}
            className="absolute inset-0"
            style={{
              backgroundColor: wash.color,
              opacity: wash.opacity,
              mixBlendMode:
                wash.blendMode === "normal" ? "normal" : wash.blendMode,
            }}
          />
        ))}
        <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.45)_100%)]" />
      </span>
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.14em] leading-4 wrap-anywhere sm:text-[11px] sm:tracking-[0.18em]",
          active ? "text-(--accent)" : "text-(--text-muted)",
        )}
      >
        {look.name}
      </span>
    </button>
  );
});

function formatAdjustmentValue(control: AdjustmentControlDefinition, value: number) {
  if (control.suffix === "K") {
    return `${value}${control.suffix}`;
  }

  return formatSignedValue(value);
}

function AdjustmentSliderRow({
  control,
  value,
  disabled,
  onChange,
  onReset,
}: {
  control: AdjustmentControlDefinition;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="truncate text-[10px] uppercase tracking-[0.2em] text-foreground sm:text-[11px] sm:tracking-[0.26em]">
            {control.label}
          </span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-muted) sm:text-[11px] sm:tracking-[0.16em]">
            {formatAdjustmentValue(control, value)}
          </span>
        </div>
        <button
          type="button"
          aria-label={`Reset ${control.label}`}
          title={`Reset ${control.label}`}
          disabled={disabled}
          onClick={onReset}
          className="flex size-9 shrink-0 items-center justify-center border border-(--border) text-(--text-muted) transition-colors hover:border-[rgba(245,158,11,0.45)] hover:text-(--accent) disabled:opacity-30"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
      <Slider
        disabled={disabled}
        min={control.min}
        max={control.max}
        step={control.step ?? 1}
        value={[value]}
        onValueChange={([nextValue]) => onChange(nextValue)}
      />
    </div>
  );
}

function FiltersInspector({ compact = false }: { compact?: boolean }) {
  const {
    project,
    setLook,
    setFilterIntensity,
    setAcrosChannel,
  } = useEditor();
  const selectedLook = getLookDefinition(project.activeLookId);
  const initialGroup =
    LOOK_GROUPS.find((group) =>
      group.looks.some((look) => look.id === project.activeLookId),
    )?.id ?? LOOK_GROUPS[0].id;
  const [activeGroupId, setActiveGroupId] = React.useState(initialGroup);
  const activeGroup =
    LOOK_GROUPS.find((group) => group.id === activeGroupId) ?? LOOK_GROUPS[0];

  if (compact) {
    return (
      <div className="space-y-5">
        <PanelSection
          icon={Wand2}
          title="Film looks"
          detail="Choose a family, then swipe through its looks."
        >
          <div className="scrollbar-none -mx-3 touch-auto overflow-x-auto px-3">
            <div className="flex w-max gap-2 pr-3">
              {LOOK_GROUPS.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={activeGroup.id === group.id}
                  onClick={() => setActiveGroupId(group.id)}
                  className={cn(
                    "min-h-10 rounded-full border px-4 text-[10px] uppercase tracking-[0.16em] transition-colors",
                    activeGroup.id === group.id
                      ? "border-(--accent) bg-(--accent) text-black"
                      : "border-(--border) bg-[rgba(255,255,255,0.03)] text-(--text-muted)",
                  )}
                >
                  {group.label}
                </button>
              ))}
            </div>
          </div>

          <div className="scrollbar-none -mx-3 touch-auto snap-x snap-proximity overflow-x-auto px-3 pb-1">
            <div className="flex w-max gap-3 pr-5">
              {activeGroup.looks.map((look) => (
                <div key={look.id} className="snap-start">
                  <ToneCard
                    look={look}
                    active={project.activeLookId === look.id}
                    disabled={false}
                    onSelect={setLook}
                  />
                </div>
              ))}
            </div>
          </div>
        </PanelSection>

        <PanelSection icon={Aperture} title="Look strength">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-foreground">
                  {selectedLook?.name ?? "Original"}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-(--text-muted)">
                  {project.filterIntensity}% intensity
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setLook(null)}>
                Original
              </Button>
            </div>

            <Slider
              min={0}
              max={100}
              step={1}
              value={[project.filterIntensity]}
              onValueChange={([value]) => setFilterIntensity(value)}
            />

            {project.activeLookId === "acros" ? (
              <Select
                value={project.acrosChannel}
                onValueChange={(value) =>
                  setAcrosChannel(value as typeof project.acrosChannel)
                }
              >
                <SelectTrigger aria-label="Acros channel">
                  <SelectValue placeholder="Choose Acros channel" />
                </SelectTrigger>
                <SelectContent>
                  {ACROS_CHANNEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </PanelSection>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PanelSection
        icon={Wand2}
        title="Fujifilm Film Simulations"
        detail="Layered CSS and SVG tonal recipes modeled after Fujifilm stock for instant still-image looks."
      >
        <div className="overflow-x-auto pb-3">
          <div className="flex w-max gap-3 pr-4">
            {FUJIFILM_LOOKS.map((look) => (
              <ToneCard
                key={look.id}
                look={look}
                active={project.activeLookId === look.id}
                disabled={false}
                onSelect={setLook}
              />
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection
        icon={Sparkles}
        title="Analog Film Stocks"
        detail="Kodak, Fujifilm, and Ilford-inspired emulsions with per-look grain recommendations baked into the switch."
      >
        <div className="overflow-x-auto pb-3">
          <div className="flex w-max gap-3 pr-4">
            {ANALOG_FILM_LOOKS.map((look) => (
              <ToneCard
                key={look.id}
                look={look}
                active={project.activeLookId === look.id}
                disabled={false}
                onSelect={setLook}
              />
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection
        icon={Sparkles}
        title="Cinema Presets"
        detail="Broader movie-grade interpretations for blockbusters, bleach-bypass grit, and moonlit scenes."
      >
        <div className="overflow-x-auto pb-3">
          <div className="flex w-max gap-3 pr-4">
            {CINEMA_LOOKS.map((look) => (
              <ToneCard
                key={look.id}
                look={look}
                active={project.activeLookId === look.id}
                disabled={false}
                onSelect={setLook}
              />
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection
        icon={Sparkles}
        title="Movie Pop & Pastels"
        detail="Colorful, subtle pastel movie grades—featuring Barbie-core, La La Land warm sunsets, and Miami Vice neon pops."
      >
        <div className="overflow-x-auto pb-3">
          <div className="flex w-max gap-3 pr-4">
            {COLORFUL_LOOKS.map((look) => (
              <ToneCard
                key={look.id}
                look={look}
                active={project.activeLookId === look.id}
                disabled={false}
                onSelect={setLook}
              />
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection
        icon={Sparkles}
        title="Chroma Pop & Golden Glow"
        detail="Instagram-optimized, color-safe filters for high-impact sharing without color distortion."
      >
        <div className="overflow-x-auto pb-3">
          <div className="flex w-max gap-3 pr-4">
            {CHROMA_LOOKS.map((look) => (
              <ToneCard
                key={look.id}
                look={look}
                active={project.activeLookId === look.id}
                disabled={false}
                onSelect={setLook}
              />
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection
        icon={Aperture}
        title="Look Mix"
        detail="Blend the graded layer over the untouched base image for subtler or harder matches."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.26em] text-foreground">
                Intensity
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-(--text-muted)">
                {project.filterIntensity}%
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLook(null)}
            >
              Bypass
            </Button>
          </div>

          <Slider
            min={0}
            max={100}
            step={1}
            value={[project.filterIntensity]}
            onValueChange={([value]) => setFilterIntensity(value)}
          />

          {project.activeLookId === "acros" ? (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.26em] text-foreground">
                Acros Channel
              </p>
              <Select
                value={project.acrosChannel}
                onValueChange={(value) =>
                  setAcrosChannel(value as typeof project.acrosChannel)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose channel" />
                </SelectTrigger>
                <SelectContent>
                  {ACROS_CHANNEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {selectedLook ? (
            <div className="border border-(--border) bg-[rgba(255,255,255,0.02)] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-(--accent)">
                  {LOOK_CATEGORY_LABELS[selectedLook.category]}
                </span>
                <span className="text-[11px] uppercase tracking-[0.22em] text-(--text-muted)">
                  {selectedLook.name}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-(--text-muted)">
                {selectedLook.summary}
              </p>
            </div>
          ) : null}
        </div>
      </PanelSection>
    </div>
  );
}

function AdjustmentsInspector({ compact = false }: { compact?: boolean }) {
  const { project, setAdjustment, resetAdjustment } = useEditor();

  const groups = ADJUSTMENT_GROUPS.map((group) => (
    <AccordionItem key={group.id} value={group.id}>
      <AccordionTrigger>{group.label}</AccordionTrigger>
      <AccordionContent>
        <div className="space-y-1">
          {group.controls.map((control) => (
            <AdjustmentSliderRow
              key={control.key}
              control={control}
              value={project.adjustments[control.key]}
              disabled={false}
              onChange={(value) => setAdjustment(control.key, value)}
              onReset={() => resetAdjustment(control.key)}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  ));

  return (
    <PanelSection
      icon={Aperture}
      title="Manual Adjustments"
      detail="Non-destructive offsets layered above the current filter, preserved when looks change."
    >
      {compact ? (
        <Accordion type="single" collapsible defaultValue={ADJUSTMENT_GROUPS[0]?.id}>
          {groups}
        </Accordion>
      ) : (
        <Accordion
          type="multiple"
          defaultValue={ADJUSTMENT_GROUPS.map((group) => group.id)}
        >
          {groups}
        </Accordion>
      )}
    </PanelSection>
  );
}

function getPerspectiveMetrics(
  perspective: ProjectState["crop"]["perspective"],
) {
  const width =
    (Math.hypot(
      perspective.tr.x - perspective.tl.x,
      perspective.tr.y - perspective.tl.y,
    ) +
      Math.hypot(
        perspective.br.x - perspective.bl.x,
        perspective.br.y - perspective.bl.y,
      )) /
    2;
  const height =
    (Math.hypot(
      perspective.bl.x - perspective.tl.x,
      perspective.bl.y - perspective.tl.y,
    ) +
      Math.hypot(
        perspective.br.x - perspective.tr.x,
        perspective.br.y - perspective.tr.y,
      )) /
    2;

  return {
    width: Math.max(0.01, width),
    height: Math.max(0.01, height),
    fontScale: Math.max(0.0001, Math.min(width / 100, height / 100)),
  };
}

function createLayerFromPreset(
  preset: (typeof TEXT_PRESETS)[number],
  perspective: ProjectState["crop"]["perspective"],
): TextLayer {
  const metrics = getPerspectiveMetrics(perspective);
  const position = interpolateCropPoint(
    perspective,
    preset.xPct / 100,
    preset.yPct / 100,
  );

  return {
    id: uid("text"),
    presetId: preset.id,
    text: preset.text,
    xPct: position.x,
    yPct: position.y,
    widthPct: (preset.widthPct / 100) * metrics.width,
    fontSizePct: preset.fontSizePct * metrics.fontScale,
    fontFamily: preset.fontFamily,
    color: preset.color,
    opacity: preset.opacity,
    letterSpacing: preset.letterSpacing,
    lineHeight: preset.lineHeight,
    shadowPreset: preset.shadowPreset,
    blendMode: preset.blendMode,
    backgroundColor: preset.backgroundColor ?? null,
    fontStyle: preset.fontStyle ?? "normal",
    fontWeight: preset.fontWeight ?? "500",
    textAlign: preset.textAlign ?? "center",
    curve: preset.curve ?? 0,
  };
}

function createCustomTextLayer(
  perspective: ProjectState["crop"]["perspective"],
): TextLayer {
  const metrics = getPerspectiveMetrics(perspective);
  const center = interpolateCropPoint(perspective, 0.5, 0.5);

  return {
    id: uid("text"),
    presetId: "custom",
    text: "Your text",
    xPct: center.x,
    yPct: center.y,
    widthPct: 0.62 * metrics.width,
    fontSizePct: 6.4 * metrics.fontScale,
    fontFamily: "sans",
    color: "#fafafa",
    opacity: 1,
    letterSpacing: 0,
    lineHeight: 1.1,
    shadowPreset: "soft",
    blendMode: "normal",
    backgroundColor: null,
    fontStyle: "normal",
    fontWeight: "500",
    textAlign: "center",
    curve: 0,
  };
}

function TextInspector({
  compact = false,
  onRequestEditSelectedText,
  onTextLayerAdded,
}: {
  compact?: boolean;
  onRequestEditSelectedText?: () => void;
  onTextLayerAdded?: (layerId: string) => void;
}) {
  const {
    project,
    selectedTextId,
    setSelectedTextId,
    addTextLayer,
    removeTextLayer,
    upsertOverlay,
  } = useEditor();
  const hasImage = Boolean(project.imageSrc);

  const selectedLayer =
    project.textLayers.find((layer) => layer.id === selectedTextId) ?? null;

  const handleAddPreset = (presetId: string) => {
    const preset = TEXT_PRESETS.find((entry) => entry.id === presetId);

    if (!preset) {
      return;
    }

    const layer = createLayerFromPreset(preset, project.crop.perspective);
    addTextLayer(layer);
    setSelectedTextId(layer.id);

    if (preset.id === "kodak-frame") {
      const border = BORDER_PRESETS.find((entry) => entry.id === "kodak-border");

      if (border) {
        upsertOverlay(
          {
            ...border,
            id: `overlay-${border.id}`,
            presetId: border.id,
          },
          true,
        );
      }
    }

    onTextLayerAdded?.(layer.id);
  };

  const handleAddCustomText = () => {
    const layer = createCustomTextLayer(project.crop.perspective);
    addTextLayer(layer);
    setSelectedTextId(layer.id);
    onTextLayerAdded?.(layer.id);
  };

  return (
    <div className="space-y-6">
      <PanelSection
        icon={Type}
        title="Text Presets"
        detail="Drop in cinematic titles, chapter cards, credits, film stamps, and select graphic treatments, then edit them on canvas."
      >
        <div className="space-y-3">
          <Button
            variant="amber"
            className="w-full"
            disabled={!hasImage}
            onClick={handleAddCustomText}
          >
            Add Text
          </Button>
          <div className={cn("grid gap-3 sm:grid-cols-2", compact ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-1")}>
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={!hasImage}
                onClick={() => handleAddPreset(preset.id)}
                className={cn(
                  "group border border-(--border) bg-[rgba(255,255,255,0.02)] p-3 text-left transition-colors hover:border-[rgba(245,158,11,0.45)] hover:bg-[rgba(245,158,11,0.04)] disabled:opacity-40",
                  compact ? "min-h-19.5" : "min-h-23",
                )}
              >
                <span className="block min-w-0 wrap-anywhere text-[9px] uppercase leading-4 tracking-widest text-foreground sm:text-[10px] sm:tracking-[0.16em]">
                  {preset.name}
                </span>
                <span
                  className="mt-3 block px-1 py-0.5 text-xs leading-5"
                  style={{
                    color: preset.color,
                    backgroundColor: preset.backgroundColor ?? undefined,
                    fontFamily: resolveTextFontFamily(preset.fontFamily),
                    fontStyle: preset.fontStyle ?? "normal",
                    fontWeight: preset.fontWeight ?? "500",
                    textAlign: preset.textAlign ?? "center",
                    letterSpacing: `${preset.letterSpacing / 1000}em`,
                    lineHeight: preset.lineHeight,
                    whiteSpace: "pre-line",
                    textShadow:
                      preset.shadowPreset === "red-offset"
                        ? "2px 2px 0 #e31b23"
                        : undefined,
                  }}
                >
                  {preset.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection
        icon={Type}
        title="Canvas Text Layers"
        detail="Select a text layer to edit its styling in the floating popover on the canvas."
      >
        <div className="space-y-3">
          {project.textLayers.length ? (
            project.textLayers.map((layer) => (
              <div
                key={layer.id}
                className={cn(
                  "flex items-center justify-between gap-3 border p-3",
                  selectedTextId === layer.id
                    ? "border-(--accent) bg-[rgba(245,158,11,0.06)]"
                    : "border-(--border) bg-[rgba(255,255,255,0.02)]",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setSelectedTextId(layer.id)}
                >
                  <p className="truncate text-[10px] uppercase tracking-[0.16em] text-foreground sm:text-[11px] sm:tracking-[0.24em]">
                    {layer.presetId.replaceAll("-", " ")}
                  </p>
                  <p className="mt-2 truncate font-mono text-[11px] uppercase tracking-[0.16em] text-(--text-muted)">
                    {layer.text}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {selectedTextId === layer.id && onRequestEditSelectedText ? (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="Edit selected text"
                      onClick={onRequestEditSelectedText}
                    >
                      <Pencil className="size-3.5" />
                      <span className="hidden min-[390px]:inline">Edit</span>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeTextLayer(layer.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="border border-dashed border-(--border) p-4 text-sm leading-6 text-(--text-muted)">
              No text objects yet. Click any preset above to place it on the
              image canvas.
            </div>
          )}

          {selectedLayer ? (
            <div className="border border-(--border) bg-[rgba(255,255,255,0.02)] p-4">
              <p className="text-[11px] uppercase tracking-[0.26em] text-(--accent)">
                Selected
              </p>
              <p className="mt-3 text-sm leading-6 text-(--text-muted)">
                Font {selectedLayer.fontFamily}, opacity{" "}
                {Math.round(selectedLayer.opacity * 100)}%, align{" "}
                {selectedLayer.textAlign}.
              </p>
            </div>
          ) : null}
        </div>
      </PanelSection>
    </div>
  );
}

function OverlayPresetButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-w-0 overflow-hidden wrap-anywhere border px-2 py-3 text-center text-[9px] uppercase leading-4 tracking-widest transition-colors disabled:opacity-40 sm:px-3 sm:text-[10px] sm:tracking-[0.16em]",
        active
          ? "border-(--accent) bg-[rgba(245,158,11,0.08)] text-(--accent)"
          : "border-(--border) bg-[rgba(255,255,255,0.02)] text-(--text-muted) hover:border-[rgba(245,158,11,0.45)] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function OverlaysInspector({ compact = false }: { compact?: boolean }) {
  const { project, upsertOverlay, removeOverlay } = useEditor();
  const hasImage = Boolean(project.imageSrc);

  const activeOverlay = React.useMemo(
    () => ({
      grain: project.overlayLayers.find((layer) => layer.type === "grain") ?? null,
      lightLeak:
        project.overlayLayers.find((layer) => layer.type === "lightLeak") ?? null,
      flare: project.overlayLayers.find((layer) => layer.type === "flare") ?? null,
      border: project.overlayLayers.find((layer) => layer.type === "border") ?? null,
      dust: project.overlayLayers.find((layer) => layer.type === "dust") ?? null,
    }),
    [project.overlayLayers],
  );

  const addOverlayPreset = (preset: OverlayPresetDefinition) =>
    upsertOverlay(
      {
        ...preset,
        id: `overlay-${preset.id}`,
        presetId: preset.id,
      },
      true,
    );

  const sections = (
    <>
      <ResponsivePanelSection
        compact={compact}
        id="grain"
        active={
          Boolean(activeOverlay.grain) || project.adjustments.grainAmount > 0
        }
        icon={Layers3}
        title="Film Grain"
        detail="Stable seeded film texture with blend modes tuned for subtle or gritty analog grain."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {GRAIN_PRESETS.map((preset) => (
            <OverlayPresetButton
              key={preset.id}
              label={preset.name}
              active={activeOverlay.grain?.presetId === preset.id}
              disabled={!hasImage}
              onClick={() => addOverlayPreset(preset)}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={
            !activeOverlay.grain && project.adjustments.grainAmount <= 0
          }
          onClick={() => removeOverlay(undefined, "grain")}
        >
          Remove Grain
        </Button>
      </ResponsivePanelSection>

      <ResponsivePanelSection
        compact={compact}
        id="light-leaks"
        active={Boolean(activeOverlay.lightLeak)}
        icon={Layers3}
        title="Light Leaks"
        detail="Warm leak gradients rendered as additive overlays for damaged-roll bloom."
      >
        <div className="grid grid-cols-2 gap-3">
          {LIGHT_LEAK_PRESETS.map((preset) => (
            <OverlayPresetButton
              key={preset.id}
              label={preset.name}
              active={activeOverlay.lightLeak?.presetId === preset.id}
              disabled={!hasImage}
              onClick={() => addOverlayPreset(preset)}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={!activeOverlay.lightLeak}
          onClick={() => removeOverlay(undefined, "lightLeak")}
        >
          Clear Leak
        </Button>
      </ResponsivePanelSection>

      <ResponsivePanelSection
        compact={compact}
        id="flare"
        active={Boolean(activeOverlay.flare)}
        icon={Sparkles}
        title="Anamorphic Flare"
        detail="Blue cinema streak with adjustable intensity and vertical placement."
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-foreground">
            Lens Streak
          </p>
          <Button
            size="sm"
            disabled={!hasImage}
            variant={activeOverlay.flare ? "amber" : "outline"}
            onClick={() =>
              activeOverlay.flare
                ? removeOverlay(undefined, "flare")
                : addOverlayPreset(DEFAULT_FLARE_PRESET)
            }
          >
            {activeOverlay.flare ? "Enabled" : "Enable"}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.22em] text-foreground">
                Intensity
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-(--text-muted)">
                {activeOverlay.flare?.intensity ?? 0}%
              </span>
            </div>
            <Slider
              disabled={!activeOverlay.flare}
              min={0}
              max={100}
              value={[activeOverlay.flare?.intensity ?? 0]}
              onValueChange={([value]) =>
                addOverlayPreset({
                  ...DEFAULT_FLARE_PRESET,
                  intensity: value,
                  opacity: round(value / 180 + 0.08, 2),
                  position: activeOverlay.flare?.position ?? 48,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.22em] text-foreground">
                Position
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-(--text-muted)">
                {activeOverlay.flare?.position ?? 48}%
              </span>
            </div>
            <Slider
              disabled={!activeOverlay.flare}
              min={0}
              max={100}
              value={[activeOverlay.flare?.position ?? 48]}
              onValueChange={([value]) =>
                addOverlayPreset({
                  ...DEFAULT_FLARE_PRESET,
                  intensity: activeOverlay.flare?.intensity ?? 52,
                  opacity: activeOverlay.flare?.opacity ?? DEFAULT_FLARE_PRESET.opacity,
                  position: value,
                })
              }
            />
          </div>
        </div>
      </ResponsivePanelSection>

      <ResponsivePanelSection
        compact={compact}
        id="borders"
        active={Boolean(activeOverlay.border)}
        icon={Layers3}
        title="Film Borders"
        detail="Frame treatments ranging from Kodak sprockets to instant-film mats."
      >
        <div className="grid grid-cols-2 gap-3">
          {BORDER_PRESETS.map((preset) => (
            <OverlayPresetButton
              key={preset.id}
              label={preset.name}
              active={activeOverlay.border?.presetId === preset.id}
              disabled={!hasImage}
              onClick={() => addOverlayPreset(preset)}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={!activeOverlay.border}
          onClick={() => removeOverlay(undefined, "border")}
        >
          Remove Border
        </Button>
      </ResponsivePanelSection>

      <ResponsivePanelSection
        compact={compact}
        id="dust"
        active={Boolean(activeOverlay.dust)}
        icon={Layers3}
        title="Dust & Scratches"
        detail="Add restrained analog imperfections on top of the frame."
      >
        <div className="flex flex-col gap-4 border border-(--border) bg-[rgba(255,255,255,0.02)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-foreground">
              Imperfections
            </p>
            <p className="mt-2 text-sm leading-6 text-(--text-muted)">
              Thin scratches, dust specks, and projector wear.
            </p>
          </div>
          <Button
            size="sm"
            disabled={!hasImage}
            variant={activeOverlay.dust ? "amber" : "outline"}
            onClick={() =>
              activeOverlay.dust
                ? removeOverlay(undefined, "dust")
                : addOverlayPreset(DUST_PRESET)
            }
          >
            {activeOverlay.dust ? "Active" : "Enable"}
          </Button>
        </div>
      </ResponsivePanelSection>
    </>
  );

  return compact ? (
    <Accordion type="single" collapsible defaultValue="grain">
      {sections}
    </Accordion>
  ) : (
    <div className="space-y-6">{sections}</div>
  );
}

function CropInspector({ compact = false }: { compact?: boolean }) {
  const {
    project,
    setActiveTab,
    setCropPreset,
    setCropRotation,
    toggleFlip,
    resetCrop,
  } = useEditor();

  return (
    <div className="space-y-6">
      <PanelSection
        icon={Crop}
        title="Crop Ratios"
        detail="Freeform or cinematic aspect ratios. Drag the corner handles on the canvas to reshape the crop and perspective."
      >
        <div className="grid grid-cols-2 gap-3">
          {ASPECT_RATIO_PRESETS.map((preset) => (
            <OverlayPresetButton
              key={preset.id}
              label={preset.label}
              active={project.crop.presetId === preset.id}
              disabled={false}
              onClick={() => setCropPreset(preset.id)}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={Crop}
        title="Transform"
        detail="Rotate, flip, and straighten the current crop plane."
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.22em] text-foreground">
                Rotation
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-(--text-muted)">
                {formatSignedValue(round(project.crop.rotation, 1))}°
              </span>
            </div>
            <Slider
              min={-45}
              max={45}
              step={0.1}
              value={[project.crop.rotation]}
              onValueChange={([value]) => setCropRotation(value)}
            />
          </div>

          <div className={cn("grid gap-3 sm:grid-cols-2", compact ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-1")}>
            <Button
              variant={project.crop.flipX ? "amber" : "outline"}
              onClick={() => toggleFlip("x")}
              size="sm"
            >
              Flip H
            </Button>
            <Button
              variant={project.crop.flipY ? "amber" : "outline"}
              onClick={() => toggleFlip("y")}
              size="sm"
            >
              Flip V
            </Button>
          </div>

          <div className={cn("grid gap-3 sm:grid-cols-2", compact ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-1")}>
            <Button
              variant="ghost"
              onClick={() => setCropRotation(0)}
              size="sm"
              className="w-full px-1 text-[9px] tracking-[0.08em] sm:px-2 sm:text-[10px] sm:tracking-[0.12em]"
            >
              Straighten
            </Button>
            <Button
              variant="ghost"
              onClick={resetCrop}
              size="sm"
              className="w-full px-1 text-[9px] tracking-[0.08em] sm:px-2 sm:text-[10px] sm:tracking-[0.12em]"
            >
              Reset
            </Button>
          </div>

          <div className="border border-(--border) bg-[rgba(255,255,255,0.02)] p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-(--accent)">
              Perspective Warp
            </p>
            <p className="mt-3 text-sm leading-6 text-(--text-muted)">
              Grab any amber corner handle directly on the canvas to skew the crop
              into a perspective-correct or off-axis frame.
            </p>
          </div>

          {!compact ? (
            <div className="space-y-2">
              <Button
                variant="amber"
                size="sm"
                className="w-full"
                onClick={() => setActiveTab("filters")}
              >
                Apply Crop
              </Button>
              <p className="text-center text-[10px] leading-4 tracking-[0.08em] text-(--text-muted)">
                The workspace will resize to this frame. Text outside it stays
                clipped and will not be exported.
              </p>
            </div>
          ) : null}
        </div>
      </PanelSection>
    </div>
  );
}

export function InspectorPanel({
  className,
  compact = false,
  onRequestEditSelectedText,
  onTextLayerAdded,
}: {
  className?: string;
  compact?: boolean;
  onRequestEditSelectedText?: () => void;
  onTextLayerAdded?: (layerId: string) => void;
}) {
  const { activeTab } = useEditor();

  return (
    <div
      data-compact={compact}
      className={cn(
        "scrollbar-gutter-stable min-h-0 h-full touch-pan-y overflow-y-auto overscroll-contain",
        className,
      )}
    >
      <div className={cn("space-y-6", compact ? "p-3 pb-10" : "p-4 pb-6 sm:p-5")}>
        {activeTab === "filters" ? <FiltersInspector compact={compact} /> : null}
        {activeTab === "adjustments" ? <AdjustmentsInspector compact={compact} /> : null}
        {activeTab === "text" ? (
          <TextInspector
            compact={compact}
            onRequestEditSelectedText={onRequestEditSelectedText}
            onTextLayerAdded={onTextLayerAdded}
          />
        ) : null}
        {activeTab === "overlays" ? (
          <OverlaysInspector compact={compact} />
        ) : null}
        {activeTab === "crop" ? <CropInspector compact={compact} /> : null}
      </div>
    </div>
  );
}
