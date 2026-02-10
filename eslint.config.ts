import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import ts from "typescript-eslint";
import svelteConfig from "./svelte.config.js";

export default ts.config(
  // Ignore build artifacts and dependencies
  {
    ignores: ["build/", ".svelte-kit/", "node_modules/", "src-tauri/", "e2e/"],
  },

  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs["flat/recommended"],

  // TypeScript handles undefined checks — disable no-undef for TS files
  {
    files: ["**/*.ts", "**/*.svelte"],
    rules: {
      "no-undef": "off",
    },
  },

  // Svelte files: use TypeScript parser
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        svelteConfig,
      },
    },
    rules: {
      "svelte/require-each-key": "warn",
    },
  },

  // Node.js scripts and config files: add node globals
  {
    files: ["scripts/**", "*.config.*", "svelte.config.js", "vite.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Unused imports: auto-remove on --fix
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
);
