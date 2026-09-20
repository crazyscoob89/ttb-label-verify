import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

// Test-only ACL writes, restricted to directories allocated by this helper in
// this process. Never imported by application/provisioning code.
const fixtures = new Set<string>();
export function fixtureAcl(path: string, action: 'private' | 'expose') {
  if (![...fixtures].some(dir => { const rel = relative(dir, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')); })) throw Error('Not a disposable ledger fixture');
  if (process.platform !== 'win32') throw Error('Windows fixture ACL only');
  const script = String.raw`
$ErrorActionPreference = 'Stop'
try {
  [Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $item = Get-Item -LiteralPath $request.path -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Fixture reparse denied' }
  if ($request.action -eq 'private') {
    if (-not $item.PSIsContainer) { throw 'Fixture directory required' }
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::FullControl, [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit', [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
  } elseif ($request.action -eq 'expose') {
    $acl = Get-Acl -LiteralPath $request.path
    $sid = [Security.Principal.SecurityIdentifier]::new('S-1-1-0')
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::ReadAndExecute, [Security.AccessControl.AccessControlType]::Allow))
  } else { throw 'Unknown fixture action' }
  Set-Acl -LiteralPath $request.path -AclObject $acl
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
`;
  const result = spawnSync(join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { input: JSON.stringify({ path, action }), encoding: 'utf8', timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw Error(`Disposable fixture ACL failed: ${result.error?.message ?? result.stderr}`);
}
export function privateLedgerDir() {
  const dir = mkdtempSync(join(tmpdir(), 'ttb-ledger-fixture-')); fixtures.add(dir);
  try { if (process.platform === 'win32') fixtureAcl(dir, 'private'); return dir; }
  catch (error) { rmSync(dir, { recursive: true, force: true }); throw error; }
}
