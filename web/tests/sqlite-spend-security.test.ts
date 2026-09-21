import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { chmodSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { privateLedgerDir } from './fixtures/private-ledger';
import { join } from 'node:path';
vi.setConfig({ testTimeout: 60_000 }); // Includes native Windows fixture preparation.

// Contract tests only: the Windows OS inspection is mocked, not native ACL proof.
const os = vi.hoisted(() => ({ platform: process.platform as string }));
const inspect = vi.hoisted(() => vi.fn());
vi.mock('node:os', async importOriginal => ({ ...await importOriginal<typeof import('node:os')>(), platform: () => os.platform }));
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(), execFileSync: inspect }));
import { SqliteSpendStore } from '../lib/sqlite-spend';
import { createDemoHandler } from '../lib/demo-route';
const nativeExec = (await vi.importActual<typeof import('node:child_process')>('node:child_process')).execFileSync;
beforeEach(() => { inspect.mockImplementation(nativeExec); if (process.platform !== 'win32') vi.stubEnv('SystemRoot', '/mock-windows'); });
const dirs: string[] = [];
const current = 'S-1-5-21-100-200-300-1001';
const ace = (sid = current, flags = 0) => ({ sid, flags, mask: 2032127, type: 0, callback: false });
function fixture() {
  const dir = privateLedgerDir(); dirs.push(dir);
  return { dir, path: join(dir, 'spend.sqlite') };
}
function snapshot(dir: string, path: string) {
  return { current, entries: [
    { path: dir, directory: true, reparse: false, owner: current, protected: true, canonical: true, daclPresent: true, aces: [ace(current, 3)] },
    { path, directory: false, reparse: false, owner: current, protected: false, canonical: true, daclPresent: true, aces: [ace(current, 16)] },
  ] };
}
afterEach(() => { os.platform = process.platform; inspect.mockReset(); vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) { chmodSync(dir, 0o700); rmSync(dir, { recursive: true, force: true }); } });

test('Windows ACL contract accepts current-user private ACL despite Windows-style 0666 modes', () => {
  const { dir, path } = fixture(); SqliteSpendStore.provision(path); chmodSync(path, 0o666);
  os.platform = 'win32'; inspect.mockReturnValue(JSON.stringify(snapshot(dir, path)));
  const store = new SqliteSpendStore(path); store.close(); expect(inspect).toHaveBeenCalled();
});

test.each(['foreign-owner', 'everyone', 'authenticated-users', 'unknown-sid', 'null-dacl', 'empty-dacl', 'reparse', 'unprotected-parent', 'no-child-inheritance', 'inherit-only', 'no-propagate', 'callback', 'object-ace', 'deny-ace', 'noncanonical', 'missing-parent', 'missing-ledger', 'extra-entry', 'no-current-grant', 'read-only-current', 'malformed', 'inspection-error'])('Windows ACL contract fails closed: %s', fault => {
  const { dir, path } = fixture(); SqliteSpendStore.provision(path);
  const data = snapshot(dir, path); const parent = data.entries[0], file = data.entries[1];
  switch (fault) {
    case 'foreign-owner': file.owner = 'S-1-5-18'; break;
    case 'everyone': file.aces.push(ace('S-1-1-0')); break;
    case 'authenticated-users': parent.aces.push(ace('S-1-5-11', 3)); break;
    case 'unknown-sid': file.aces.push(ace('S-1-5-21-999')); break;
    case 'null-dacl': file.daclPresent = false; break;
    case 'empty-dacl': file.aces = []; break;
    case 'reparse': parent.reparse = true; break;
    case 'unprotected-parent': parent.protected = false; break;
    case 'no-child-inheritance': parent.aces[0].flags = 0; break;
    case 'inherit-only': parent.aces[0].flags = 11; break;
    case 'no-propagate': parent.aces[0].flags = 7; break;
    case 'callback': file.aces[0].callback = true; break;
    case 'object-ace': file.aces[0].type = 5; break;
    case 'deny-ace': file.aces[0].type = 1; break;
    case 'noncanonical': file.canonical = false; break;
    case 'missing-parent': data.entries.shift(); break;
    case 'missing-ledger': data.entries.pop(); break;
    case 'extra-entry': data.entries.push({ ...file, path: `${path}-other` }); break;
    case 'no-current-grant': file.aces = [ace('S-1-5-18')]; break;
    case 'read-only-current': file.aces[0].mask = 1; break;
  }
  os.platform = 'win32';
  if (fault === 'inspection-error') inspect.mockImplementation(() => { throw Error('ACL inspection failed'); });
  else inspect.mockReturnValue(fault === 'malformed' ? '{}' : JSON.stringify(data));
  expect(() => { const store = new SqliteSpendStore(path); store.close(); }).toThrow(/private|security/i);
});

test('Windows ACL contract explicitly allows SYSTEM and built-in Administrators alongside current user', () => {
  const { dir, path } = fixture(); SqliteSpendStore.provision(path); const data = snapshot(dir, path);
  for (const entry of data.entries) entry.aces.push(ace('S-1-5-18'), ace('S-1-5-32-544'));
  os.platform = 'win32'; inspect.mockReturnValue(JSON.stringify(data));
  const store = new SqliteSpendStore(path); store.close(); expect(inspect).toHaveBeenCalled();
});

test('Windows ACL contract: route delegates ledger privacy to the same OS-aware guard', async () => {
  const { dir, path } = fixture(); SqliteSpendStore.provision(path); chmodSync(dir, 0o755);
  os.platform = 'win32'; const data = snapshot(dir, path); inspect.mockReturnValue(JSON.stringify(data));
  const code = 'synthetic-only-security-contract-code-0000';
  const transport = vi.fn();
  const handler = createDemoHandler({ env: { TTB_DEMO_ENABLED: 'true', TTB_DEMO_ACCESS_SECRET: code, TTB_DEMO_ORIGIN: 'https://demo.example', TTB_DEMO_DATA_DIR: dir, TTB_DEMO_PERSISTENT_VOLUME: 'single-private-volume-v1', OPENROUTER_API_KEY: 'synthetic-only' }, transport });
  const request = () => new Request('https://demo.example/api/comparisons', { method: 'POST', headers: { origin: 'https://demo.example', 'x-ttb-demo-code': code, 'content-type': 'text/plain' } });
  // Reaches content-type validation only after the real store security gate.
  expect((await handler(request())).status).toBe(415);
  data.entries[0].aces.push(ace('S-1-1-0', 3)); inspect.mockReturnValue(JSON.stringify(data));
  expect((await handler(request())).status).toBe(503); expect(transport).not.toHaveBeenCalled();
});

test('Windows provisioning ACL inspection failure creates no ledger or sidecars', () => {
  const { path } = fixture(); os.platform = 'win32'; inspect.mockImplementation(() => { throw Error('No PowerShell'); });
  expect(() => SqliteSpendStore.provision(path)).toThrow(); expect(existsSync(path)).toBe(false);
  for (const suffix of ['-wal', '-shm', '-journal']) expect(existsSync(path + suffix)).toBe(false);
});

test.runIf(process.platform !== 'win32')('native POSIX: provisioning refuses a public parent before creating ledger', () => {
  const { dir, path } = fixture(); chmodSync(dir, 0o755);
  expect(() => SqliteSpendStore.provision(path)).toThrow(); expect(existsSync(path)).toBe(false);
});

test.runIf(process.platform !== 'win32').each(['', '-wal', '-shm', '-journal'])('native POSIX: opening rejects exposed ledger/sidecar %s', suffix => {
  const { path } = fixture(); SqliteSpendStore.provision(path);
  if (suffix) writeFileSync(path + suffix, '', { mode: 0o600 }); chmodSync(path + suffix, 0o644);
  expect(() => { const store = new SqliteSpendStore(path); store.close(); }).toThrow(/private|security/i);
});

test('provisioning refuses stale sidecars without creating a new ledger', () => {
  const { path } = fixture(); writeFileSync(path + '-wal', '', { mode: 0o600 });
  expect(() => SqliteSpendStore.provision(path)).toThrow(); expect(existsSync(path)).toBe(false);
});
