import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  const client = new Client({
    host: 'localhost',
    port: parseInt('5432'),
    user: 'postgres',
    password: 'password1',
    database: 'backuptool_test',
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
