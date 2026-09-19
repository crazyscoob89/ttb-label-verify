import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const root = fileURLToPath(new URL('../..', import.meta.url));
describe('DB gate refusal subprocess — never connects to a DB', () => {
  it('is an explicit package gate, not the unit suite', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(manifest.scripts['test:db']).toBe('tsx scripts/db-gate.ts');
  });
  it('fails specifically for missing isolated authorization/config, even without psql on PATH', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/db-gate.ts'], { cwd: root, env: { NODE_ENV: 'test', PATH: '' }, encoding: 'utf8', timeout: 10_000 });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe('DB gate blocked: explicit isolated target configuration required');
    expect(result.stdout).toBe('');
  });
  it('rejects caller-supplied narrower suite arguments before configuration/DB access', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/db-gate.ts', '--test', 'harmless.ts'], { cwd: root, env: { NODE_ENV: 'test', PATH: '' }, encoding: 'utf8', timeout: 10_000 });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe('DB gate blocked: arguments/narrowed suites are forbidden');
  });
  it('cannot promote a catalog-only pass to behavioral acceptance', () => {
    const source = readFileSync(new URL('../../scripts/db-gate.ts', import.meta.url), 'utf8');
    expect(source).toContain('concurrency/RLS behavior/durability suite UNIMPLEMENTED and UNRUN');
    expect(source).toContain('process.exitCode = 1');
    expect(source).not.toContain('vitest'); expect(source).not.toContain('migrations/');
  });
});
