import { describe, expect, test } from "bun:test";

import {
  ADJUSTMENT_GROUPS,
  ALL_LOOKS,
  AUTO_GRAIN_LAYER_ID,
  BORDER_PRESETS,
  createInitialProjectState,
  DEFAULT_FLARE_PRESET,
  DEFAULT_ADJUSTMENTS,
  DUST_PRESET,
  GRAIN_PRESETS,
  LIGHT_LEAK_PRESETS,
  resolveLookGrainLayer,
} from "@/components/editor/constants";
import {
  packGamutMappedRgb,
  mapToneValue,
  RENDERED_BORDER_PRESET_IDS,
  resolveNoiseReductionParameters,
  resolveEffectiveAdjustments,
  resolveLookOpticalEffectParameters,
  resolveOverlayLayers,
  resolveSelectiveColorMix,
  toneMapFilmic,
} from "@/lib/exportImage";

describe("filter color safety", () => {
  test("Whites and Blacks make strong localized tonal changes", () => {
    const neutral = { ...DEFAULT_ADJUSTMENTS };
    const brighterWhites = mapToneValue(0.9, { ...neutral, whites: 100 });
    const darkerWhites = mapToneValue(0.9, { ...neutral, whites: -100 });
    const liftedBlacks = mapToneValue(0.1, { ...neutral, blacks: 100 });
    const crushedBlacks = mapToneValue(0.1, { ...neutral, blacks: -100 });

    expect(brighterWhites - mapToneValue(0.9, neutral)).toBeGreaterThan(0.04);
    expect(mapToneValue(0.9, neutral) - darkerWhites).toBeGreaterThan(0.04);
    expect(liftedBlacks - mapToneValue(0.1, neutral)).toBeGreaterThan(0.08);
    expect(mapToneValue(0.1, neutral) - crushedBlacks).toBeGreaterThan(0.04);
    expect(mapToneValue(0.5, { ...neutral, whites: 100 })).toBeCloseTo(0.5, 3);
    expect(mapToneValue(0.5, { ...neutral, blacks: 100 })).toBeCloseTo(0.5, 3);
  });

  test("every tone control remains smooth and monotonic", () => {
    const toneControls = [
      "exposure",
      "highlights",
      "shadows",
      "whites",
      "blacks",
      "fade",
    ] as const;

    for (const key of toneControls) {
      for (const value of key === "fade" ? [100] : [-100, 100]) {
        const adjustments = { ...DEFAULT_ADJUSTMENTS, [key]: value };
        const mapped = Array.from({ length: 256 }, (_, input) =>
          mapToneValue(input / 255, adjustments),
        );

        for (let index = 1; index < mapped.length; index++) {
          expect(mapped[index], `${key} ${value} at ${index}`).toBeGreaterThanOrEqual(
            mapped[index - 1] - 0.000001,
          );
        }
      }
    }
  });

  test("the highlight shoulder is continuous and monotonic", () => {
    const samples = Array.from({ length: 401 }, (_, index) => index / 200);
    const mapped = samples.map(toneMapFilmic);

    for (let index = 1; index < mapped.length; index++) {
      expect(mapped[index]).toBeGreaterThanOrEqual(mapped[index - 1]);
    }

    expect(Math.abs(toneMapFilmic(1.000001) - toneMapFilmic(0.999999))).toBeLessThan(
      0.00001,
    );
    expect(toneMapFilmic(Number.NaN)).toBe(0);
    expect(toneMapFilmic(Number.POSITIVE_INFINITY)).toBe(0);
  });

  test("out-of-gamut color is compressed without channel clipping", () => {
    const packed = packGamutMappedRgb(-30, 290, 310);
    const red = packed >> 16;
    const green = (packed >> 8) & 0xff;
    const blue = packed & 0xff;

    expect(red).toBeGreaterThanOrEqual(0);
    expect(blue).toBeLessThanOrEqual(255);
    expect(red).toBeLessThan(green);
    expect(green).toBeLessThan(blue);
    expect(green).toBeLessThan(255);
    expect(packGamutMappedRgb(12, 34, 56)).toBe((12 << 16) | (34 << 8) | 56);
    expect(packGamutMappedRgb(Number.NaN, 10, 20)).toBe(0);
  });

  test("every look has a finite 4x5 color matrix and supported CSS filters", () => {
    const supportedFilter = /^(brightness|contrast|saturate|sepia|hue-rotate)$/;

    for (const look of ALL_LOOKS) {
      const matrices = [look.matrix, ...Object.values(look.acrosChannels ?? {})];

      for (const matrix of matrices) {
        const values = matrix.trim().split(/\s+/).map(Number);
        expect(values, `${look.id} matrix`).toHaveLength(20);
        expect(values.every(Number.isFinite), `${look.id} matrix values`).toBe(true);
      }

      const operations = [...look.cssFilter.matchAll(/([a-z-]+)\(([^)]+)\)/g)];
      expect(operations.length, `${look.id} filter operations`).toBeGreaterThan(0);

      for (const [, operation, rawValue] of operations) {
        expect(supportedFilter.test(operation), `${look.id}: ${operation}`).toBe(true);
        expect(Number.isFinite(Number.parseFloat(rawValue)), `${look.id}: ${rawValue}`).toBe(
          true,
        );
      }
    }
  });

  test("Fallen Angels optical effects scale with intensity and output size", () => {
    const look = ALL_LOOKS.find((candidate) => candidate.id === "fallen-angels");

    expect(look).toBeDefined();

    const bypassed = resolveLookOpticalEffectParameters(look!, 0, 2000);
    const preview = resolveLookOpticalEffectParameters(look!, 0.92, 1000);
    const exportSize = resolveLookOpticalEffectParameters(look!, 0.92, 4000);

    expect(bypassed.chromaticShift).toBe(0);
    expect(bypassed.highlightSmear).toBe(0);
    expect(preview.chromaticShift).toBeGreaterThan(0);
    expect(preview.highlightSmear).toBeGreaterThan(0);
    expect(exportSize.chromaticShift).toBeGreaterThanOrEqual(
      preview.chromaticShift * 3.5,
    );
    expect(exportSize.highlightSmear).toBeGreaterThanOrEqual(
      preview.highlightSmear * 3.5,
    );
  });

  test("Fallen Angels preserves smoky near-blacks instead of clipping shadow depth", () => {
    const project = createInitialProjectState();
    const look = ALL_LOOKS.find((candidate) => candidate.id === "fallen-angels");

    expect(look).toBeDefined();
    expect(look!.renderRecipe.washes.some((wash) => wash.blendMode === "screen")).toBe(
      false,
    );
    expect(look!.renderRecipe.layerBlendMode).toBe("normal");

    project.activeLookId = look!.id;
    project.filterIntensity = 100;
    const adjustments = resolveEffectiveAdjustments(project);
    const deepestShadow = mapToneValue(0.08, adjustments);
    const nearBlack = mapToneValue(0.18, adjustments);
    const lowerMidtone = mapToneValue(0.3, adjustments);

    expect(deepestShadow).toBeGreaterThan(0.03);
    expect(deepestShadow).toBeLessThan(0.06);
    expect(nearBlack).toBeGreaterThan(0.12);
    expect(nearBlack).toBeLessThan(0.17);
    expect(lowerMidtone).toBeGreaterThan(0.25);
  });

  test("new signature looks preserve tonal range while allowing intentional color separation", () => {
    const gentleLookIds = [
      "amelie",
      "call-me-by-your-name",
      "three-strip-technicolor",
    ];

    for (const lookId of gentleLookIds) {
      const project = createInitialProjectState();
      const look = ALL_LOOKS.find((candidate) => candidate.id === lookId);

      expect(look, lookId).toBeDefined();
      project.activeLookId = lookId;
      project.filterIntensity = 100;

      const adjustments = resolveEffectiveAdjustments(project);
      const deepShadow = mapToneValue(0.08, adjustments);
      const midtone = mapToneValue(0.5, adjustments);
      const brightHighlight = mapToneValue(0.92, adjustments);

      expect(deepShadow, `${lookId} shadow floor`).toBeGreaterThan(0.09);
      expect(deepShadow, `${lookId} shadow ceiling`).toBeLessThan(0.145);
      expect(midtone, `${lookId} midtone floor`).toBeGreaterThan(0.47);
      expect(midtone, `${lookId} midtone ceiling`).toBeLessThan(0.54);
      expect(brightHighlight, `${lookId} highlight floor`).toBeGreaterThan(0.86);
      expect(brightHighlight, `${lookId} highlight ceiling`).toBeLessThan(0.93);

      const matrix = look!.matrix.trim().split(/\s+/).map(Number);
      const neutralChannels = [0, 5, 10].map(
        (offset) =>
          0.5 * (matrix[offset] + matrix[offset + 1] + matrix[offset + 2]) +
          matrix[offset + 4],
      );
      const channelSpread = Math.max(...neutralChannels) - Math.min(...neutralChannels);

      expect(channelSpread, `${lookId} neutral color spread`).toBeLessThan(0.09);
    }
  });

  test("new cinema signatures have a visibly meaningful default layer strength", () => {
    for (const lookId of [
      "amelie",
      "call-me-by-your-name",
      "three-strip-technicolor",
      "fight-club",
      "sin-city",
      "the-dark-knight",
      "chungking-express",
    ]) {
      const look = ALL_LOOKS.find((candidate) => candidate.id === lookId);
      const effectiveLayerStrength =
        (look!.preset.filterIntensity / 100) * look!.renderRecipe.layerOpacity;

      expect(look, lookId).toBeDefined();
      expect(effectiveLayerStrength, `${lookId} default layer strength`).toBeGreaterThan(
        0.7,
      );
    }
  });

  test("Sin City retains strong reds without coloring skin, blues, or neutrals", () => {
    const look = ALL_LOOKS.find((candidate) => candidate.id === "sin-city");

    expect(look?.selectiveColor).toBeDefined();
    const settings = look!.selectiveColor!;

    expect(resolveSelectiveColorMix(220, 25, 35, settings)).toBeGreaterThan(0.8);
    expect(resolveSelectiveColorMix(210, 140, 110, settings)).toBeLessThan(0.12);
    expect(resolveSelectiveColorMix(25, 80, 220, settings)).toBe(0);
    expect(resolveSelectiveColorMix(128, 128, 128, settings)).toBe(0);
  });

  test("dark cinema signatures keep readable blacks and recoverable highlights", () => {
    for (const lookId of [
      "fight-club",
      "sin-city",
      "the-dark-knight",
      "chungking-express",
    ]) {
      const project = createInitialProjectState();
      project.activeLookId = lookId;
      project.filterIntensity = 100;
      const adjustments = resolveEffectiveAdjustments(project);

      expect(mapToneValue(0.08, adjustments), `${lookId} black detail`).toBeGreaterThan(
        0.045,
      );
      expect(mapToneValue(0.5, adjustments), `${lookId} midtone detail`).toBeGreaterThan(
        0.43,
      );
      expect(
        mapToneValue(0.92, adjustments),
        `${lookId} highlight detail`,
      ).toBeLessThan(0.94);
    }
  });

  test("every exposed effect preset has valid render values", () => {
    const presets = [
      ...GRAIN_PRESETS,
      ...LIGHT_LEAK_PRESETS,
      ...BORDER_PRESETS,
      DUST_PRESET,
      DEFAULT_FLARE_PRESET,
    ];
    const blendModes = new Set(["normal", "screen", "multiply", "overlay", "soft-light"]);

    for (const preset of presets) {
      expect(Number.isFinite(preset.opacity), `${preset.id} opacity`).toBe(true);
      expect(preset.opacity, `${preset.id} opacity minimum`).toBeGreaterThanOrEqual(0);
      expect(preset.opacity, `${preset.id} opacity maximum`).toBeLessThanOrEqual(1);
      expect(blendModes.has(preset.blendMode ?? "normal"), `${preset.id} blend mode`).toBe(
        true,
      );
    }

    const renderedBorderIds: string[] = [...RENDERED_BORDER_PRESET_IDS].sort();
    const configuredBorderIds: string[] = BORDER_PRESETS.map(
      (preset) => preset.id,
    ).sort();
    expect(renderedBorderIds).toEqual(configuredBorderIds);
  });

  test("every filter layers over manual adjustments and grain independently", () => {
    const manualGrain = {
      ...GRAIN_PRESETS[2],
      id: "overlay-grain-heavy",
      presetId: GRAIN_PRESETS[2].id,
    };

    for (const look of ALL_LOOKS) {
      const project = createInitialProjectState();
      project.activeLookId = look.id;
      project.adjustments.exposure = 10;
      project.adjustments.temperature = 5700;
      project.adjustments.grainAmount = 20;

      project.filterIntensity = 0;
      const bypassed = resolveEffectiveAdjustments(project);
      expect(bypassed.exposure, `${look.id} bypass exposure`).toBe(10);
      expect(bypassed.temperature, `${look.id} bypass temperature`).toBe(5700);
      expect(bypassed.grainAmount, `${look.id} bypass grain`).toBe(20);

      project.filterIntensity = 100;
      const mixed = resolveEffectiveAdjustments(project);
      const expectedExposure = Math.max(
        -100,
        Math.min(100, (look.preset.adjustments.exposure ?? 0) + 10),
      );
      const expectedTemperature = Math.max(
        2000,
        Math.min(10000, (look.preset.adjustments.temperature ?? 5500) + 200),
      );
      expect(mixed.exposure, `${look.id} mixed exposure`).toBe(expectedExposure);
      expect(mixed.temperature, `${look.id} mixed temperature`).toBe(
        expectedTemperature,
      );
      expect(mixed.grainAmount, `${look.id} mixed grain`).toBe(20);

      const automatic = resolveLookGrainLayer(look, null);
      expect(resolveLookGrainLayer(look, manualGrain), `${look.id} manual grain`).toEqual(
        manualGrain,
      );
      expect(automatic?.id, `${look.id} automatic grain`).toBe(
        AUTO_GRAIN_LAYER_ID,
      );
      expect(resolveLookGrainLayer(null, automatic)).toBeNull();
    }
  });

  test("every manual adjustment reaches the raster pipeline", () => {
    for (const group of ADJUSTMENT_GROUPS) {
      for (const control of group.controls) {
        const project = createInitialProjectState();
        const neutral = DEFAULT_ADJUSTMENTS[control.key];
        const sample = neutral === control.max ? control.min : control.max;
        project.adjustments[control.key] = sample;

        expect(
          resolveEffectiveAdjustments(project)[control.key],
          control.key,
        ).toBe(sample);
      }
    }
  });

  test("noise reduction grows progressively without becoming an unrestricted blur", () => {
    const low = resolveNoiseReductionParameters(20, 1600);
    const medium = resolveNoiseReductionParameters(50, 1600);
    const high = resolveNoiseReductionParameters(100, 1600);

    expect(low.strength).toBeLessThan(medium.strength);
    expect(medium.strength).toBeLessThan(high.strength);
    expect(low.radius).toBeLessThan(medium.radius);
    expect(medium.radius).toBeLessThan(high.radius);
    expect(low.lumaMix).toBeLessThan(medium.lumaMix);
    expect(medium.lumaMix).toBeLessThan(high.lumaMix);
    expect(high.lumaMix).toBeLessThan(0.9);
    expect(high.chromaMix).toBeLessThan(1);
  });

  test("manual grain starts continuously and applies its size exactly once", () => {
    const project = createInitialProjectState();

    project.adjustments.grainAmount = 1;
    project.adjustments.grainSize = 72;
    const low = resolveOverlayLayers(project).effectLayers[0];

    project.adjustments.grainAmount = 50;
    const medium = resolveOverlayLayers(project).effectLayers[0];

    project.adjustments.grainAmount = 100;
    const high = resolveOverlayLayers(project).effectLayers[0];

    expect(low.type).toBe("grain");
    expect(low.opacity).toBeLessThan(0.005);
    expect(low.size).toBe(72);
    expect(low.opacity).toBeLessThan(medium.opacity);
    expect(medium.opacity).toBeLessThan(high.opacity);
    expect(low.intensity).toBeLessThan(medium.intensity ?? 0);
    expect(medium.intensity ?? 0).toBeLessThan(high.intensity ?? 0);
  });
});
