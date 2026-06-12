import { queryOptions } from "@tanstack/react-query";

import { api } from "./client";

import type { SetupStatus } from "@/shared/api-types";


export const setupStatusQueryOptions = queryOptions({
  queryKey: ["setup-status"],
  queryFn: () => api.get<SetupStatus>("/api/setup/status"),
  // Flips from false→true exactly once (first admin created); no need to refetch often.
  staleTime: 60_000,
});
