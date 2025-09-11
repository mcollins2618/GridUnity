
import { Command } from 'commander';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const program = new Command();

function getPgClient() {
  return new Client({
    host: 'localhost',
    port: parseInt('5432'),
    user: 'postgres',
    password: 'password1',
    database: 'backuptool_test',
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
  const files: { relPath: string; hash: string; content: Buffer; size: number }[] = [];
  let totalSize = 0;
  let distinctSize = 0;
  const seenHashes = new Set<string>();

  for (const filePath of getAllFiles(absTargetDir)) {
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const relPath = path.relative(absTargetDir, filePath);
    const size = content.length;
    files.push({ relPath, hash, content, size });
    totalSize += size;
    if (!seenHashes.has(hash)) {
      distinctSize += size;
      seenHashes.add(hash);
    }
  }

  // Insert new snapshot with size and distinct_size
  const snapRes = await client.query(
    'INSERT INTO snapshots (size, distinct_size) VALUES ($1, $2) RETURNING id, timestamp',
    [totalSize, distinctSize]
  );
  const snapshotId = snapRes.rows[0].id;

  for (const file of files) {
    let fileId: number;
    const fileRes = await client.query('SELECT id FROM files WHERE hash = $1', [file.hash]);
    if (fileRes.rows.length === 0) {
      const insertRes = await client.query('INSERT INTO files (hash, content) VALUES ($1, $2) RETURNING id', [file.hash, file.content]);
      fileId = insertRes.rows[0].id;
    } else {
      fileId = fileRes.rows[0].id;
    }
    await client.query('INSERT INTO snapshot_files (snapshot_id, file_id, filename) VALUES ($1, $2, $3)', [snapshotId, fileId, file.relPath]);
  }
  await client.end();
  console.log(`Snapshot ${snapshotId} created. Size: ${totalSize} bytes, Distinct size: ${distinctSize} bytes`);
}

async function listSnapshots() {
  const client = getPgClient();
  await client.connect();
  const res = await client.query('SELECT id, timestamp, size, distinct_size FROM snapshots ORDER BY id');
  console.log('SNAPSHOT  TIMESTAMP           SIZE  DISTINCT_SIZE');
  let totalSize = 0;
  for (const row of res.rows) {
    const ts = row.timestamp instanceof Date ? row.timestamp.toISOString().replace('T', ' ').substring(0, 19) : row.timestamp;
    console.log(`${row.id}         ${ts}  ${row.size ?? 0}   ${row.distinct_size ?? 0}`);
    totalSize += row.distinct_size ?? 0;
  }
  if (res.rows.length > 0) {
    console.log(`total                          ${totalSize}`);
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

async function checkDatabaseIntegrity() {
  const client = getPgClient();
  await client.connect();
  const res = await client.query('SELECT id, hash, content FROM files');
  let corruptedCount = 0;
  for (const row of res.rows) {
    const actualHash = crypto.createHash('sha256').update(row.content).digest('hex');
    if (actualHash !== row.hash) {
      console.log(`Corrupted file detected: id=${row.id}, expected hash=${row.hash}, actual hash=${actualHash}`);
      corruptedCount++;
    }
  }
  if (corruptedCount === 0) {
    console.log('No corrupted files detected.');
  } else {
    console.log(`Total corrupted files: ${corruptedCount}`);
  }
  await client.end();
}

async function corruptFirstFile() {
  const client = getPgClient();
  await client.connect();

  // Get the first file
  const res = await client.query('SELECT id FROM files LIMIT 1');
  if (res.rows.length === 0) {
    console.log('No files found to corrupt.');
    await client.end();
    return;
  }
  const fileId = res.rows[0].id;

  // Overwrite the content with random bytes
  const corruptedContent = Buffer.from('corrupted data');
  await client.query('UPDATE files SET content = $1 WHERE id = $2', [corruptedContent, fileId]);
  console.log(`File with id=${fileId} has been corrupted.`);

  await client.end();
}

// Add the new command to the CLI
program
  .command('corrupt')
  .description('Manually corrupt the content of the first file in the database for testing')
  .action(async () => {
    await corruptFirstFile();
  });

program
  .command('check')
  .description('Scan the database for any corrupted file content')
  .action(async () => {
    await checkDatabaseIntegrity();
  });

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
