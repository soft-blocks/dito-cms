import { queryOptions } from "@tanstack/react-query";

import { authClient } from "./auth-client";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
}

export interface SessionData {
  user: SessionUser;
}

export const sessionKeys = {
  all: ["session"] as const,
};

/** Current session (or null when signed out). Used by router guards and the shell. */
export const sessionQueryOptions = queryOptions({
  queryKey: sessionKeys.all,
  queryFn: async (): Promise<SessionData | null> => {
    const { data } = await authClient.getSession();
    return (data as SessionData | null) ?? null;
  },
  staleTime: 30_000,
});
