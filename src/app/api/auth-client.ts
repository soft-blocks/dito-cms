import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { apiKeyClient } from "@better-auth/api-key/client";

/**
 * Better Auth browser client. baseURL defaults to the current origin and basePath to
 * /api/auth, so paths never appear in our code. adminClient covers user management;
 * apiKeyClient covers key create/list/delete.
 */
export const authClient = createAuthClient({
  plugins: [adminClient(), apiKeyClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
