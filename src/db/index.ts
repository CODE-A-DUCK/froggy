import { Kysely, PostgresDialect, sql } from "kysely";
import pkg from "pg";

const { Pool } = pkg;
import { config } from "../config.js";

import { Database } from "./schema.js";

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: config.databaseUrl,
    max: 10,
  })
});

export const db = new Kysely<Database>({
  dialect,
});

export async function initDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS music_library (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(1000) NOT NULL,
        url VARCHAR(2000) NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `.execute(db);
    console.log("[DB] music_library table initialized successfully.");
  } catch (err) {
    console.error("[DB] Error initializing database:", err);
  }
}
