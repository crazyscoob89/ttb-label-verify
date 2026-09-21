import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

// Source-contract regression only, not native Windows/.NET acceptance.
// Native behavior is exercised by sqlite-spend-native-security.test.ts.
const guard = readFileSync(new URL('../lib/ledger-security.ts', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('./fixtures/private-ledger.ts', import.meta.url), 'utf8');

test('Windows production ACL reader uses literal .NET IO and never requests Audit/SACL', () => {
  expect(guard).not.toMatch(/\bGet-Acl\b|\bGet-Item\b/);
  expect(guard).toContain('[IO.File]::GetAttributes(');
  expect(guard).toContain(".GetAccessControl([Security.AccessControl.AccessControlSections]'Access, Owner')");
  expect(guard).not.toMatch(/AccessControlSections\][^\n]*(?:All|Audit)/);
});

test('Windows fixture edits only DACL and verifies exposed ACE before returning', () => {
  expect(fixture).not.toMatch(/\bGet-Acl\b|\bSet-Acl\b|\bGet-Item\b/);
  expect(fixture).toContain(".GetAccessControl([Security.AccessControl.AccessControlSections]::Access)");
  expect(fixture).toContain('.SetAccessControl($acl)');
  expect(fixture).toContain("throw 'Fixture exposure not observed'");
  expect(fixture).not.toMatch(/AccessControlSections\][^\n]*(?:All|Audit)/);
});
