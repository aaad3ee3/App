// Minimal flat config (ESLint 9) — TypeScript syntax via the parser only, no type-aware
// rules for now (keeps phase-1 lint fast; revisit with `typescript-eslint` recommended
// configs once the module surface stabilizes).
const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: "module" },
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
