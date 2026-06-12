import { queryOptions } from "@tanstack/react-query";

import { authClient } from "./auth-client";
import { unwrap } from "./client";

export interface ApiKeyRow {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  enabled: boolean | null;
  createdAt: string | Date;
  lastRequest: string | Date | null;
  expiresAt: string | Date | null;
}

export const apiKeysKeys = {
  all: ["api-keys"] as const,
};

export const apiKeysQueryOptions = queryOptions({
  queryKey: apiKeysKeys.all,
  queryFn: async (): Promise<ApiKeyRow[]> => {
    const data = unwrap(await authClient.apiKey.list());
    // The list endpoint returns { apiKeys, total }; tolerate a bare array too.
    if (Array.isArray(data)) return data as ApiKeyRow[];
    return ((data as { apiKeys?: ApiKeyRow[] }).apiKeys ?? []) as ApiKeyRow[];
  },
});
