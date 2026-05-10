import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  // Core web vitals apply to all files
  ...nextVitals,

  // TypeScript rules scoped to .ts and .tsx files only
  // JS/JSX files are exempt — no TS-specific errors on JSDoc-annotated JS
  {
    ...nextTs,
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
  },

  // Relax rules for JS/JSX files
  {
    files: ["**/*.js", "**/*.jsx"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
