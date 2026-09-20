import { expect, test } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { SqliteSpendStore } from '../lib/sqlite-spend';
import { privateLedgerDir } from './fixtures/private-ledger';
import type { SpendBinding } from '../lib/spend';
const binding = (): SpendBinding => ({ reservationId: randomUUID(), attemptId: randomUUID(), requestId: randomUUID(), imageSha256: 'a'.repeat(64), schemaVersion: 1, rulesVersion: 'prototype-seven-fields-v1', promptVersion: 'image-observations-v1', model: 'anthropic/claude-haiku-4.5', maxCostMicrousd: 1000000 });

// Unmocked native SQLite/OS gate on EVERY platform. Unexpected startup/SQL/ACL
// failures reject with bounded diagnostics, never masquerade as a losing CAS.
function run(path: string, action: string, expectedRejection = '') {
  return new Promise<number>((resolve, reject) => {
    const code = `import {SqliteSpendStore} from './lib/sqlite-spend.ts';
      const s=new SqliteSpendStore(${JSON.stringify(path)});
      try {await s.${action};process.exitCode=0;}
      catch(error){console.error(error);if(${JSON.stringify(expectedRejection)} && new RegExp(${JSON.stringify(expectedRejection)}).test(error.message))process.exitCode=2;else process.exitCode=1;}
      finally{s.close();}`;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-8192); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-8192); });
    const timer = setTimeout(() => child.kill(), 30_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (exit, signal) => {
      clearTimeout(timer);
      if (exit === 0 || exit === 2) resolve(exit);
      else reject(Error(`Ledger child exit=${exit} signal=${signal}\nstdout: ${stdout}\nstderr: ${stderr}`));
    });
  });
}

test('child startup failures include diagnostics, not swallowed CAS exit codes', async () => {
  const dir = privateLedgerDir();
  try { await expect(run(join(dir, 'missing.sqlite'), 'totals()')).rejects.toThrow(/Ledger child exit=1[\s\S]*Private ledger security/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}, 60_000);

test('independent processes share atomic identity and claims; persisted cap mismatch rejects', async () => {
  const dir = privateLedgerDir(), path = join(dir, 'spend.sqlite');
  try {
    SqliteSpendStore.provision(path); const bind = binding();
    const reserve = `reserve(${JSON.stringify(bind)})`, claim = () => `claim(${JSON.stringify(bind)},${JSON.stringify(randomUUID())})`;
    expect((await Promise.all([run(path, reserve, 'UNIQUE constraint failed: holds'), run(path, reserve, 'UNIQUE constraint failed: holds')])).sort()).toEqual([0, 2]);
    expect((await Promise.all([run(path, claim(), 'Claim denied'), run(path, claim(), 'Claim denied')])).sort()).toEqual([0, 2]);
    const restarted = new SqliteSpendStore(path);
    expect(restarted.totals().unresolvedMicrousd).toBe(1000000); restarted.close();
    const db = new DatabaseSync(path); db.exec('UPDATE ledger SET ceiling=50000000'); db.close();
    expect(() => new SqliteSpendStore(path)).toThrow();
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60_000);

test('atomic dedup, single winner claim, retained holds, restart and hard cap', async () => {
  const dir = privateLedgerDir(), path = join(dir, 'spend.sqlite');
  const stores: SqliteSpendStore[] = [];
  try {
    expect(() => new SqliteSpendStore(path)).toThrow(); SqliteSpendStore.provision(path);
    const a = new SqliteSpendStore(path), b = new SqliteSpendStore(path); stores.push(a, b);
    const bind = binding();
    expect((await Promise.allSettled([a.reserve(bind), b.reserve(bind)])).filter(x => x.status === 'fulfilled')).toHaveLength(1);
    await expect(a.reserve({ ...binding(), attemptId: bind.attemptId })).rejects.toThrow();
    const claim = randomUUID();
    expect((await Promise.allSettled([a.claim(bind, claim), b.claim(bind, randomUUID())])).filter(x => x.status === 'fulfilled')).toHaveLength(1);
    await a.complete(bind, claim); expect(a.totals().unresolvedMicrousd).toBe(1000000);
    for (const store of stores.splice(0)) store.close();
    const c = new SqliteSpendStore(path); stores.push(c);
    for (let i = 1; i < 25; i++) await c.reserve(binding());
    await expect(c.reserve(binding())).rejects.toThrow('Exhausted');
    expect(c.totals()).toEqual({ currency: 'USD', ceilingMicrousd: 25000000, incurredMicrousd: 0, unresolvedMicrousd: 25000000 });
    for (const store of stores.splice(0)) store.close();
    expect(await run(path, `reserve(${JSON.stringify(binding())})`, 'Exhausted')).toBe(2);
    expect(() => SqliteSpendStore.provision(path)).toThrow();
  } finally { for (const store of stores) store.close(); rmSync(dir, { recursive: true, force: true }); }
}, 60_000);

test('work and claim concurrency remain bounded and crash holds persist on restart', async () => {
  const dir = privateLedgerDir(), path = join(dir, 'spend.sqlite'); let store: SqliteSpendStore | undefined;
  try {
    SqliteSpendStore.provision(path); store = new SqliteSpendStore(path);
    store.acquireWork('one'); store.acquireWork('two'); expect(() => store!.acquireWork('three')).toThrow('Busy');
    const first = binding(), second = binding(), third = binding();
    for (const bind of [first, second, third]) await store.reserve(bind);
    const claim = randomUUID(); await store.claim(first, claim); await store.claim(second, randomUUID());
    await expect(store.claim(third, randomUUID())).rejects.toThrow('Busy');
    store.close(); store = new SqliteSpendStore(path);
    expect(() => store!.acquireWork('after-crash')).toThrow('Busy');
    await expect(store.claim(third, randomUUID())).rejects.toThrow('Busy');
    store.releaseWork('one'); store.acquireWork('replacement');
    await store.complete(first, claim); await store.claim(third, randomUUID());
    expect(store.totals().unresolvedMicrousd).toBe(3000000);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
}, 60_000);
