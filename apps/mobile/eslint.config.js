import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import js from "@eslint/js";
import vue from "eslint-plugin-vue";

const browserGlobals = {
  AbortController: "readonly",
  clearTimeout: "readonly",
  document: "readonly",
  DOMException: "readonly",
  fetch: "readonly",
  localStorage: "readonly",
  navigator: "readonly",
  Response: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  window: "readonly",
  Window: "readonly",
};

const nodeGlobals = {
  __dirname: "readonly",
  console: "readonly",
  process: "readonly",
};

export default [
  {
    ignores: ["android/**", "coverage/**", "dist/**", "ios/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...vue.configs["flat/essential"],
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
      },
      parser: tsParser,
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      globals: browserGlobals,
      parserOptions: {
        parser: tsParser,
      },
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/no-deprecated-slot-attribute": "off",
    },
  },
  {
    files: ["vite.config.ts", "cypress.config.ts", "tests/unit/**/*.ts"],
    languageOptions: {
      globals: nodeGlobals,
    },
  },
  {
    files: ["tests/e2e/**/*.ts"],
    languageOptions: {
      globals: {
        cy: "readonly",
        describe: "readonly",
        it: "readonly",
      },
    },
  },
];
