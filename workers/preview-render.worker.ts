import type { RasterProjectState } from "@/lib/exportImage";
import type { ProjectState } from "@/components/editor/types";
import {
  drawCoverImage,
  drawCroppedImage,
  renderProjectRaster,
} from "@/lib/exportImage";

interface PreviewInitRequest {
  type: "init";
  source: ImageBitmap;
}

interface PreviewRenderRequest {
  type: "render";
  revision: number;
  quality: "fast" | "full";
  width: number;
  height: number;
  state: RasterProjectState;
  crop: ProjectState["crop"] | null;
}

type PreviewWorkerRequest = PreviewInitRequest | PreviewRenderRequest;

interface PreviewWorkerScope {
  onmessage: ((event: MessageEvent<PreviewWorkerRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}

const workerScope = globalThis as unknown as PreviewWorkerScope;
let source: ImageBitmap | null = null;
let renderCanvas: OffscreenCanvas | null = null;
let renderContext: OffscreenCanvasRenderingContext2D | null = null;

function getRenderSurface(width: number, height: number) {
  if (!renderCanvas) {
    renderCanvas = new OffscreenCanvas(width, height);
    renderContext = renderCanvas.getContext("2d", {
      willReadFrequently: true,
      colorSpace: "srgb",
    });

    if (!renderContext) {
      renderCanvas = null;
      throw new Error("Unable to create preview rendering context");
    }
  } else if (renderCanvas.width !== width || renderCanvas.height !== height) {
    // Resizing clears the backing store while retaining the context. Reusing
    // the surface avoids allocating a full preview canvas for every slider
    // update and substantially reduces garbage-collection pressure.
    renderCanvas.width = width;
    renderCanvas.height = height;
  }

  return { canvas: renderCanvas, context: renderContext! };
}

workerScope.onmessage = (event) => {
  if (event.data.type === "init") {
    source?.close();
    source = event.data.source;
    workerScope.postMessage({ type: "ready" });
    return;
  }

  const { revision, quality, width, height, state, crop } = event.data;

  try {
    if (!source) {
      throw new Error("Preview source is not ready");
    }

    const { canvas, context } = getRenderSurface(width, height);

    renderProjectRaster({
      ctx: context,
      state,
      source,
      width,
      height,
      sourceVariantKey: crop
        ? JSON.stringify(crop.perspective)
        : "full-source",
      drawSource: crop
        ? (renderContext, renderSource, renderWidth, renderHeight) =>
            drawCroppedImage(
              renderContext,
              renderSource,
              crop,
              renderWidth,
              renderHeight,
              false,
            )
        : drawCoverImage,
    });

    const bitmap = canvas.transferToImageBitmap();
    workerScope.postMessage(
      {
        type: "rendered",
        revision,
        quality,
        width,
        height,
        bitmap,
      },
      [bitmap],
    );
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Preview render failed",
    });
  }
};

export {};
