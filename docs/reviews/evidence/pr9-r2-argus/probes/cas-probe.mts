// OUT-OF-TREE CAS / ceiling / dedup probe on native Windows at 106aac2.
// Read-only against the repo: imports the store, creates its own private ledger.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { SqliteSpendStore, DEMO_CEILING, DEMO_RESERVATION } from 'file:///C:/Users/alexm/Projects/ttb-label-verify/web/lib/sqlite-spend.ts';

const ROOT = 'C:\\Users\\alexm\\.hermes\\pr9-r2-verification\\probes\\casdir';

const MAKE_PRIVATE = String.raw`
$ErrorActionPreference='Stop'
try {
  $p = [string]($(([Console]::In.ReadToEnd() | ConvertFrom-Json)).path)
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
  [IO.DirectoryInfo]::new($p).SetAccessControl($acl)
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
spawnSync(join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand', Buffer.from(MAKE_PRIVATE,'utf16le').toString('base64')],
  { input: JSON.stringify({ path: ROOT }), encoding: 'utf8' });

const dbPath = join(ROOT, 'spend.sqlite');
SqliteSpendStore.provision(dbPath);
const store = new SqliteSpendStore(dbPath);

const out: string[] = [];
const log = (s: string) => { console.log(s); out.push(s); };
const sha = () => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const bind = () => ({
  reservationId: randomUUID(), attemptId: randomUUID(), requestId: randomUUID(),
  imageSha256: sha(), schemaVersion: 1 as const,
  rulesVersion: 'prototype-seven-fields-v1' as const,
  promptVersion: 'image-observations-v1' as const,
  model: 'anthropic/claude-haiku-4.5' as const,
  maxCostMicrousd: DEMO_RESERVATION,
});
const tried = async (label: string, fn: () => Promise<unknown>, expect: 'ok' | 'reject') => {
  let ok = true; let msg = '';
  try { await fn(); } catch (e) { ok = false; msg = (e as Error).message; }
  const verdict = ok ? 'ACCEPTED' : `REJECTED(${msg})`;
  const good = (expect === 'ok') === ok;
  log(`${good ? 'PASS' : '*** FAIL ***'} ${label} -> ${verdict}`);
  return ok;
};

log(`ceiling=${DEMO_CEILING} reservation=${DEMO_RESERVATION}`);

// 1. replay of same reservationId must be rejected (permanent dedup)
const b1 = bind();
await tried('reserve #1 fresh', () => store.reserve(b1), 'ok');
await tried('reserve replay same reservationId+attemptId', () => store.reserve(b1), 'reject');

// 2. replay attemptId under a NEW reservationId must be rejected
const b2 = { ...bind(), attemptId: b1.attemptId };
await tried('reserve replayed attemptId w/ new reservationId', () => store.reserve(b2), 'reject');

// 3. single-winner claim CAS
const claimA = randomUUID(), claimB = randomUUID();
await tried('claim #1 (first winner)', () => store.claim(b1, claimA), 'ok');
await tried('claim #1 again with different claimId (replay)', () => store.claim(b1, claimB), 'reject');

// 4. complete with wrong claimId must be rejected
await tried('complete with WRONG claimId', () => store.complete(b1, claimB), 'reject');
await tried('complete with correct claimId', () => store.complete(b1, claimA), 'ok');
await tried('complete replay after unresolved', () => store.complete(b1, claimA), 'reject');

// 5. ceiling enforcement: fill to the cap, then prove it stops
let accepted = 1; // b1 already counted
for (let i = 0; i < 60; i++) {
  const b = bind();
  try { await store.reserve(b); accepted++; } catch { /* exhausted */ }
}
const totals = store.totals();
log(`ceiling test: reservations accepted=${accepted}, incurred=${totals.incurredMicrousd}, unresolved=${totals.unresolvedMicrousd}, ceiling=${totals.ceilingMicrousd}`);
const total = totals.incurredMicrousd + totals.unresolvedMicrousd;
log(`${total <= DEMO_CEILING ? 'PASS' : '*** FAIL ***'} total ${total} <= ceiling ${DEMO_CEILING}`);
log(`${accepted === DEMO_CEILING / DEMO_RESERVATION ? 'PASS' : '*** FAIL ***'} accepted count ${accepted} === ceiling/reservation ${DEMO_CEILING / DEMO_RESERVATION}`);

// 6. burst at ceiling: nothing more may be admitted
const burst = await Promise.allSettled(Array.from({ length: 30 }, () => store.reserve(bind())));
const admitted = burst.filter(r => r.status === 'fulfilled').length;
log(`${admitted === 0 ? 'PASS' : '*** FAIL ***'} concurrent burst of 30 at ceiling admitted=${admitted} (expect 0)`);
const after = store.totals();
log(`${after.incurredMicrousd + after.unresolvedMicrousd <= DEMO_CEILING ? 'PASS' : '*** FAIL ***'} post-burst total ${after.incurredMicrousd + after.unresolvedMicrousd} <= ${DEMO_CEILING}`);

store.close();
rmSync(ROOT, { recursive: true, force: true });
console.log('\n=== CAS SUMMARY ===\n' + out.join('\n'));
const failed = out.filter(l => l.includes('FAIL')).length;
console.log(`\nFAILURES: ${failed}`);
