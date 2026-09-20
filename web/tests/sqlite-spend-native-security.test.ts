import { expect, test } from 'vitest';
import { chmodSync, existsSync, linkSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SqliteSpendStore } from '../lib/sqlite-spend';
import { assertPrivateLedger, assertPrivateLedgerCreation } from '../lib/ledger-security';
import { fixtureAcl, privateLedgerDir } from './fixtures/private-ledger';

// NO OS/ACL mocks and NO Windows skips. On Windows these run real PowerShell
// inspection and fixture-only ACL mutations; on POSIX they exercise real modes.
function expose(path: string, directory = false) {
  if (process.platform === 'win32') fixtureAcl(path, 'expose');
  else chmodSync(path, directory ? 0o755 : 0o644);
}

test('native security: exposed parent refuses provisioning before any ledger is created', () => {
  const dir = privateLedgerDir(), path = join(dir, 'spend.sqlite');
  try {
    // A broken inspector must fail this positive control, not earn a negative PASS.
    expect(() => assertPrivateLedgerCreation(path)).not.toThrow();
    expose(dir, true); expect(() => SqliteSpendStore.provision(path)).toThrow(/security/);
    for (const suffix of ['', '-wal', '-shm', '-journal']) expect(existsSync(path + suffix)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60_000);

test.each(['parent', '', '-wal', '-shm', '-journal'])('native security: exposed %s denies existing ledger', part => {
  const dir = privateLedgerDir(), path = join(dir, 'spend.sqlite');
  try {
    SqliteSpendStore.provision(path);
    if (part !== 'parent' && part) writeFileSync(path + part, '', { mode: 0o600 });
    // Verify the exact clean state before the deliberate ACL/mode mutation.
    expect(() => assertPrivateLedger(path)).not.toThrow();
    expose(part === 'parent' ? dir : path + part, part === 'parent');
    expect(() => { const store = new SqliteSpendStore(path); store.close(); }).toThrow(/security/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60_000);

test('native security: real WAL and SHM retain private permissions', async () => {
  const dir = privateLedgerDir(), path = join(dir, 'spend.sqlite'); let store: SqliteSpendStore | undefined;
  try {
    SqliteSpendStore.provision(path); store = new SqliteSpendStore(path); store.acquireWork('sidecar-proof');
    expect(existsSync(path + '-wal')).toBe(true); expect(existsSync(path + '-shm')).toBe(true);
    expect(() => assertPrivateLedger(path)).not.toThrow();
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
}, 60_000);

test('native security: directory junction/symlink in parent path is rejected', () => {
  const dir = privateLedgerDir(), target = join(dir, 'target'), alias = join(dir, 'alias');
  try {
    mkdirSync(target, { mode: 0o700 });
    symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => SqliteSpendStore.provision(join(alias, 'spend.sqlite'))).toThrow(/security/);
    expect(existsSync(join(target, 'spend.sqlite'))).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60_000);

test('native security: hardlinked ledger is rejected', () => {
  const dir = privateLedgerDir(), path = join(dir, 'spend.sqlite');
  try {
    SqliteSpendStore.provision(path); linkSync(path, join(dir, 'alias.sqlite'));
    expect(() => new SqliteSpendStore(path)).toThrow(/security/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60_000);

test('native security: actual provisioning CLI accepts private Unicode/spaced directory and refuses reuse', () => {
  const dir = privateLedgerDir(), nested = join(dir, "ledger space ü ' [literal]");
  try {
    mkdirSync(nested, { mode: 0o700 });
    if (process.platform === 'win32') fixtureAcl(nested, 'private');
    const run = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/provision-demo.ts', nested], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 30_000,
    });
    const first = run(); expect(first.status, `CLI startup: ${first.error?.message ?? ''}\n${first.stderr}`).toBe(0);
    const store = new SqliteSpendStore(join(nested, 'spend.sqlite')); store.close();
    const again = run(); expect(again.status, again.stderr).toBe(1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60_000);



test('native security: renamed bracket paths preserve acceptance and reject real exposure', () => {
  const dir = privateLedgerDir(), plain = join(dir, 'plain'), bracket = join(dir, 'ledger [literal]');
  try {
    mkdirSync(plain, { mode: 0o700 });
    if (process.platform === 'win32') fixtureAcl(plain, 'private');
    expect(() => assertPrivateLedgerCreation(join(plain, 'spend.sqlite'))).not.toThrow();
    // Rename preserves the same descriptor: brackets alone must not deny it.
    renameSync(plain, bracket);
    const path = join(bracket, 'spend[literal].sqlite');
    SqliteSpendStore.provision(path);
    const store = new SqliteSpendStore(path);
    try {
      store.acquireWork('literal-path');
      expect(existsSync(path + '-wal')).toBe(true);
      expect(existsSync(path + '-shm')).toBe(true);
      expect(() => assertPrivateLedger(path)).not.toThrow();
    } finally { store.close(); }
    expose(path);
    expect(() => new SqliteSpendStore(path)).toThrow(/security/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60_000);
