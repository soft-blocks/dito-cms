// Browser-side WebP re-encoding: decode an image to a canvas and export it as
// WebP at a caller-chosen quality, entirely client-side before the upload to R2.

/**
 * Raster formats we can decode and re-encode to WebP. Excludes `image/gif`
 * (canvas captures a single frame, silently dropping animation) and
 * `image/svg+xml` (vector — rasterizing it loses scalability and has no
 * meaningful "quality"). Re-encoding `image/webp` is allowed so an existing
 * WebP can be recompressed at a lower quality.
 */
const WEBP_SOURCE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/** Whether `encodeToWebp` can handle this file (a re-encodable raster image). */
export function canEncodeToWebp(file: File): boolean {
  return WEBP_SOURCE_MIME.has(file.type);
}

/** Swap a filename's extension, e.g. `photo.PNG` -> `photo.webp`. */
function replaceExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Decode `file` to something drawable. Prefers `createImageBitmap` (fast,
 * honoring EXIF orientation) and falls back to an <img> element when the
 * browser can't bitmap-decode the format.
 */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall through to the <img> path below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = url;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/webp", Math.min(1, Math.max(0, quality)));
  });
}

/**
 * Re-encode an image file as WebP at the given quality (0..1), preserving its
 * pixel dimensions. Returns a new `File` with a `.webp` name and `image/webp`
 * type. Rejects if the image can't be decoded or the browser can't produce
 * WebP, so callers can fall back to the original.
 */
export async function encodeToWebp(file: File, quality: number): Promise<File> {
  const decoded = await decode(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(decoded.source, 0, 0);

    const blob = await canvasToWebp(canvas, quality);
    if (!blob) throw new Error("WebP encoding is not supported in this browser");

    return new File([blob], replaceExtension(file.name, "webp"), {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } finally {
    decoded.release();
  }
}
