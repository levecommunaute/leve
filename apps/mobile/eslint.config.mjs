import { config as reactConfig } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...reactConfig,
  {
    files: ["*.config.js", "babel.config.js", "metro.config.js", "tailwind.config.js"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
