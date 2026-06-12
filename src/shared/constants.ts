// Isomorphic constants shared by the worker and the SPA.

export const APP_NAME = "Dito CMS";
export const APP_VERSION = "0.1.0";

/** Project homepage / docs. Update this if you fork or rename the project. */
export const REPO_URL = "https://github.com/Luis0Antonio/dito-cms";

/** R2 multipart part size. All parts except the last must equal this (≥5 MiB R2 rule). */
export const PART_SIZE = 10 * 1024 * 1024; // 10 MiB

/** Direct (non-multipart) image upload cap. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB

/** Hard ceiling for a single multipart video upload. */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/** Rich-text serialized size cap (D1 row stays well under 2 MB). */
export const MAX_RICH_TEXT_BYTES = 256 * 1024;

/** Delivery list pagination ceiling. */
export const MAX_DELIVERY_LIMIT = 100;

/** D1 binds at most 100 params; chunk IN() queries below that. */
export const D1_IN_CHUNK = 90;

export const IMAGE_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
] as const;

export const VIDEO_MIME_ALLOWLIST = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;
