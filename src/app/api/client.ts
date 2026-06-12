import type { ApiErrorBody, ApiErrorCode } from "@/shared/api-types";

/** Thrown by the API client when a request returns a non-2xx envelope. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = body.error.code;
    this.fieldErrors = body.error.fieldErrors;
  }
}

export function isApiError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError;
}

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    default:
      return "internal_error";
  }
}

interface BetterAuthResult<T> {
  data: T | null;
  error: { status?: number; message?: string; code?: string } | null;
}

/** Normalize a Better Auth client `{data,error}` result; throw ApiClientError on error. */
export function unwrap<T>(result: BetterAuthResult<T>): T {
  if (result.error) {
    const status = result.error.status ?? 500;
    throw new ApiClientError(status, {
      error: { code: codeForStatus(status), message: result.error.message ?? "Request failed" },
    });
  }
  return result.data as T;
}

async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, {
    method,
    credentials: "include",
    ...init,
    headers,
    body: payload ?? init?.body,
  });

  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json") ?? false;
  const data: unknown = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const envelope: ApiErrorBody = isJson
      ? (data as ApiErrorBody)
      : { error: { code: "internal_error", message: typeof data === "string" ? data : "Request failed" } };
    throw new ApiClientError(res.status, envelope);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>("GET", path, undefined, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>("POST", path, body, init),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>("PATCH", path, body, init),
  put: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>("PUT", path, body, init),
  delete: <T>(path: string, init?: RequestInit) => request<T>("DELETE", path, undefined, init),
};
