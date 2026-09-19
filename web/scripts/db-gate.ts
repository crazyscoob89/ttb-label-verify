import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateDbGateConfig } from './db-gate-config';

/** Fail-closed ACTUAL-DB acceptance scaffold. Never applies migrations, starts a
 * DB, loads .env, runs mocks, substitutes unit tests, or accepts narrowed targets.
 * Even a catalog PASS is NOT concurrency/durability acceptance. The final blocker
 * stays until the required actual-DB behavioral suite is implemented and reviewed.
 */
try {
  if (process.argv.length !== 2) throw new Error('DB gate blocked: arguments/narrowed suites are forbidden');
  const target = validateDbGateConfig(process.env);
  const result = spawnSync('psql', ['--no-psqlrc', '--no-password', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--file', fileURLToPath(new URL('../tests/db/catalog.sql', import.meta.url))], {
    // No inherited PGOPTIONS/PGSERVICE/default DB/password file/owner URL.
    env: { NODE_ENV: 'test', PATH: process.env.PATH, LANG: 'C', PGHOST: target.host, PGPORT: target.port,
      PGDATABASE: target.database, PGUSER: target.username, PGPASSWORD: target.password,
      PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable',
      PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000' },
    encoding: 'utf8', timeout: 15_000, maxBuffer: 64 * 1024,
  });
  if (result.error || result.status !== 0 || result.stdout.trim() !== 'TTB_DB_CATALOG_ONLY_PASS') throw new Error('DB gate blocked: actual catalog preflight failed (details withheld)');
  throw new Error('DB gate blocked: actual catalog only; concurrency/RLS behavior/durability suite UNIMPLEMENTED and UNRUN');
} catch (error) {
  // Only our fixed messages, never driver output, URLs or credentials.
  const message = error instanceof Error && error.message.startsWith('DB gate blocked:') ? error.message : 'DB gate blocked: unavailable';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
