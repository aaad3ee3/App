import type { Knex } from "knex";
import { TRANSLATE_FROM, TRANSLATE_TO } from "../../lib/search";

/**
 * Catalog search.
 *
 * Customers do not know our category tree — they know they want "شحن بابجي" or "psn".
 * Searching raw stored names would miss most of that, because Arabic is written with
 * several interchangeable spellings of the same word ("ألعاب"/"العاب", "بطاقة"/"بطاقه")
 * and supplier names mix Arabic with Latin. So both sides of the comparison go through
 * one normalization function, defined here and mirrored in src/lib/search.ts.
 *
 * The function must be IMMUTABLE to be indexable; it is, since `translate` and `lower`
 * depend on nothing but their arguments (`lower` is collation-dependent in principle, but
 * the database's collation is fixed at creation, which is the same assumption every
 * expression index in Postgres makes).
 */
const NORMALIZE_FUNCTION = `
  CREATE OR REPLACE FUNCTION sayeh_search_normalize(txt text) RETURNS text AS $func$
    SELECT translate(lower(coalesce(txt, '')), '${TRANSLATE_FROM}', '${TRANSLATE_TO}')
  $func$ LANGUAGE sql IMMUTABLE PARALLEL SAFE
`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(NORMALIZE_FUNCTION);

  // Searching for a term anywhere inside a name means a leading wildcard, which no btree
  // index can serve — only trigrams can. pg_trgm is a trusted extension (so the app role
  // may create it, exactly as it already creates pgcrypto and citext), but it is a contrib
  // module that a minimal Postgres build can omit. Availability is checked rather than
  // assumed: a missing index costs a sequential scan over a few thousand rows, while a
  // failed migration costs the whole deployment.
  const available = await knex.raw<{ rows: unknown[] }>(
    `SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm'`
  );

  if (available.rows.length === 0) {
    console.warn("pg_trgm unavailable — catalog search will fall back to sequential scans");
    return;
  }

  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
  await knex.raw(
    `CREATE INDEX idx_products_name_search ON products
       USING gin (sayeh_search_normalize(name) gin_trgm_ops)`
  );
  await knex.raw(
    `CREATE INDEX idx_categories_name_search ON categories
       USING gin (sayeh_search_normalize(name) gin_trgm_ops)`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_products_name_search");
  await knex.raw("DROP INDEX IF EXISTS idx_categories_name_search");
  await knex.raw("DROP FUNCTION IF EXISTS sayeh_search_normalize(text)");
  // pg_trgm is deliberately left installed: it is shared database state, and dropping it
  // would break anything else that came to depend on it.
}
