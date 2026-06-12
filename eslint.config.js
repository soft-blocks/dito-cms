import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

/** ESLint flat config — Bun + TypeScript + React + Hono + Drizzle (Dito CMS). */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "migrations/**",
      "worker-configuration.d.ts",
      "src/worker/db/auth-schema.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { import: importPlugin, "unused-imports": unusedImports },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
      "import/order": [
        "error",
        {
          groups: [["builtin", "external"], ["internal"], ["parent", "sibling", "index"]],
          "newlines-between": "always",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "debug"] }],
    },
  },
  // Import boundary: the isomorphic shared module and the browser app must never
  // import worker-only code (keeps the SPA bundle free of server internals).
  {
    files: ["src/app/**/*.{ts,tsx}", "src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/worker/*", "**/worker/**"], message: "app/shared must not import from worker." },
          ],
        },
      ],
    },
  },
  // The shared module is also forbidden from importing the browser app.
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/worker/*", "**/worker/**", "@/app/*", "**/app/**"], message: "shared must stay isomorphic." },
            { group: ["react", "react-dom", "hono", "hono/*"], message: "shared must stay isomorphic." },
          ],
        },
      ],
    },
  },
);
