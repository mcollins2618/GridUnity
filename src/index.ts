
import { Command } from 'commander';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const program = new Command();

function getPgClient() {
  return new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || '',
  });
}

function getAllFiles(dir: string): string[] {
  // Recursively get all files in directory
  let results: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.resolve(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

async function snapshotDirectory(targetDir: string) {
  const client = getPgClient();
  await client.connect();
  const absTargetDir = path.resolve(targetDir);
  const files: { relPath: string; hash: string; content: Buffer }[] = [];
  for (const filePath of getAllFiles(absTargetDir)) {
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    // Store relative path from targetDir
    const relPath = path.relative(absTargetDir, filePath);
    files.push({ relPath, hash, content });
  }
  // Insert new snapshot
  const snapRes = await client.query('INSERT INTO snapshots DEFAULT VALUES RETURNING id, timestamp');
  const snapshotId = snapRes.rows[0].id;
  for (const file of files) {
    // Insert file if not exists
    let fileId: number;
    const fileRes = await client.query('SELECT id FROM files WHERE hash = $1', [file.hash]);
    if (fileRes.rows.length === 0) {
      const insertRes = await client.query('INSERT INTO files (hash, content) VALUES ($1, $2) RETURNING id', [file.hash, file.content]);
      fileId = insertRes.rows[0].id;
    } else {
      fileId = fileRes.rows[0].id;
    }
    // Link file to snapshot
    await client.query('INSERT INTO snapshot_files (snapshot_id, file_id, filename) VALUES ($1, $2, $3)', [snapshotId, fileId, file.relPath]);
  }
  await client.end();
  console.log(`Snapshot ${snapshotId} created.`);
}

async function listSnapshots() {
  const client = getPgClient();
  await client.connect();
  const res = await client.query('SELECT id, timestamp FROM snapshots ORDER BY id');
  console.log('SNAPSHOT  TIMESTAMP');
  for (const row of res.rows) {
    const ts = row.timestamp instanceof Date ? row.timestamp.toISOString().replace('T', ' ').substring(0, 19) : row.timestamp;
    console.log(`${row.id}         ${ts}`);
  }
  await client.end();
}

async function restoreSnapshot(snapshotNumber: number, outputDir: string) {
  const client = getPgClient();
  await client.connect();
  const res = await client.query(
    'SELECT f.filename, fi.content FROM snapshot_files f JOIN files fi ON f.file_id = fi.id WHERE f.snapshot_id = $1',
    [snapshotNumber]
  );
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  if (res.rows.length === 0) {
    console.log(`No files found for snapshot ${snapshotNumber}`);
  }
  for (const row of res.rows) {
    const outPath = path.join(outputDir, row.filename);
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, row.content);
    console.log(`Restored file: ${outPath}`);
  }
  await client.end();
  console.log(`Snapshot ${snapshotNumber} restored to ${outputDir}`);
}

async function pruneSnapshot(snapshotNumber: number) {
  const client = getPgClient();
  await client.connect();
  // Delete snapshot
  await client.query('DELETE FROM snapshots WHERE id = $1', [snapshotNumber]);
  // Delete unreferenced files
  await client.query(
    'DELETE FROM files WHERE id IN (SELECT fi.id FROM files fi LEFT JOIN snapshot_files sf ON fi.id = sf.file_id WHERE sf.file_id IS NULL)'
  );
  await client.end();
  console.log(`Snapshot ${snapshotNumber} pruned.`);
}

program
  .name('backuptool')
  .description('File backup CLI tool using PostgreSQL')
  .version('1.0.0');

program
  .command('snapshot')
  .description('Take a snapshot of a directory')
  .option('--target-directory <dir>', 'Directory to snapshot')
  .action(async (opts) => {
    if (!opts.targetDirectory) {
      console.error('Missing --target-directory');
      process.exit(1);
    }
    await snapshotDirectory(opts.targetDirectory);
  });

program
  .command('list')
  .description('List all snapshots')
  .action(async () => {
    await listSnapshots();
  });

program
  .command('restore')
  .description('Restore a snapshot to a directory')
  .option('--snapshot-number <num>', 'Snapshot number to restore')
  .option('--output-directory <dir>', 'Directory to restore to')
  .action(async (opts) => {
    if (!opts.snapshotNumber || !opts.outputDirectory) {
      console.error('Missing --snapshot-number or --output-directory');
      process.exit(1);
    }
    await restoreSnapshot(Number(opts.snapshotNumber), opts.outputDirectory);
  });

program
  .command('prune')
  .description('Prune old snapshots')
  .option('--snapshot <num>', 'Snapshot number to prune')
  .action(async (opts) => {
    if (!opts.snapshot) {
      console.error('Missing --snapshot');
      process.exit(1);
    }
    await pruneSnapshot(Number(opts.snapshot));
  });

program.parse(process.argv);
