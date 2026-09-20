import { lstatSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';

const sidecars = ['-wal', '-shm', '-journal'];
const privateError = () => Error('Private ledger security check failed');

// Read-only OS inspection. No account-name resolution, ACL edits, elevation,
// profiles, shell interpolation or execution-policy bypass. Paths arrive on stdin.
const inspectWindows = String.raw`
$ErrorActionPreference = 'Stop'
try {
  [Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $path = [string]$request.path
  if ($path -notmatch '^[A-Za-z]:\\' -or $path.Substring(2).Contains(':') -or $path.Contains('/') -or $path -match '[ .](\\|$)') { throw 'Local canonical path required' }
  if ([IO.Path]::GetFullPath($path) -cne $path) { throw 'Canonical path required' }
  $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($path))
  if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS') { throw 'Local NTFS required' }
  $parent = [IO.Path]::GetDirectoryName($path)
  $ancestor = $parent
  while ($ancestor) {
    $item = Get-Item -LiteralPath $ancestor -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse path denied' }
    $ancestor = [IO.Path]::GetDirectoryName($ancestor)
  }
  $entries = @()
  foreach ($name in @($parent, $path, ($path + '-wal'), ($path + '-shm'), ($path + '-journal'))) {
    try { $item = Get-Item -LiteralPath $name -Force }
    catch [System.Management.Automation.ItemNotFoundException] {
      if ($name -eq $parent -or ($name -eq $path -and -not $request.creating)) { throw }
      continue
    }
    if ($request.creating -and $name -ne $parent) { throw 'Existing ledger or sidecar' }
    $acl = Get-Acl -LiteralPath $name
    $raw = [Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
    $aces = @()
    foreach ($ace in $raw.DiscretionaryAcl) {
      if ($ace -isnot [Security.AccessControl.CommonAce]) { throw 'Unsupported ACE' }
      $aces += @{ sid = $ace.SecurityIdentifier.Value; type = [int]$ace.AceType; flags = [int]$ace.AceFlags; mask = [int]$ace.AccessMask; callback = $ace.IsCallback }
    }
    $entries += @{ path = $name; directory = [bool]$item.PSIsContainer; reparse = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint); owner = $raw.Owner.Value; protected = $acl.AreAccessRulesProtected; canonical = $acl.AreAccessRulesCanonical; daclPresent = [bool](($raw.ControlFlags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) -and $null -ne $raw.DiscretionaryAcl); aces = @($aces) }
  }
  $result = @{ current = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; entries = @($entries) }
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  [Console]::Out.Write(($result | ConvertTo-Json -Depth 8 -Compress))
} catch { [Console]::Error.WriteLine('Ledger ACL inspection failed'); exit 1 }
`;

const sid = z.string().regex(/^S-1-\d+(?:-\d+)+$/);
const aclSnapshot = z.strictObject({
  current: sid,
  entries: z.array(z.strictObject({
    path: z.string(), directory: z.boolean(), reparse: z.literal(false), owner: sid,
    protected: z.boolean(), canonical: z.literal(true), daclPresent: z.literal(true),
    aces: z.array(z.strictObject({ sid, type: z.literal(0), callback: z.literal(false),
      flags: z.number().int().min(0).max(31), mask: z.number().int().min(1).max(2032127) })).min(1),
  })).min(1).max(5),
});

function checkWindows(path: string, creating: boolean) {
  const root = process.env.SystemRoot;
  if (!root || !isAbsolute(root)) throw privateError();
  const output = execFileSync(join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(inspectWindows, 'utf16le').toString('base64')],
    { input: JSON.stringify({ path, creating }), encoding: 'utf8', timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const snapshot = aclSnapshot.parse(JSON.parse(output));
  // Deliberately narrow: current user owns every object; only that SID, Local
  // System and built-in Administrators may receive rights. No generic groups,
  // CREATOR OWNER, deny/conditional/object ACEs or localized names are accepted.
  const allowed = new Set([snapshot.current, 'S-1-5-18', 'S-1-5-32-544']);
  const parent = dirname(path);
  const expected = new Set(creating ? [parent] : [parent, path, ...sidecars.map(s => path + s)]);
  const seen = new Set<string>();
  for (const entry of snapshot.entries) {
    if (!expected.has(entry.path) || seen.has(entry.path) || entry.owner !== snapshot.current || entry.directory !== (entry.path === parent)) throw privateError();
    seen.add(entry.path);
    if (entry.directory && !entry.protected) throw privateError();
    if (entry.aces.some(ace => !allowed.has(ace.sid))) throw privateError();
    // FullControl, not merely an owner label. Directory grant must apply to the
    // directory AND propagate to files/subdirectories (OI|CI, no IO/NP).
    if (!entry.aces.some(ace => ace.sid === snapshot.current && ace.mask === 2032127 &&
      (entry.directory ? (ace.flags & 15) === 3 : (ace.flags & 8) === 0))) throw privateError();
  }
  if (!seen.has(parent) || (!creating && !seen.has(path))) throw privateError();
}

function statIfPresent(path: string) {
  try { return lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

function check(path: string, creating: boolean) {
  try {
    if (!isAbsolute(path) || resolve(path) !== path) throw privateError();
    const windows = platform() === 'win32';
    const parent = dirname(path);
    // Check links in every ancestor, not just the final DB entry. The immediate
    // directory is the confidentiality boundary for SQLite's future sidecars.
    for (let dir = parent;; dir = dirname(dir)) {
      const stat = lstatSync(dir);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw privateError();
      if (dir === parent && !windows && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid!() || (stat.mode & 0o700) !== 0o700)) throw privateError();
      if (dirname(dir) === dir) break;
    }
    for (const file of [path, ...sidecars.map(s => path + s)]) {
      const stat = statIfPresent(file);
      if (!stat) { if (file === path && !creating) throw privateError(); continue; }
      if (creating || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw privateError();
      if (!windows && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid!())) throw privateError();
    }
    if (windows) checkWindows(path, creating);
  } catch { throw privateError(); }
}

export function assertPrivateLedger(path: string) { check(path, false); }
export function assertPrivateLedgerCreation(path: string) { check(path, true); }
