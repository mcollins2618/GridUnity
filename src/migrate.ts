import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

async function runMigrations() {
  const client = new Client({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
  await client.connect();

  const migrationsDir = path.join(__dirname, '../migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Ensure order: 001, 002, etc.

  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    try {
      await client.query(sql);
      console.log(`Migration ${file} applied.`);
    } catch (err) {
      console.error(`Migration ${file} failed:`, err);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('All migrations completed.');
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
