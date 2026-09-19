import { describe, expect, it } from 'vitest';
import { validateDbGateConfig } from '../../scripts/db-gate-config';

const approved = { TTB_DB_GATE_AUTHORIZATION: 'isolated-phase4-db-tests-only', TTB_DB_GATE_HOST: '127.0.0.1', TTB_DB_GATE_DATABASE: 'ttb_phase4_test_synthetic', TTB_DB_GATE_URL: 'postgresql://test:synthetic@127.0.0.1:5432/ttb_phase4_test_synthetic' };
describe('actual-DB gate configuration (offline)', () => {
  it('accepts only an explicitly pinned isolated target', () => {
    expect(validateDbGateConfig(approved)).toEqual({ host: '127.0.0.1', port: '5432', database: 'ttb_phase4_test_synthetic', username: 'test', password: 'synthetic' });
  });
  it.each(['TTB_DB_GATE_AUTHORIZATION', 'TTB_DB_GATE_HOST', 'TTB_DB_GATE_DATABASE', 'TTB_DB_GATE_URL'])('fails absent %s without default target', field => {
    const env: Record<string, string> = { ...approved }; delete env[field]; expect(() => validateDbGateConfig(env)).toThrow('DB gate blocked');
  });
  it.each([
    { TTB_DB_GATE_AUTHORIZATION: 'yes' },
    { TTB_DB_GATE_HOST: 'other' },
    { TTB_DB_GATE_DATABASE: 'postgres' },
    { TTB_DB_GATE_URL: 'postgresql://test:synthetic@production.example.test/ttb_phase4_test_synthetic', TTB_DB_GATE_HOST: 'production.example.test' },
    { TTB_DB_GATE_URL: 'postgresql://test:synthetic@127.0.0.1:5432/ttb_phase4_test_synthetic?options=-c%20role%3Dpostgres' },
    { TTB_DB_GATE_URL: 'not-a-url' },
    { TTB_DB_GATE_URL: 'postgresql://test@127.0.0.1:5432/ttb_phase4_test_synthetic' },
  ])('rejects unapproved/ambiguous target without leaking connection text %j', change => {
    expect(() => validateDbGateConfig({ ...approved, ...change })).toThrow(/^DB gate blocked: explicit isolated target configuration required$/);
  });
});
