import path from "node:path";
import dotenv from "dotenv";

// Must run before any test file imports src/config/env.ts (which does `import
// "dotenv/config"` and loads the default .env without overriding already-set vars) —
// vitest evaluates setupFiles before a test file's own imports, so this wins the race.
dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });
