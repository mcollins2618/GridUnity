import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || '',
  });
  await client.connect();

  const migrationPath = path.join(__dirname, '../migrations/001_init.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await client.query(sql);
  await client.end();
  console.log('Migration completed.');
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
