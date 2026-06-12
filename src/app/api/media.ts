import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { api, ApiClientError } from "./client";

import type {
  CompleteMultipartBody,
  ListMediaParams,
  MediaDTO,
  MediaListResult,
  MediaUsage,
  MultipartInit,
  UploadedPart,
} from "@/shared/api-types";

export const MEDIA_PAGE_SIZE = 40;

export const mediaKeys = {
  all: ["media"] as const,
  lists: () => [...mediaKeys.all, "list"] as const,
  list: (params: Pick<ListMediaParams, "kind" | "search">) => [...mediaKeys.lists(), params] as const,
  detail: (id: string) => [...mediaKeys.all, "detail", id] as const,
  usage: (id: string) => [...mediaKeys.all, "usage", id] as const,
};

/** Infinite, newest-first media list with optional kind/search filters. */
export const mediaListInfiniteQueryOptions = (params: Pick<ListMediaParams, "kind" | "search">) =>
  infiniteQueryOptions({
    queryKey: mediaKeys.list(params),
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams();
      if (params.kind) qs.set("kind", params.kind);
      if (params.search) qs.set("search", params.search);
      qs.set("limit", String(MEDIA_PAGE_SIZE));
      qs.set("offset", String(pageParam));
      return api.get<MediaListResult>(`/api/admin/media?${qs.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.media.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

export const mediaItemQueryOptions = (id: string) =>
  queryOptions({
    queryKey: mediaKeys.detail(id),
    queryFn: async () => {
      const { media } = await api.get<{ media: MediaDTO }>(`/api/admin/media/${id}`);
      return media;
    },
    retry: false,
  });

export const mediaUsageQueryOptions = (id: string) =>
  queryOptions({
    queryKey: mediaKeys.usage(id),
    queryFn: () => api.get<MediaUsage>(`/api/admin/media/${id}/usage`),
  });

export async function updateMedia(id: string, body: { alt?: string | null }): Promise<MediaDTO> {
  const { media } = await api.patch<{ media: MediaDTO }>(`/api/admin/media/${id}`, body);
  return media;
}

export async function deleteMedia(id: string): Promise<void> {
  await api.delete(`/api/admin/media/${id}`);
}

// --- multipart (video) orchestration endpoints -------------------------------

export function initMultipart(body: { filename: string; mime: string; size: number }): Promise<MultipartInit> {
  return api.post<MultipartInit>("/api/admin/media/multipart", body);
}

export async function completeMultipart(mediaId: string, body: CompleteMultipartBody): Promise<MediaDTO> {
  const { media } = await api.post<{ media: MediaDTO }>(
    `/api/admin/media/multipart/${mediaId}/complete`,
    body,
  );
  return media;
}

export async function abortMultipart(mediaId: string, uploadId: string): Promise<void> {
  await api.delete(`/api/admin/media/multipart/${mediaId}?uploadId=${encodeURIComponent(uploadId)}`);
}

// --- raw byte uploads (XHR for upload progress + cancellation) ---------------

interface XhrOptions {
  headers?: Record<string, string>;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

function xhrSend<T>(method: string, url: string, body: Blob, opts: XhrOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = true;
    for (const [key, value] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(key, value);
    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total);
      };
    }
    xhr.onload = () => {
      const isJson = (xhr.getResponseHeader("content-type") ?? "").includes("application/json");
      const data: unknown = isJson && xhr.responseText ? JSON.parse(xhr.responseText) : xhr.responseText;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
      } else if (isJson && data && typeof data === "object" && "error" in data) {
        reject(new ApiClientError(xhr.status, data as { error: { code: never; message: string } }));
      } else {
        reject(
          new ApiClientError(xhr.status, {
            error: { code: "internal_error", message: `Upload failed (${xhr.status})` },
          }),
        );
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
        return;
      }
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}

export interface ImageMeta {
  alt?: string;
  width?: number;
  height?: number;
}

export async function uploadImage(
  file: File,
  meta: ImageMeta,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<MediaDTO> {
  const qs = new URLSearchParams();
  qs.set("filename", file.name);
  qs.set("mime", file.type);
  if (meta.alt) qs.set("alt", meta.alt);
  if (meta.width) qs.set("width", String(meta.width));
  if (meta.height) qs.set("height", String(meta.height));

  const { media } = await xhrSend<{ media: MediaDTO }>("POST", `/api/admin/media?${qs.toString()}`, file, {
    headers: { "content-type": file.type || "application/octet-stream" },
    onProgress: (loaded, total) => opts.onProgress?.(total ? loaded / total : 0),
    signal: opts.signal,
  });
  return media;
}

export function uploadPart(
  mediaId: string,
  uploadId: string,
  partNumber: number,
  blob: Blob,
  opts: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<UploadedPart> {
  const url = `/api/admin/media/multipart/${mediaId}/parts/${partNumber}?uploadId=${encodeURIComponent(uploadId)}`;
  return xhrSend<UploadedPart>("PUT", url, blob, {
    headers: { "content-type": "application/octet-stream" },
    onProgress: opts.onProgress,
    signal: opts.signal,
  });
}
