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

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
      colorSpace: "srgb",
    });

    if (!context) {
      throw new Error("Unable to create preview rendering context");
    }

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
