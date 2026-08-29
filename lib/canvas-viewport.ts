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

export interface CanvasStageSize {
  width: number;
  height: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function normalizeWheelDeltaY(
  deltaY: number,
  deltaMode: number,
  pageSize: number,
): number {
  if (!Number.isFinite(deltaY)) return 0;

  const multiplier =
    deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(1, pageSize) : 1;

  // Pixel-mode trackpads retain their fine-grained movement. The cap only
  // tames large mouse/page deltas that would otherwise cross most of the zoom
  // range in one event.
  return clamp(deltaY * multiplier, -100, 100);
}

/**
 * Keeps the camera finite without introducing a zoom dead zone. Broad
 * snapping around 100% makes pinch gestures repeatedly discard their
 * translation and produces a visible shake near the fitted view.
 */
export function normalizeCanvasViewport(
  viewport: CanvasViewport,
): CanvasViewport {
  const zoom = clamp(
    Number.isFinite(viewport.zoom) ? viewport.zoom : 1,
    MIN_CANVAS_ZOOM,
    MAX_CANVAS_ZOOM,
  );
  const normalizedZoom = Math.abs(zoom - 1) < 0.000_001 ? 1 : zoom;

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

/**
 * Converts a screen-space drag into percentages of the untransformed canvas.
 * Rotation is inverted in CSS-pixel space before normalizing each axis; doing
 * this after converting to percentages is incorrect for non-square images.
 */
export function screenDeltaToCanvasPercentage(
  delta: ViewportPoint,
  stageSize: CanvasStageSize,
  viewportZoom: number,
  rotation: number,
  flipX: boolean,
  flipY: boolean,
): ViewportPoint {
  const zoom =
    Number.isFinite(viewportZoom) && viewportZoom > 0 ? viewportZoom : 1;
  const screenX = delta.x / zoom;
  const screenY = delta.y / zoom;
  const radians = (-rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  let canvasX = screenX * cosine - screenY * sine;
  let canvasY = screenX * sine + screenY * cosine;

  // CSS applies axis flips before rotation, so invert rotation first and then
  // reverse the flipped axes.
  if (flipX) canvasX = -canvasX;
  if (flipY) canvasY = -canvasY;

  return {
    x: (canvasX / Math.max(1, stageSize.width)) * 100,
    y: (canvasY / Math.max(1, stageSize.height)) * 100,
  };
}
