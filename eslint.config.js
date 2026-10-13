import js from "@eslint/js";
import globals from "globals";

const extensionGlobals = { chrome: "readonly" };

export default [
  { ignores: ["node_modules/**", "dist/**", "assets/**", "docs/**", ".impeccable/**"] },
  js.configs.recommended,
  {
    // Shipped ES modules (service worker, popup, options, shared libraries).
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker, ...extensionGlobals }
    },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }]
    }
  },
  {
    // Content scripts are classic scripts injected into web pages.
    files: ["contentShared.js", "contentScript.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, ...extensionGlobals }
    }
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "test_fixtures/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser, ...extensionGlobals }
    }
  }
];
