export type SourceImageKind = "native" | "heic";

const NATIVE_SOURCE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/pjpeg",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-ms-bmp",
]);

const HEIC_SOURCE_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const NATIVE_SOURCE_EXTENSION = /\.(?:png|jpe?g|jfif|pjpe?g|pjp|webp|avif|bmp)$/i;
const HEIC_SOURCE_EXTENSION = /\.(?:heic|heif|hif)$/i;

export const SOURCE_IMAGE_ACCEPT = [
  ...NATIVE_SOURCE_TYPES,
  ...HEIC_SOURCE_TYPES,
  ".jfif",
  ".pjpeg",
  ".pjp",
  ".heic",
  ".heif",
  ".hif",
  ".bmp",
].join(",");

export const SOURCE_IMAGE_FORMAT_NOTICE =
  "Use a PNG, JPG, JFIF, WEBP, AVIF, HEIC, HEIF, HIF, or BMP image.";

export function getSourceImageKind(
  file: Pick<File, "name" | "type">,
): SourceImageKind | null {
  const mimeType = file.type.toLowerCase().split(";", 1)[0].trim();

  if (HEIC_SOURCE_TYPES.has(mimeType) || HEIC_SOURCE_EXTENSION.test(file.name)) {
    return "heic";
  }

  if (NATIVE_SOURCE_TYPES.has(mimeType) || NATIVE_SOURCE_EXTENSION.test(file.name)) {
    return "native";
  }

  return null;
}

export async function convertHeicSourceToJpeg(file: File): Promise<Blob> {
  try {
    const { heicTo, isHeic } = await import("heic-to/csp");

    if (!(await isHeic(file))) {
      throw new Error("The file does not contain a supported HEIC or HEIF image.");
    }

    return await heicTo({
      blob: file,
      type: "image/jpeg",
      quality: 0.94,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The file does not")) {
      throw error;
    }

    throw new Error(
      "This HEIC or HEIF photo could not be converted. Try sharing it as JPEG from Photos.",
      { cause: error },
    );
  }
}
