import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { bindingSchema, executeReserved, type SpendBinding, type SpendReceipt } from '../lib/spend';
import { OfflineSpendStore } from './helpers/offline-spend-store';

const binding = (): SpendBinding => ({
  reservationId: randomUUID(), attemptId: randomUUID(), requestId: randomUUID(), imageSha256: 'a'.repeat(64),
  schemaVersion: 2, rulesVersion: 'prototype-seven-fields-v1', promptVersion: 'azure-ocr-photo-observations-v1',
  model: 'mistral-document-ai-2512', maxCostMicrousd: 1000000,
});
const store = () => { const s = new OfflineSpendStore(); s.ceiling = 25000000; return s; };

test('exact nine-key Azure binding and unchanged legacy branches', () => {
  const azure = binding(); expect(bindingSchema.parse(azure)).toEqual(azure); expect(Object.keys(azure)).toHaveLength(9);
  for (const schemaVersion of [1, 2]) for (const maxCostMicrousd of [100, 1000000]) {
    const legacy = { ...azure, schemaVersion, model: 'anthropic/claude-haiku-4.5',
      promptVersion: schemaVersion === 1 ? 'image-observations-v1' : 'photo-set-observations-v2', maxCostMicrousd };
    expect(bindingSchema.parse(legacy)).toEqual(legacy);
  }
  for (const model of ['anthropic/claude-haiku-4.5', 'mistral-document-ai-2512'])
    for (const schemaVersion of [1, 2])
      for (const promptVersion of ['image-observations-v1', 'photo-set-observations-v2', 'azure-ocr-photo-observations-v1']) {
        const allowed = model === 'anthropic/claude-haiku-4.5'
          ? promptVersion === (schemaVersion === 1 ? 'image-observations-v1' : 'photo-set-observations-v2')
          : schemaVersion === 2 && promptVersion === 'azure-ocr-photo-observations-v1';
        expect(bindingSchema.safeParse({ ...azure, model, schemaVersion, promptVersion }).success).toBe(allowed);
      }
});

test.each([
  { schemaVersion: 1 }, { schemaVersion: '2' }, { rulesVersion: 'unknown' }, { model: 'mistral-large' },
  { promptVersion: 'photo-set-observations-v2' }, { maxCostMicrousd: 999999 }, { maxCostMicrousd: 1000001 },
  { maxCostMicrousd: '1000000' }, { maxCostMicrousd: 0 }, { maxCostMicrousd: NaN },
  { reservationId: 'invalid' }, { attemptId: null }, { requestId: undefined }, { imageSha256: 'A'.repeat(64) },
  { source: 'azure-foundry' }, { extra: true },
])('malformed Azure binding never reserves or dispatches: %j', async patch => {
  const s = store(), work = vi.fn();
  expect(await executeReserved(s, { ...binding(), ...patch } as SpendBinding, work)).toEqual({ ok: false, code: 'spend-unavailable' });
  expect(s.rows.size).toBe(0); expect(work).not.toHaveBeenCalled();
});

test.each([false, true])('Azure receipts roundtrip; success/failure=%s never settles or releases liability', async fail => {
  const s = store(), b = binding();
  const result = await executeReserved(s, b, async () => { if (fail) throw Error('synthetic failure'); return 'evidence'; });
  expect(result).toEqual(fail ? { ok: false, code: 'execution-failed' } : { ok: true, value: 'evidence' });
  expect(s.rows.get(b.reservationId)).toMatchObject({ binding: b, state: 'unresolved', claimId: expect.any(String) });
  expect(s.unresolved).toBe(1000000); expect(s.historical).toBe(0);
  const work = vi.fn();
  for (const retry of [b, { ...binding(), attemptId: b.attemptId }, { ...binding(), reservationId: b.reservationId }])
    expect((await executeReserved(s, retry, work)).ok).toBe(false);
  expect(work).not.toHaveBeenCalled();
});

test('shared liability and concurrency deny the second Azure reservation at the ceiling', async () => {
  const s = store(); s.historical = 24000000; const work = vi.fn(async () => 'ok');
  const results = await Promise.all([executeReserved(s, binding(), work), executeReserved(s, binding(), work)]);
  expect(results.filter(r => r.ok)).toHaveLength(1); expect(work).toHaveBeenCalledTimes(1);
  expect(s.historical).toBe(24000000); expect(s.unresolved).toBe(1000000);
});

test.each(['reserve', 'claim', 'complete'] as const)('receipt provider substitution at %s fails closed and keeps hold', async stage => {
  const s = store(), original = s[stage].bind(s);
  s[stage] = async (b: SpendBinding, claimId?: string) => {
    const receipt = await original(b, claimId!) as SpendReceipt;
    receipt.binding = { ...receipt.binding, model: 'anthropic/claude-haiku-4.5', promptVersion: 'photo-set-observations-v2', schemaVersion: 2 };
    return receipt;
  };
  const work = vi.fn(async () => 'private evidence');
  expect(await executeReserved(s, binding(), work)).toEqual({ ok: false, code: 'spend-unavailable' });
  expect(work).toHaveBeenCalledTimes(stage === 'complete' ? 1 : 0); expect(s.unresolved).toBe(1000000);
});
