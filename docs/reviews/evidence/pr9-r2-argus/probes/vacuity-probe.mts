// OUT-OF-TREE vacuity probe.
// Question: do the two previously-erroring negative tests actually EXERCISE their
// rejection path unelevated, and would they still CATCH an unsafe permission state?
// Method: replicate the exact fixture 'expose' helper and the test's assertion
// sequence, as a NON-ADMIN user, and report each stage separately so a setup
// failure can never be mistaken for a security PASS.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertPrivateLedger } from 'file:///C:/Users/alexm/Projects/ttb-label-verify/web/lib/ledger-security.ts';
import { SqliteSpendStore } from 'file:///C:/Users/alexm/Projects/ttb-label-verify/web/lib/sqlite-spend.ts';

const ROOT = 'C:\\Users\\alexm\\.hermes\\pr9-r2-verification\\probes\\vac';
const PS = join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const run = (script: string, input: unknown) => spawnSync(PS,
  ['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand', Buffer.from(script,'utf16le').toString('base64')],
  { input: JSON.stringify(input), encoding: 'utf8' });

const MAKE_PRIVATE = String.raw`
$ErrorActionPreference='Stop'
try {
  $p=[string]($(([Console]::In.ReadToEnd()|ConvertFrom-Json)).path)
  $acl=[Security.AccessControl.DirectorySecurity]::new()
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
  [IO.DirectoryInfo]::new($p).SetAccessControl($acl)
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;

// EXACT logic of the repo fixture 'expose' branch at 106aac2.
const EXPOSE = String.raw`
$ErrorActionPreference='Stop'
try {
  $req=[Console]::In.ReadToEnd()|ConvertFrom-Json
  $attributes=[IO.File]::GetAttributes([string]$req.path)
  if ($attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Fixture reparse denied' }
  $directory=[bool]($attributes -band [IO.FileAttributes]::Directory)
  $item = if ($directory) { [IO.DirectoryInfo]::new([string]$req.path) } else { [IO.FileInfo]::new([string]$req.path) }
  $acl=$item.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
  $sid=[Security.Principal.SecurityIdentifier]::new('S-1-1-0')
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::ReadAndExecute,[Security.AccessControl.AccessControlType]::Allow))
  $item.SetAccessControl($acl)
  $observed=$item.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
  $rules=$observed.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
  $found=$false
  foreach ($rule in $rules) {
    if ($rule.IdentityReference.Value -eq 'S-1-1-0' -and $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadAndExecute) -eq [Security.AccessControl.FileSystemRights]::ReadAndExecute) -and -not ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)) { $found=$true }
  }
  if (-not $found) { throw 'Fixture exposure not observed' }
  'EXPOSE_OK'
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;

// Dumps the Everyone ACE state so we can PROVE the unsafe state really exists.
const DUMP = String.raw`
$ErrorActionPreference='Stop'
try {
  $p=[string]($(([Console]::In.ReadToEnd()|ConvertFrom-Json)).path)
  $attr=[IO.File]::GetAttributes($p); $dir=[bool]($attr -band [IO.FileAttributes]::Directory)
  $item = if ($dir) { [IO.DirectoryInfo]::new($p) } else { [IO.FileInfo]::new($p) }
  $acl=$item.GetAccessControl([Security.AccessControl.AccessControlSections]'Access, Owner')
  $out=@()
  foreach ($r in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) { $out += ($r.IdentityReference.Value + '=' + $r.FileSystemRights + '/' + $r.AccessControlType) }
  ($out -join ' | ')
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;

const log: string[] = [];
const say = (s: string) => { console.log(s); log.push(s); };
const accepts = (fn: () => void) => { try { fn(); return true; } catch { return false; } };

say(`running as admin: ${run(String.raw`([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`, {}).stdout.trim()}`);

for (const target of ['parent', '', '-wal'] as const) {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
  const dir = join(ROOT, 'led');
  mkdirSync(dir);
  run(MAKE_PRIVATE, { path: dir });
  const dbPath = join(dir, 'spend.sqlite');
  SqliteSpendStore.provision(dbPath);
  if (target === '-wal') writeFileSync(dbPath + '-wal', '');

  const label = target === 'parent' ? 'PARENT DIR' : target === '' ? 'DB FILE' : 'WAL SIDECAR';
  // STAGE 1 — positive control (the test's new `not.toThrow`)
  const clean = accepts(() => assertPrivateLedger(dbPath));
  say(`[${label}] stage1 positive control (clean state accepted) : ${clean ? 'PASS' : 'FAIL'}`);

  // STAGE 2 — the fixture mutation, unelevated. This is what errored in r1.
  const victim = target === 'parent' ? dir : dbPath + target;
  const ex = run(EXPOSE, { path: victim });
  const exposeOk = ex.status === 0 && ex.stdout.includes('EXPOSE_OK');
  say(`[${label}] stage2 unelevated expose exit=${ex.status} : ${exposeOk ? 'PASS (no SeSecurityPrivilege needed)' : 'FAIL -> ' + ex.stderr.trim()}`);

  // STAGE 3 — independently PROVE the unsafe permission really exists on disk.
  const dump = run(DUMP, { path: victim }).stdout.trim();
  const reallyUnsafe = dump.includes('S-1-1-0');
  say(`[${label}] stage3 unsafe state verified on disk (Everyone ACE present) : ${reallyUnsafe ? 'PASS' : 'FAIL'}`);
  say(`[${label}]        acl = ${dump}`);

  // STAGE 4 — only NOW does rejection count as security evidence.
  const rejected = !accepts(() => { const s = new SqliteSpendStore(dbPath); s.close(); });
  say(`[${label}] stage4 guard REJECTS the proven-unsafe state : ${rejected ? 'PASS' : '*** FAIL — SECURITY HOLE ***'}`);
  say(`[${label}] VERDICT: ${clean && exposeOk && reallyUnsafe && rejected ? 'NON-VACUOUS, genuinely exercised' : 'VACUOUS / BROKEN'}`);
  say('');
}

rmSync(ROOT, { recursive: true, force: true });
console.log('=== VACUITY SUMMARY ===\n' + log.join('\n'));
console.log(`FAILURES: ${log.filter(l => l.includes('FAIL')).length}`);
