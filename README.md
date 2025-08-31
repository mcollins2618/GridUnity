# backuptool

A TypeScript CLI tool for file backup using PostgreSQL. Implements snapshot, list, restore, and prune operations as described in the challenge README.

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```
2. Build the project:
   ```sh
   npm run build
   ```
3. Configure PostgreSQL connection in environment variables (see below).
4. Run the CLI:
   ```sh
   npm start -- <command> [options]
   ```

## PostgreSQL Configuration

Set the following environment variables:
- `PGHOST` (default: localhost)
- `PGPORT` (default: 5432)
- `PGUSER` (your db user)
- `PGPASSWORD` (your db password)
- `PGDATABASE` (your db name)

## Commands

- `snapshot --target-directory <dir>`: Take a snapshot of a directory
- `list`: List all snapshots
- `restore --snapshot-number <num> --output-directory <dir>`: Restore a snapshot
- `prune --snapshot <num>`: Prune a snapshot

## Testing

Run tests with:
```sh
npm test
```

## License
MIT
