import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function runMigrations() {
  const client = new Client({
    host: 'localhost',
    port: parseInt('5432'),
    user: 'postgres',
    password: 'password1',
    database: 'backuptool_test',
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
