// Isomorphic slug + identifier helpers. No React, no Hono, no worker imports.

/** Collection slug: kebab-case, starts with a letter. Used in delivery URLs. */
export const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Field name (API key): camelCase-ish, starts with a letter, [A-Za-z0-9_]. */
export const FIELD_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Reserved collection slugs. Blocked because they collide with worker routes or
 * would be confusing as a content type. Delivery serves collections at
 * `/api/v1/content/<slug>`, so the conflict set is small, but we keep it generous.
 */
export const RESERVED_SLUGS = new Set([
  "api",
  "auth",
  "admin",
  "media",
  "mcp",
  "v1",
  "content",
  "collections",
  "entries",
  "setup",
  "health",
  "settings",
  "login",
  "logout",
  "assets",
  "public",
  "static",
]);

/** Turn arbitrary text into a kebab-case slug guaranteed to match SLUG_PATTERN (or ""). */
export function slugify(input: string): string {
  const kebab = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  // A leading digit is invalid; drop until the first letter.
  return kebab.replace(/^[^a-z]+/, "");
}

/** Turn arbitrary text (e.g. a field label) into a camelCase identifier (or ""). */
export function camelize(input: string): string {
  const words = input
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  const camel = words
    .map((word, i) =>
      i === 0
        ? word[0].toLowerCase() + word.slice(1)
        : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("");
  // Strip any leading character that isn't a letter (identifiers must start with one).
  return camel.replace(/^[^a-zA-Z]+/, "");
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function isValidFieldName(name: string): boolean {
  return FIELD_NAME_PATTERN.test(name);
}

/** Returns a human-readable reason a slug is invalid, or null if it's acceptable. */
export function slugError(slug: string): string | null {
  if (!slug) return "Slug is required";
  if (!isValidSlug(slug)) return "Use lowercase letters, numbers and hyphens, starting with a letter";
  if (isReservedSlug(slug)) return `"${slug}" is reserved`;
  return null;
}

/** Returns a human-readable reason a field name is invalid, or null if it's acceptable. */
export function fieldNameError(name: string): string | null {
  if (!name) return "Field name is required";
  if (!isValidFieldName(name)) return "Use letters, numbers and underscores, starting with a letter";
  return null;
}
