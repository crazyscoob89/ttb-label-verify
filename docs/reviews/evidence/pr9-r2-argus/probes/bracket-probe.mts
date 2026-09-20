// OUT-OF-TREE probe. Read-only against the repo: imports the guard, never edits it.
// Goal: prove the bracketed-path fix ACCEPTS safe bracket paths but is NOT a no-op —
// genuinely unsafe bracket paths must still be REJECTED.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertPrivateLedger, assertPrivateLedgerCreation } from 'file:///C:/Users/alexm/Projects/ttb-label-verify/web/lib/ledger-security.ts';

const ROOT = 'C:\\Users\\alexm\\.hermes\\pr9-r2-verification\\probes\\scratch';

function ps(script: string, input: unknown) {
  const r = spawnSync(
    join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { input: JSON.stringify(input), encoding: 'utf8' });
  return r;
}

// Mirror of the fixture 'private' action: fresh DirectorySecurity, no SACL.
const MAKE_PRIVATE = String.raw`
$ErrorActionPreference='Stop'
try {
  $req = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $p = [string]$req.path
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
  [IO.DirectoryInfo]::new($p).SetAccessControl($acl)
  'OK'
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;

// Adds Everyone:ReadAndExecute (world-readable) and verifies the ACE landed.
const EXPOSE = String.raw`
$ErrorActionPreference='Stop'
try {
  $req = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $p = [string]$req.path
  $attr = [IO.File]::GetAttributes($p)
  $dir = [bool]($attr -band [IO.FileAttributes]::Directory)
  $item = if ($dir) { [IO.DirectoryInfo]::new($p) } else { [IO.FileInfo]::new($p) }
  $acl = $item.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
  $sid = [Security.Principal.SecurityIdentifier]::new('S-1-1-0')
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::ReadAndExecute,[Security.AccessControl.AccessControlType]::Allow))
  $item.SetAccessControl($acl)
  $obs = $item.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
  $found=$false
  foreach ($r in $obs.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if ($r.IdentityReference.Value -eq 'S-1-1-0') { $found=$true }
  }
  if (-not $found) { throw 'exposure NOT observed' }
  'EXPOSED-AND-VERIFIED'
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;

function accepts(fn: () => void) {
  try { fn(); return true; } catch { return false; }
}

const results: string[] = [];
function log(s: string) { console.log(s); results.push(s); }

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

// ---- Probe 1: safe bracketed directory must be ACCEPTED (the r1 false positive) ----
{
  const dir = join(ROOT, 'ledger [literal]');
  mkdirSync(dir);
  const mk = ps(MAKE_PRIVATE, { path: dir });
  log(`P1 setup private bracket dir: exit=${mk.status} ${mk.stderr.trim()}`);
  const dbPath = join(dir, 'spend[literal].sqlite');
  log(`P1 SAFE bracket dir, creation check -> ${accepts(() => assertPrivateLedgerCreation(dbPath)) ? 'ACCEPTED (expected)' : 'REJECTED (FALSE POSITIVE - BUG)'}`);
  writeFileSync(dbPath, '');
  log(`P1 SAFE bracket db file, open check -> ${accepts(() => assertPrivateLedger(dbPath)) ? 'ACCEPTED (expected)' : 'REJECTED (FALSE POSITIVE - BUG)'}`);
}

// ---- Probe 2: UNSAFE bracketed directory must still be REJECTED (no-op detector) ----
{
  const dir = join(ROOT, 'unsafe [brackets]');
  mkdirSync(dir);
  ps(MAKE_PRIVATE, { path: dir });
  const dbPath = join(dir, 'spend[x].sqlite');
  writeFileSync(dbPath, '');
  const clean = accepts(() => assertPrivateLedger(dbPath));
  log(`P2 positive control (clean bracket state) -> ${clean ? 'ACCEPTED (good baseline)' : 'REJECTED (baseline broken)'}`);
  const ex = ps(EXPOSE, { path: dir });
  log(`P2 expose bracket DIR to Everyone: exit=${ex.status} out=${ex.stdout.trim()} err=${ex.stderr.trim()}`);
  const after = accepts(() => assertPrivateLedger(dbPath));
  log(`P2 UNSAFE bracket dir (Everyone:RX) -> ${after ? 'ACCEPTED (*** NO-OP / SECURITY HOLE ***)' : 'REJECTED (expected)'}`);
}

// ---- Probe 3: UNSAFE bracketed FILE must still be REJECTED ----
{
  const dir = join(ROOT, 'file [case]');
  mkdirSync(dir);
  ps(MAKE_PRIVATE, { path: dir });
  const dbPath = join(dir, 'spend[y].sqlite');
  writeFileSync(dbPath, '');
  log(`P3 positive control -> ${accepts(() => assertPrivateLedger(dbPath)) ? 'ACCEPTED (good baseline)' : 'REJECTED (baseline broken)'}`);
  const ex = ps(EXPOSE, { path: dbPath });
  log(`P3 expose bracket FILE to Everyone: exit=${ex.status} out=${ex.stdout.trim()} err=${ex.stderr.trim()}`);
  log(`P3 UNSAFE bracket file (Everyone:RX) -> ${accepts(() => assertPrivateLedger(dbPath)) ? 'ACCEPTED (*** NO-OP / SECURITY HOLE ***)' : 'REJECTED (expected)'}`);
}

// ---- Probe 4: bracketed dir with DEFAULT inherited ACL must be REJECTED ----
{
  const dir = join(ROOT, 'default [inherit]');
  mkdirSync(dir);
  const dbPath = join(dir, 'spend[z].sqlite');
  writeFileSync(dbPath, '');
  log(`P4 default-inherited bracket dir (no hardening) -> ${accepts(() => assertPrivateLedger(dbPath)) ? 'ACCEPTED (*** SECURITY HOLE ***)' : 'REJECTED (expected)'}`);
}

// ---- Probe 5: non-bracket control, to isolate brackets as the only variable ----
{
  const dir = join(ROOT, 'plainascii');
  mkdirSync(dir);
  ps(MAKE_PRIVATE, { path: dir });
  const dbPath = join(dir, 'spend.sqlite');
  writeFileSync(dbPath, '');
  log(`P5 ASCII control, clean -> ${accepts(() => assertPrivateLedger(dbPath)) ? 'ACCEPTED (expected)' : 'REJECTED (unexpected)'}`);
  ps(EXPOSE, { path: dir });
  log(`P5 ASCII control, exposed -> ${accepts(() => assertPrivateLedger(dbPath)) ? 'ACCEPTED (*** HOLE ***)' : 'REJECTED (expected)'}`);
}

rmSync(ROOT, { recursive: true, force: true });
console.log('\n=== SUMMARY ===');
console.log(results.join('\n'));
