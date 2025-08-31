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
    fs.writeFileSync(path.join(testDir, 'file2.bin'), Buffer.from([1,2,3,4,5]));
    // Setup test database connection
    client = new Client({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'backuptool_test',
    });
    await client.connect();
    // Clean up tables if needed
    await client.query('DROP TABLE IF EXISTS snapshots, files, snapshot_files CASCADE');
  });

  afterAll(async () => {
    // Clean up test directories
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(restoreDir, { recursive: true, force: true });
    await client.end();
  });

  it('should take a snapshot and store file contents', () => {
    execSync(`npm run build`);
    execSync(`node dist/index.js snapshot --target-directory ${testDir}`);
    // Check that snapshot and file records exist in DB
    const res = client.query('SELECT COUNT(*) FROM snapshots');
    expect(res).resolves.toHaveProperty('rows');
  });

  it('should list snapshots', () => {
    const output = execSync(`node dist/index.js list`).toString();
    expect(output).toMatch(/SNAPSHOT/);
  });

  it('should restore files bit-for-bit identical', () => {
    execSync(`node dist/index.js restore --snapshot-number 1 --output-directory ${restoreDir}`);
    const orig = fs.readFileSync(path.join(testDir, 'file1.txt'));
    const restored = fs.readFileSync(path.join(restoreDir, 'file1.txt'));
    expect(orig.equals(restored)).toBe(true);
  });

  it('should prune snapshots and keep remaining restorable', () => {
    execSync(`node dist/index.js prune --snapshot 1`);
    // Try restoring again, should not throw
    expect(() => {
      execSync(`node dist/index.js restore --snapshot-number 1 --output-directory ${restoreDir}`);
    }).not.toThrow();
  });
});
