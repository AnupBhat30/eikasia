import { describe, expect, test } from "bun:test";

import {
  canvasViewportTransform,
  normalizeCanvasViewport,
  normalizeWheelDeltaY,
  screenDeltaToCanvasPercentage,
  translateCanvasViewport,
  zoomCanvasViewportAtPoint,
} from "./canvas-viewport";

describe("canvas viewport", () => {
  test("keeps the image point under the focal point stationary", () => {
    const current = { zoom: 1.25, offsetX: 18, offsetY: -7 };
    const focal = { x: 140, y: -60 };
    const imagePoint = {
      x: (focal.x - current.offsetX) / current.zoom,
      y: (focal.y - current.offsetY) / current.zoom,
    };
    const next = zoomCanvasViewportAtPoint(current, 2.1, focal);

    expect(next.offsetX + imagePoint.x * next.zoom).toBeCloseTo(focal.x, 8);
    expect(next.offsetY + imagePoint.y * next.zoom).toBeCloseTo(focal.y, 8);
  });

  test("combines two-finger movement with focal-point zoom without drift", () => {
    const start = { zoom: 1.4, offsetX: 30, offsetY: 12 };
    const startCentre = { x: -40, y: 50 };
    const movedCentre = { x: -22, y: 41 };
    const zoomed = zoomCanvasViewportAtPoint(start, 1.9, startCentre);
    const moved = translateCanvasViewport(zoomed, {
      x: movedCentre.x - startCentre.x,
      y: movedCentre.y - startCentre.y,
    });
    const imagePoint = {
      x: (startCentre.x - start.offsetX) / start.zoom,
      y: (startCentre.y - start.offsetY) / start.zoom,
    };

    expect(moved.offsetX + imagePoint.x * moved.zoom).toBeCloseTo(
      movedCentre.x,
      8,
    );
    expect(moved.offsetY + imagePoint.y * moved.zoom).toBeCloseTo(
      movedCentre.y,
      8,
    );
  });

  test("preserves fine zoom motion and protects against invalid input", () => {
    expect(
      normalizeCanvasViewport({ zoom: 1.004, offsetX: 12, offsetY: -5 }),
    ).toEqual({ zoom: 1.004, offsetX: 12, offsetY: -5 });
    expect(
      normalizeCanvasViewport({ zoom: Number.NaN, offsetX: Infinity, offsetY: 2 }),
    ).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 });
  });

  test("preserves subpixel motion in the CSS transform", () => {
    expect(
      canvasViewportTransform({ zoom: 1.333333, offsetX: 0.375, offsetY: -1.625 }),
    ).toBe("translate3d(0.375px, -1.625px, 0) scale(1.33333)");
  });

  test("keeps trackpad precision while taming extreme wheel deltas", () => {
    expect(normalizeWheelDeltaY(0.375, 0, 800)).toBe(0.375);
    expect(normalizeWheelDeltaY(-2, 1, 800)).toBe(-32);
    expect(normalizeWheelDeltaY(1, 2, 800)).toBe(100);
    expect(normalizeWheelDeltaY(-1, 2, 800)).toBe(-100);
    expect(normalizeWheelDeltaY(Number.NaN, 0, 800)).toBe(0);
  });

  test("maps screen drags through zoom, rotation, flips, and image aspect", () => {
    const landscape = { width: 400, height: 200 };
    const rotated = screenDeltaToCanvasPercentage(
      { x: 100, y: 0 },
      landscape,
      1,
      90,
      false,
      false,
    );

    expect(rotated.x).toBeCloseTo(0, 6);
    expect(rotated.y).toBeCloseTo(-50, 6);

    const transformed = screenDeltaToCanvasPercentage(
      { x: -109.282032, y: 29.282032 },
      landscape,
      2,
      30,
      true,
      false,
    );

    expect(transformed.x).toBeCloseTo(10, 5);
    expect(transformed.y).toBeCloseTo(20, 5);
  });
});
