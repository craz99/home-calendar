import js from "@eslint/js";
import globals from "globals";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    // Ignore specific directories and files from the linting process.
    ignores: ["client/", ".history/", "ecosystem.config.cjs"],
  },
  // The recommended config from ESLint, which replaces `extends`.
  js.configs.recommended,  
  // A separate object to define global variables for your JS files.
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: { globals: { ...globals.node } },
  },
  // Add a new configuration block specifically for test files
  {
    files: ["**/*.test.js"],
    languageOptions: {
      // Add Jest's global variables
      globals: globals.jest,
    },
  },
];
