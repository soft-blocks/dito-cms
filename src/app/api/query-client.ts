import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { isApiError } from "./client";

function shouldRetry(failureCount: number, error: unknown): boolean {
  // Never retry deterministic 4xx; allow a couple retries for transient failures.
  if (isApiError(error) && error.status < 500) return false;
  return failureCount < 2;
}

/**
 * QueryClient wired to the plan's 401 rules:
 *  - 401 on a query → redirect to login (the view can't render without data).
 *  - 401 on a mutation → toast with a sign-in action; never redirect (don't nuke a
 *    half-filled form). Field-level errors are mapped to RHF inside each form.
 */
export function createQueryClient(onUnauthorized: () => void): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        if (isApiError(error) && error.status === 401) onUnauthorized();
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isApiError(error) && error.status === 401) {
          toast.error("Your session expired", {
            action: { label: "Sign in", onClick: onUnauthorized },
          });
        }
      },
    }),
  });
}
