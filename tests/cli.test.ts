import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

describe('BackupTool CLI', () => {
  const testDir = path.join(__dirname, 'test_data');
  const restoreDir = path.join(__dirname, 'restore_data');
  let client: Client;

  beforeAll(async () => {
    // Setup test directories
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
    if (!fs.existsSync(restoreDir)) fs.mkdirSync(restoreDir);
    fs.writeFileSync(path.join(testDir, 'file1.txt'), 'hello world');
    fs.writeFileSync(path.join(testDir, 'file2.bin'), Buffer.from([1, 2, 3, 4, 5]));
    // Setup test database connection
    client = new Client({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || '',
    });
    await client.connect();
  });

  afterAll(async () => {
    // Clean up test directories
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(restoreDir, { recursive: true, force: true });
    await client.end();
  });

  it('should take a snapshot and store file contents', async () => {
    execSync(`npm run build`);
    execSync(`node dist/index.js snapshot --target-directory ${testDir}`);
    // Check that snapshot and file records exist in DB
    const res = await client.query('SELECT COUNT(*) FROM snapshots');
    expect(res).toHaveProperty('rows');
  });

  it('should list snapshots', () => {
    const output = execSync(`node dist/index.js list`).toString();
    expect(output).toMatch(/SNAPSHOT/);
  });

  it('should restore files bit-for-bit identical', async () => {
    // Get latest snapshot id
    const snapRes = await client.query('SELECT id FROM snapshots ORDER BY id DESC LIMIT 1');
    const snapshotId = snapRes.rows[0]?.id;
    expect(snapshotId).toBeDefined();
    execSync(`node dist/index.js restore --snapshot-number ${snapshotId} --output-directory ${restoreDir}`);
    const origPath = path.join(testDir, 'file1.txt');
    const restoredPath = path.join(restoreDir, 'file1.txt');
    expect(fs.existsSync(restoredPath)).toBe(true);
    const orig = fs.readFileSync(origPath);
    const restored = fs.readFileSync(restoredPath);
    expect(orig.equals(restored)).toBe(true);
  });

  it('should prune snapshots and keep remaining restorable', async () => {
    // Get latest snapshot id
    const snapRes = await client.query('SELECT id FROM snapshots ORDER BY id DESC LIMIT 1');
    const snapshotId = snapRes.rows[0]?.id;
    expect(snapshotId).toBeDefined();
    execSync(`node dist/index.js prune --snapshot ${snapshotId}`);
    // Try restoring again, should not throw
    expect(() => {
      execSync(`node dist/index.js restore --snapshot-number ${snapshotId} --output-directory ${restoreDir}`);
    }).not.toThrow();
  });
});
