export const MIN_CANVAS_ZOOM = 0.6;
export const MAX_CANVAS_ZOOM = 2.6;

export interface CanvasViewport {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Keeps the camera finite and snaps the fitted view to a single canonical
 * value. Keeping this pure also makes all input paths behave identically.
 */
export function normalizeCanvasViewport(
  viewport: CanvasViewport,
): CanvasViewport {
  const zoom = clamp(
    Number.isFinite(viewport.zoom) ? viewport.zoom : 1,
    MIN_CANVAS_ZOOM,
    MAX_CANVAS_ZOOM,
  );
  const normalizedZoom = Math.abs(zoom - 1) < 0.006 ? 1 : zoom;

  if (normalizedZoom === 1) {
    return { zoom: 1, offsetX: 0, offsetY: 0 };
  }

  return {
    zoom: normalizedZoom,
    offsetX: Number.isFinite(viewport.offsetX) ? viewport.offsetX : 0,
    offsetY: Number.isFinite(viewport.offsetY) ? viewport.offsetY : 0,
  };
}

/**
 * Zooms around a point expressed in viewport pixels from the stage centre.
 * The image point under the cursor/finger remains stationary on screen.
 */
export function zoomCanvasViewportAtPoint(
  viewport: CanvasViewport,
  requestedZoom: number,
  focalPoint: ViewportPoint,
): CanvasViewport {
  const current = normalizeCanvasViewport(viewport);
  const nextZoom = clamp(
    Number.isFinite(requestedZoom) ? requestedZoom : current.zoom,
    MIN_CANVAS_ZOOM,
    MAX_CANVAS_ZOOM,
  );

  if (Math.abs(nextZoom - current.zoom) < 0.000_001) {
    return current;
  }

  const scale = nextZoom / current.zoom;

  return normalizeCanvasViewport({
    zoom: nextZoom,
    offsetX: focalPoint.x - (focalPoint.x - current.offsetX) * scale,
    offsetY: focalPoint.y - (focalPoint.y - current.offsetY) * scale,
  });
}

export function translateCanvasViewport(
  viewport: CanvasViewport,
  delta: ViewportPoint,
): CanvasViewport {
  return normalizeCanvasViewport({
    ...viewport,
    offsetX: viewport.offsetX + delta.x,
    offsetY: viewport.offsetY + delta.y,
  });
}

export function canvasViewportTransform(viewport: CanvasViewport) {
  const normalized = normalizeCanvasViewport(viewport);

  // Subpixel translation is intentional. Whole-pixel rounding makes slow
  // finger and trackpad movement visibly stair-step on high-DPI displays.
  return `translate3d(${normalized.offsetX.toFixed(3)}px, ${normalized.offsetY.toFixed(3)}px, 0) scale(${normalized.zoom.toFixed(5)})`;
}
