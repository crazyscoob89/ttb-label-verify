import { expect, test } from 'vitest';
import { buildBatchManifest } from '../lib/batch-manifest';
import { application } from './fixtures/synthetic';

const file = (filename: string) => ({ filename, imageSha256: 'a'.repeat(64) });
const mapping = (filename: string, id = filename) => ({ filename, application: { ...application, applicationId: id } });

test('300 synthetic pairs bind by literal filename independent of both input orders', () => {
  const files = Array.from({ length: 300 }, (_, i) => file(`synthetic-${i}.png`));
  const manifest = files.map(f => mapping(f.filename));
  const result = buildBatchManifest([...files].reverse(), JSON.stringify(manifest));
  expect(result.counts).toEqual({ total: 300, valid: 300, blocked: 0 });
  for (const entry of result.entries) {
    expect(entry.status).toBe('valid');
    if (entry.status === 'valid') {
      expect(entry.application.applicationId).toBe(entry.filename);
      expect(files[files.length - 1 - entry.fileIndexes[0]].filename).toBe(entry.filename);
    }
  }
  const reversed = buildBatchManifest(files, [...manifest].reverse());
  expect(result.entries.map(e => e.id).sort()).toEqual(reversed.entries.map(e => e.id).sort());
});

test('duplicate mappings and physical filenames block all affected names, not unrelated pairs', () => {
  const result = buildBatchManifest([file('a.png'), file('b.png'), file('b.png'), file('good.png')],
    [mapping('a.png'), mapping('a.png', 'other'), mapping('b.png'), mapping('good.png')]);
  expect(result.counts).toEqual({ total: 3, valid: 1, blocked: 2 });
  expect(result.entries.find(e => e.filename === 'a.png')?.issues).toContain('duplicate-mapping');
  expect(result.entries.find(e => e.filename === 'b.png')?.issues).toContain('duplicate-file');
  expect(result.entries.find(e => e.filename === 'good.png')?.status).toBe('valid');
});

test('missing mapping and missing image are separate blocked entries; no sample fallback', () => {
  const result = buildBatchManifest([file('unrelated.png'), file('Label.png')], [mapping('label.png')]);
  expect(result.counts).toEqual({ total: 3, valid: 0, blocked: 3 });
  expect(result.entries.find(e => e.filename === 'unrelated.png')?.issues).toContain('missing-mapping');
  expect(result.entries.find(e => e.filename === 'label.png')?.issues).toContain('missing-file');
  expect(result.entries.every(e => !('application' in e) && !('result' in e))).toBe(true);
});

test.each([undefined, null, '', ' ', '40%', -1, 101])('invalid ABV %j blocks just its mapping', abv => {
  const result = buildBatchManifest([file('bad.png'), file('good.png')], [
    { ...mapping('bad.png'), application: { ...application, applicationId: 'bad', abv } }, mapping('good.png'),
  ]);
  expect(result.counts).toEqual({ total: 2, valid: 1, blocked: 1 });
  expect(result.entries.find(e => e.filename === 'bad.png')?.issues).toContain('invalid-application');
});

test('explicit zero is preserved; schema rejects missing declarations and unknown fields', () => {
  const zero = { ...mapping('zero.png'), application: { ...application, abv: '0' } };
  const result = buildBatchManifest([file('zero.png')], [zero]);
  expect(result.entries[0]).toMatchObject({ status: 'valid', application: { abv: 0 } });
  for (const change of [{ brand: '' }, { imported: undefined }, { unexpected: true }]) {
    expect(buildBatchManifest([file('zero.png')], [{ ...zero, application: { ...zero.application, ...change } }]).counts.blocked).toBe(1);
  }
});

test('duplicate application/version identities block both names', () => {
  const result = buildBatchManifest([file('a.png'), file('b.png'), file('c.png')], [mapping('a.png', 'same'), mapping('b.png', 'same'), mapping('c.png')]);
  expect(result.counts).toEqual({ total: 3, valid: 1, blocked: 2 });
  expect(result.entries.filter(e => e.issues.includes('duplicate-application'))).toHaveLength(2);
});

test('invalid row or file metadata is isolated and snapshots are immutable', () => {
  const files = [file('good.png'), { ...file('bad.png'), imageSha256: 'bad' }];
  const rows = [mapping('good.png'), mapping('bad.png'), { filename: '../bad.png', application }];
  const result = buildBatchManifest(files, rows);
  expect(result.counts).toEqual({ total: 3, valid: 1, blocked: 2 });
  files[0].imageSha256 = 'b'.repeat(64);
  rows[0].application.brand = 'changed';
  expect(result.entries.find(e => e.filename === 'good.png')).toMatchObject({ imageSha256: 'a'.repeat(64), application: { brand: application.brand } });
  expect(Object.isFrozen(result.entries[0])).toBe(true);
});

test('invalid envelopes, oversized arrays, and more than 300 logical names fail closed', () => {
  for (const value of ['{', '{}', null, []]) expect(() => buildBatchManifest([], value)).toThrow();
  expect(() => buildBatchManifest(Array.from({ length: 301 }, (_, i) => file(`${i}.png`)), [])).toThrow();
  expect(() => buildBatchManifest([file('extra.png')], Array.from({ length: 300 }, (_, i) => mapping(`${i}.png`)))).toThrow();
});
