import path from "node:path";
import type { Knex } from "knex";
import { env } from "../config/env";

const knexConfig: Knex.Config = {
  client: "pg",
  connection: env.DATABASE_URL,
  migrations: {
    directory: path.join(__dirname, "migrations"),
    extension: "ts",
  },
  seeds: {
    directory: path.join(__dirname, "seeds"),
    extension: "ts",
  },
  pool: { min: 2, max: 10 },
};

export default knexConfig;
