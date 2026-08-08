import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  { ignores: ["eslint.config.mjs", "esbuild.config.mjs", "main.js"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      "import/no-nodejs-modules": "off", // Required for native grex orchestrator execution (child_process)
      "@typescript-eslint/no-require-imports": "off",
      "no-undef": "off", // Required for require() and Buffer
      "obsidianmd/no-static-styles-assignment": "off", // Required for dynamic React/Vue micro-frontend mounting
      "@typescript-eslint/no-unsafe-assignment": "off", // Required for generic plugin state casting
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "no-restricted-globals": "off", // Required for native fetch to local orchestrator
      "obsidianmd/rule-custom-message": "off", // Required for native console debugging
      "obsidianmd/no-tfile-tfolder-cast": "off",
      "obsidianmd/no-unsupported-api": "off",
      "obsidianmd/ui/sentence-case": "off", // Ignoring strict casing for Sovereign titles
      "obsidianmd/prefer-window-timers": "off",
      "no-empty": "off"
    }
  },
];
