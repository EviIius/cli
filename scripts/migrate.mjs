import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://relay:relay@localhost:5432/relay";
const client = new pg.Client({ connectionString });

await client.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationDirectory = resolve("infra/postgres/migrations");
  const migrationNames = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const migrations = [
    { name: "000_initial.sql", path: resolve("infra/postgres/init.sql") },
    ...migrationNames.map((name) => ({
      name,
      path: resolve(migrationDirectory, name),
    })),
  ];

  for (const migration of migrations) {
    const sql = await readFile(migration.path, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = await client.query(
      "SELECT checksum FROM schema_migrations WHERE name=$1",
      [migration.name],
    );

    if (previous.rows[0]) {
      if (previous.rows[0].checksum !== checksum) {
        throw new Error(`Applied migration ${migration.name} was modified`);
      }
      console.log(`unchanged ${migration.name}`);
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [migration.name, checksum],
      );
      await client.query("COMMIT");
      console.log(`applied   ${migration.name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
