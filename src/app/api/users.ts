import { queryOptions } from "@tanstack/react-query";

import { authClient } from "./auth-client";
import { unwrap } from "./client";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  createdAt: string | Date;
}

export const usersKeys = {
  all: ["users"] as const,
};

export const usersQueryOptions = queryOptions({
  queryKey: usersKeys.all,
  queryFn: async (): Promise<AdminUser[]> => {
    const data = unwrap(
      await authClient.admin.listUsers({ query: { limit: 200, sortBy: "createdAt", sortDirection: "asc" } }),
    );
    return (data.users ?? []) as AdminUser[];
  },
});
