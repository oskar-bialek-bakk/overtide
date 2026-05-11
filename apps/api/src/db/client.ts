import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

export type Db = BunSQLiteDatabase<typeof schema>;

export function createDb(path: string): Db {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") sqlite.exec("PRAGMA journal_mode = WAL;");
  const db = drizzle(sqlite, { schema });
  // Auto-migrate on every boot — idempotent for drizzle's migration journal,
  // and required for `:memory:` databases used in tests / Playwright.
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
