import { describe, expect, test } from "bun:test";

import {
  getSourceImageKind,
  SOURCE_IMAGE_ACCEPT,
} from "@/lib/source-image";

describe("source image formats", () => {
  test("recognizes phone HEIC variants by MIME type or extension", () => {
    expect(getSourceImageKind({ name: "IMG_0042", type: "image/heic" })).toBe("heic");
    expect(
      getSourceImageKind({ name: "portrait.bin", type: "image/heif-sequence" }),
    ).toBe("heic");
    expect(getSourceImageKind({ name: "IMG_0042.HEIC", type: "" })).toBe("heic");
    expect(getSourceImageKind({ name: "camera.HIF", type: "application/octet-stream" })).toBe(
      "heic",
    );
  });

  test("accepts common browser-native still image formats and JPEG aliases", () => {
    for (const name of [
      "photo.jpg",
      "photo.jpeg",
      "photo.jfif",
      "photo.pjpeg",
      "photo.pjp",
      "photo.png",
      "photo.webp",
      "photo.avif",
      "photo.bmp",
    ]) {
      expect(getSourceImageKind({ name, type: "" }), name).toBe("native");
    }

    expect(getSourceImageKind({ name: "photo", type: "image/x-ms-bmp" })).toBe(
      "native",
    );
  });

  test("rejects formats that require unsafe or complex import semantics", () => {
    expect(getSourceImageKind({ name: "vector.svg", type: "image/svg+xml" })).toBeNull();
    expect(getSourceImageKind({ name: "raw.dng", type: "image/x-adobe-dng" })).toBeNull();
    expect(getSourceImageKind({ name: "scan.tiff", type: "image/tiff" })).toBeNull();
    expect(getSourceImageKind({ name: "animation.gif", type: "image/gif" })).toBeNull();
  });

  test("file picker advertises HEIC sequence and extension fallbacks", () => {
    expect(SOURCE_IMAGE_ACCEPT).toContain("image/heic-sequence");
    expect(SOURCE_IMAGE_ACCEPT).toContain("image/heif-sequence");
    expect(SOURCE_IMAGE_ACCEPT).toContain(".heic");
    expect(SOURCE_IMAGE_ACCEPT).toContain(".jfif");
  });
});
