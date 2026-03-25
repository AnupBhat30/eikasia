"use client";

import * as React from "react";
import {
  Aperture,
  Crop,
  Layers3,
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
  DEFAULT_FLARE_PRESET,
  DUST_PRESET,
  FUJIFILM_LOOKS,
  GRAIN_PRESETS,
  LIGHT_LEAK_PRESETS,
  TEXT_PRESETS,
  getLookDefinition,
  getLookFilterId,
} from "@/components/editor/constants";
import { useEditor } from "@/components/editor/editor-context";
import type {
  AdjustmentControlDefinition,
  LookDefinition,
  OverlayPresetDefinition,
  TextLayer,
} from "@/components/editor/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn, formatSignedValue, round, uid } from "@/lib/utils";

const LOOK_CATEGORY_LABELS: Record<LookDefinition["category"], string> = {
  fujifilm: "Fujifilm",
  analog: "Analog Film",
  cinema: "Cinema Preset",
  bw: "Black & White",
};

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
    <section className="space-y-4 border-b border-[var(--border)] pb-6 last:border-b-0 last:pb-0">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center border border-[var(--border)] bg-[rgba(255,255,255,0.02)]">
            <Icon className="size-4 text-[var(--accent)]" />
          </span>
          <h3 className="text-[10px] font-medium uppercase tracking-[0.24em] leading-4 text-[var(--text-primary)] sm:text-[11px] sm:tracking-[0.34em]">
            {title}
          </h3>
        </div>
        {detail ? (
          <p className="max-w-[32ch] text-sm leading-6 text-[var(--text-muted)]">
            {detail}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function ToneCard({
  look,
  active,
  acrosChannel,
  disabled,
  onSelect,
}: {
  look: LookDefinition;
  active: boolean;
  acrosChannel: string;
  disabled: boolean;
  onSelect: (lookId: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(look.id)}
      className={cn(
        "group flex w-[88px] shrink-0 flex-col gap-2 text-left transition-transform duration-150 disabled:opacity-40 sm:w-[94px]",
        active ? "-translate-y-0.5" : "hover:-translate-y-0.5",
      )}
    >
      <span
        className={cn(
          "relative block h-18 w-18 overflow-hidden border bg-black shadow-[0_20px_40px_rgba(0,0,0,0.25)] sm:h-20 sm:w-20",
          active
            ? "border-[var(--accent)]"
            : "border-[var(--border)] group-hover:border-[rgba(245,158,11,0.55)]",
        )}
      >
        <span
          className="absolute inset-0"
          style={{ backgroundImage: look.thumbnail }}
        />
        <span
          className="absolute inset-0"
          style={{
            backgroundImage: look.thumbnail,
            opacity: look.renderRecipe.layerOpacity,
            mixBlendMode:
              look.renderRecipe.layerBlendMode === "normal"
                ? "normal"
                : look.renderRecipe.layerBlendMode,
            filter: `${look.cssFilter} url(#${getLookFilterId(
              look.id,
              look.id === "acros" ? (acrosChannel as never) : "neutral",
            )})`,
          }}
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
          "font-mono text-[10px] uppercase tracking-[0.14em] leading-4 break-words sm:text-[11px] sm:tracking-[0.18em]",
          active ? "text-[var(--accent)]" : "text-[var(--text-muted)]",
        )}
      >
        {look.name}
      </span>
    </button>
  );
}

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
          <span className="truncate text-[10px] uppercase tracking-[0.2em] text-[var(--text-primary)] sm:text-[11px] sm:tracking-[0.26em]">
            {control.label}
          </span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] sm:text-[11px] sm:tracking-[0.16em]">
            {formatAdjustmentValue(control, value)}
          </span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onReset}
          className="flex size-7 items-center justify-center border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[rgba(245,158,11,0.45)] hover:text-[var(--accent)] disabled:opacity-30"
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

function FiltersInspector() {
  const {
    project,
    setLook,
    setFilterIntensity,
    setAcrosChannel,
  } = useEditor();
  const selectedLook = getLookDefinition(project.activeLookId);

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
                acrosChannel={project.acrosChannel}
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
                acrosChannel={project.acrosChannel}
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
                acrosChannel={project.acrosChannel}
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
              <p className="text-[11px] uppercase tracking-[0.26em] text-[var(--text-primary)]">
                Intensity
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
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
              <p className="text-[11px] uppercase tracking-[0.26em] text-[var(--text-primary)]">
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
            <div className="border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
                  {LOOK_CATEGORY_LABELS[selectedLook.category]}
                </span>
                <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  {selectedLook.name}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                {selectedLook.summary}
              </p>
            </div>
          ) : null}
        </div>
      </PanelSection>
    </div>
  );
}

function AdjustmentsInspector() {
  const { project, setAdjustment, resetAdjustment } = useEditor();

  return (
    <PanelSection
      icon={Aperture}
      title="Manual Adjustments"
      detail="Exposure shaping, color temperature, detail emphasis, and analog finishing controls."
    >
      <Accordion
        type="multiple"
        defaultValue={ADJUSTMENT_GROUPS.map((group) => group.id)}
      >
        {ADJUSTMENT_GROUPS.map((group) => (
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
        ))}
      </Accordion>
    </PanelSection>
  );
}

function createLayerFromPreset(preset: (typeof TEXT_PRESETS)[number]): TextLayer {
  return {
    id: uid("text"),
    presetId: preset.id,
    text: preset.text,
    xPct: preset.xPct,
    yPct: preset.yPct,
    widthPct: preset.widthPct,
    fontSizePct: preset.fontSizePct,
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
  };
}

function createCustomTextLayer(): TextLayer {
  return {
    id: uid("text"),
    presetId: "custom",
    text: "Double-click to edit",
    xPct: 50,
    yPct: 50,
    widthPct: 48,
    fontSizePct: 12,
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
  };
}

function TextInspector() {
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

    const layer = createLayerFromPreset(preset);
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
  };

  const handleAddCustomText = () => {
    const layer = createCustomTextLayer();
    addTextLayer(layer);
    setSelectedTextId(layer.id);
  };

  return (
    <div className="space-y-6">
      <PanelSection
        icon={Type}
        title="Text Presets"
        detail="Preset title cards, subtitles, credits, and film-stamp overlays ready to drop on the Fabric canvas."
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
          <div className="grid grid-cols-2 gap-3">
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={!hasImage}
                onClick={() => handleAddPreset(preset.id)}
                className="group min-h-[92px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3 text-left transition-colors hover:border-[rgba(245,158,11,0.45)] hover:bg-[rgba(245,158,11,0.04)] disabled:opacity-40"
              >
                <span className="block text-[10px] uppercase tracking-[0.18em] leading-4 text-[var(--text-primary)] sm:text-[11px] sm:tracking-[0.26em]">
                  {preset.name}
                </span>
                <span className="mt-3 block text-xs leading-5 text-[var(--text-muted)]">
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
                    ? "border-[var(--accent)] bg-[rgba(245,158,11,0.06)]"
                    : "border-[var(--border)] bg-[rgba(255,255,255,0.02)]",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setSelectedTextId(layer.id)}
                >
                  <p className="truncate text-[10px] uppercase tracking-[0.16em] text-[var(--text-primary)] sm:text-[11px] sm:tracking-[0.24em]">
                    {layer.presetId.replaceAll("-", " ")}
                  </p>
                  <p className="mt-2 truncate font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {layer.text}
                  </p>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeTextLayer(layer.id)}
                >
                  Remove
                </Button>
              </div>
            ))
          ) : (
            <div className="border border-dashed border-[var(--border)] p-4 text-sm leading-6 text-[var(--text-muted)]">
              No text objects yet. Click any preset above to place it on the
              image canvas.
            </div>
          )}

          {selectedLayer ? (
            <div className="border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
              <p className="text-[11px] uppercase tracking-[0.26em] text-[var(--accent)]">
                Selected
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
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
        "border px-2 py-3 text-center text-[10px] uppercase tracking-[0.14em] leading-4 transition-colors disabled:opacity-40 sm:px-3 sm:text-[11px] sm:tracking-[0.24em]",
        active
          ? "border-[var(--accent)] bg-[rgba(245,158,11,0.08)] text-[var(--accent)]"
          : "border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-[var(--text-muted)] hover:border-[rgba(245,158,11,0.45)] hover:text-[var(--text-primary)]",
      )}
    >
      {label}
    </button>
  );
}

function OverlaysInspector() {
  const { project, upsertOverlay, removeOverlay } = useEditor();

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

  return (
    <div className="space-y-6">
      <PanelSection
        icon={Layers3}
        title="Film Grain"
        detail="SVG turbulence overlays with blend modes tuned for subtle or gritty analog texture."
      >
        <div className="grid grid-cols-3 gap-3">
          {GRAIN_PRESETS.map((preset) => (
            <OverlayPresetButton
              key={preset.id}
              label={preset.name}
              active={activeOverlay.grain?.presetId === preset.id}
              disabled={false}
              onClick={() => addOverlayPreset(preset)}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection
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
              disabled={false}
              onClick={() => addOverlayPreset(preset)}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => removeOverlay(undefined, "lightLeak")}
        >
          Clear Leak
        </Button>
      </PanelSection>

      <PanelSection
        icon={Sparkles}
        title="Anamorphic Flare"
        detail="Blue cinema streak with adjustable intensity and vertical placement."
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-primary)]">
            Lens Streak
          </p>
          <Button
            size="sm"
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
              <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-primary)]">
                Intensity
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
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
              <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-primary)]">
                Position
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
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
      </PanelSection>

      <PanelSection
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
              disabled={false}
              onClick={() => addOverlayPreset(preset)}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => removeOverlay(undefined, "border")}
        >
          Remove Border
        </Button>
      </PanelSection>

      <PanelSection
        icon={Layers3}
        title="Dust & Scratches"
        detail="Add restrained analog imperfections on top of the frame."
      >
        <div className="flex items-center justify-between gap-4 border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-[var(--text-primary)]">
              Imperfections
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              Thin scratches, dust specks, and projector wear.
            </p>
          </div>
          <Button
            size="sm"
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
      </PanelSection>
    </div>
  );
}

function CropInspector() {
  const {
    project,
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
              <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-primary)]">
                Rotation
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
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

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={project.crop.flipX ? "amber" : "outline"}
              onClick={() => toggleFlip("x")}
            >
              Flip Horizontal
            </Button>
            <Button
              variant={project.crop.flipY ? "amber" : "outline"}
              onClick={() => toggleFlip("y")}
            >
              Flip Vertical
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="ghost"
              onClick={() => setCropRotation(0)}
            >
              Straighten
            </Button>
            <Button
              variant="ghost"
              onClick={resetCrop}
            >
              Reset Transform
            </Button>
          </div>

          <div className="border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
              Perspective Warp
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              Grab any amber corner handle directly on the canvas to skew the crop
              into a perspective-correct or off-axis frame.
            </p>
          </div>
        </div>
      </PanelSection>
    </div>
  );
}

export function InspectorPanel({ className }: { className?: string }) {
  const { activeTab } = useEditor();

  return (
    <div className={cn("min-h-0 h-full overflow-y-auto overscroll-contain", className)}>
      <div className="space-y-6 p-4 sm:p-5">
        {activeTab === "filters" ? <FiltersInspector /> : null}
        {activeTab === "adjustments" ? <AdjustmentsInspector /> : null}
        {activeTab === "text" ? <TextInspector /> : null}
        {activeTab === "overlays" ? <OverlaysInspector /> : null}
        {activeTab === "crop" ? <CropInspector /> : null}
      </div>
    </div>
  );
}
