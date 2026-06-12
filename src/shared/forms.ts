import { z } from "zod";

import { SLUG_PATTERN, RESERVED_SLUGS } from "./slug";

// Isomorphic form schemas (RHF on the client; reusable server-side). Keep password
// rules in sync with auth.ts (minPasswordLength: 8).

const email = z.string().trim().min(1, "Email is required").email("Enter a valid email");
const password = z.string().min(8, "Must be at least 8 characters");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const setupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email,
  password,
});
export type SetupInput = z.infer<typeof setupSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: password,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Too long"),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// --- Collections (Phase 2) ---------------------------------------------------

const collectionSlug = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(64, "Too long")
  .regex(SLUG_PATTERN, "Lowercase letters, numbers and hyphens, starting with a letter")
  .refine((s) => !RESERVED_SLUGS.has(s), { message: "This slug is reserved" });

const collectionName = z.string().trim().min(1, "Name is required").max(80, "Too long");
const collectionDescription = z.string().trim().max(280, "Too long").optional();

export const createCollectionSchema = z.object({
  name: collectionName,
  slug: collectionSlug,
  type: z.enum(["collection", "singleton"]),
  description: collectionDescription,
});
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

/** Edit-details dialog: everything mutable on a collection (slug/type are not). */
export const editCollectionSchema = z.object({
  name: collectionName,
  description: collectionDescription,
  titleField: z.string().nullable().optional(),
});
export type EditCollectionInput = z.infer<typeof editCollectionSchema>;
