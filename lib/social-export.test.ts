import { describe, expect, test } from "bun:test";

import {
  ASPECT_RATIO_PRESETS,
  DEFAULT_CROP,
  getPerspectiveForPreset,
} from "@/components/editor/constants";
import {
  getCropGeometry,
  getCroppedSourceDimensions,
  getExportCompatibilityMessage,
  interpolateCropPoint,
  mapSourcePointToCrop,
  resolveExportDimensions,
} from "@/lib/social-export";

describe("social export sizing", () => {
  test("Instagram feed emits standard 4:5 dimensions", () => {
    expect(resolveExportDimensions(3200, 4000, "instagram-feed")).toEqual({
      width: 1080,
      height: 1350,
    });
  });

  test("Instagram 3:4 and Stories resolve to their native handoff sizes", () => {
    expect(resolveExportDimensions(3000, 4000, "instagram-feed")).toEqual({
      width: 1080,
      height: 1440,
    });
    expect(resolveExportDimensions(2160, 3840, "story-reel")).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  test("social exports never invent pixels for a small source", () => {
    expect(resolveExportDimensions(801, 1001, "instagram-feed")).toEqual({
      width: 800,
      height: 1000,
    });
  });

  test("archive export preserves aspect while respecting the safety cap", () => {
    expect(resolveExportDimensions(8000, 6000, "original")).toEqual({
      width: 4096,
      height: 3072,
    });
  });

  test("crop bounds drive export pixels and incompatible shapes are explained", () => {
    const crop = {
      ...DEFAULT_CROP,
      perspective: {
        tl: { x: 10, y: 10 },
        tr: { x: 90, y: 10 },
        br: { x: 90, y: 90 },
        bl: { x: 10, y: 90 },
      },
    };
    const dimensions = getCroppedSourceDimensions(4000, 3000, crop);
    expect(dimensions).toEqual({ width: 3200, height: 2400 });
    expect(getExportCompatibilityMessage("story-reel", 1080, 1350)).toContain(
      "9:16",
    );
    expect(getExportCompatibilityMessage("instagram-feed", 1080, 1440)).toBeNull();
  });

  test("every crop preset exports at its requested aspect ratio", () => {
    const sourceWidth = 4032;
    const sourceHeight = 3024;

    for (const preset of ASPECT_RATIO_PRESETS) {
      if (preset.value === null) {
        continue;
      }

      const crop = {
        ...DEFAULT_CROP,
        presetId: preset.id,
        perspective: getPerspectiveForPreset(
          preset.id,
          sourceWidth,
          sourceHeight,
        ),
      };
      const dimensions = getCroppedSourceDimensions(
        sourceWidth,
        sourceHeight,
        crop,
      );

      expect(
        dimensions.width / dimensions.height,
        `${preset.id} crop ratio`,
      ).toBeCloseTo(preset.value, 6);
    }
  });

  test("a moved freeform crop exports only its selected source rectangle", () => {
    const crop = {
      ...DEFAULT_CROP,
      perspective: {
        tl: { x: 23, y: 17 },
        tr: { x: 76, y: 17 },
        br: { x: 76, y: 68 },
        bl: { x: 23, y: 68 },
      },
    };
    const geometry = getCropGeometry(6000, 4000, crop);

    expect(geometry.bounds).toEqual({
      minX: 1380,
      minY: 680,
      maxX: 4560,
      maxY: 2720,
    });
    expect(geometry.width).toBe(3180);
    expect(geometry.height).toBe(2040);
    expect(geometry.isAxisAligned).toBe(true);

    const belowCrop = mapSourcePointToCrop({ x: 3000, y: 3600 }, geometry);
    expect(belowCrop.y).toBeGreaterThan(1);
  });

  test("off-axis crops use their edges instead of leaking bounding-box pixels", () => {
    const crop = {
      ...DEFAULT_CROP,
      perspective: {
        tl: { x: 18, y: 8 },
        tr: { x: 86, y: 18 },
        br: { x: 78, y: 91 },
        bl: { x: 11, y: 79 },
      },
    };
    const geometry = getCropGeometry(4000, 3000, crop);

    expect(geometry.isAxisAligned).toBe(false);
    expect(geometry.width).toBeLessThan(
      geometry.bounds.maxX - geometry.bounds.minX,
    );
    expect(geometry.height).toBeLessThan(
      geometry.bounds.maxY - geometry.bounds.minY,
    );

    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.27, 0.64],
    ]) {
      const sourcePoint = interpolateCropPoint(geometry.points, u, v);
      const mapped = mapSourcePointToCrop(sourcePoint, geometry);
      expect(mapped.x, `u at ${u},${v}`).toBeCloseTo(u, 5);
      expect(mapped.y, `v at ${u},${v}`).toBeCloseTo(v, 5);
    }
  });

  test("crop geometry safely clamps corrupt legacy coordinates", () => {
    const crop = {
      ...DEFAULT_CROP,
      perspective: {
        tl: { x: Number.NaN, y: -20 },
        tr: { x: 130, y: 0 },
        br: { x: 110, y: 140 },
        bl: { x: 0, y: 100 },
      },
    };
    const geometry = getCropGeometry(1000, 800, crop);

    expect(Object.values(geometry.points).flatMap((point) => [point.x, point.y]))
      .toEqual([0, 0, 1000, 0, 1000, 800, 0, 800]);
    expect(geometry.width).toBe(1000);
    expect(geometry.height).toBe(800);
  });
});
