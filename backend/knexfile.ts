// Thin re-export so `knex --knexfile knexfile.ts <cmd>` works from the project root.
// The actual config lives in src/db/knex-config.ts (inside tsconfig's rootDir) so
// src/db/knex.ts can import it without crossing rootDir, which `tsc` rejects.
export { default } from "./src/db/knex-config";
