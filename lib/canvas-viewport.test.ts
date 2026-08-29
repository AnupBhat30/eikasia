import { describe, expect, test } from "bun:test";

import {
  canvasViewportTransform,
  normalizeCanvasViewport,
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

  test("uses one canonical fitted viewport and protects against invalid input", () => {
    expect(
      normalizeCanvasViewport({ zoom: 1.004, offsetX: 12, offsetY: -5 }),
    ).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 });
    expect(
      normalizeCanvasViewport({ zoom: Number.NaN, offsetX: Infinity, offsetY: 2 }),
    ).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 });
  });

  test("preserves subpixel motion in the CSS transform", () => {
    expect(
      canvasViewportTransform({ zoom: 1.333333, offsetX: 0.375, offsetY: -1.625 }),
    ).toBe("translate3d(0.375px, -1.625px, 0) scale(1.33333)");
  });
});
