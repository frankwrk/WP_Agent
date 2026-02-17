import fs from "node:fs";
import path from "node:path";
import { getConfig, validateProductionBootConfig } from "../src/config";
import { buildPool } from "../src/db/pool";

function readMigrationFiles(migrationsDir: string): Array<{ name: string; sql: string }> {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  return files.map((name) => ({
    name,
    sql: fs.readFileSync(path.join(migrationsDir, name), "utf8"),
  }));
}

async function main(): Promise<void> {
  const config = getConfig();
  validateProductionBootConfig(config);
  const pool = buildPool(config);

  const migrationsDir = path.resolve(__dirname, "../src/db/migrations");
  const migrations = readMigrationFiles(migrationsDir);

  if (migrations.length === 0) {
    console.log(`[db:migrate] No migration files found in ${migrationsDir}`);
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    console.log(`[db:migrate] Applying ${migrations.length} migration(s)`);
    for (const migration of migrations) {
      console.log(`[db:migrate] -> ${migration.name}`);
      await client.query(migration.sql);
    }
    console.log("[db:migrate] Migration complete");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db:migrate] Migration failed: ${message}`);
  process.exit(1);
});
