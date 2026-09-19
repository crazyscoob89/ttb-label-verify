import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { executeReserved, type SpendBinding } from '../lib/spend';
import { OfflineSpendStore } from './helpers/offline-spend-store';

const binding = (): SpendBinding => ({ reservationId: randomUUID(), attemptId: randomUUID(), requestId: randomUUID(), imageSha256: 'a'.repeat(64), schemaVersion: 1, rulesVersion: 'prototype-seven-fields-v1', promptVersion: 'image-observations-v1', model: 'anthropic/claude-haiku-4.5', maxCostMicrousd: 100 });

test('authorized valid reservation dispatches once and holds all cost after success', async () => {
  const store = new OfflineSpendStore(); const work = vi.fn(async () => 'evidence'); const b = binding();
  expect(await executeReserved(store, b, work)).toEqual({ ok: true, value: 'evidence' });
  expect(work).toHaveBeenCalledTimes(1); expect(store.unresolved).toBe(100);
  expect(store.rows.get(b.reservationId)?.state).toBe('unresolved');
});
test.each(['reserve', 'claim', 'complete'] as const)('%s outage rejects without leaking store details', async stage => {
  const store = new OfflineSpendStore(); store.fail = stage; const work = vi.fn(async () => 'private value');
  expect(await executeReserved(store, binding(), work)).toEqual({ ok: false, code: 'spend-unavailable' });
  expect(work).toHaveBeenCalledTimes(stage === 'complete' ? 1 : 0);
  if (stage !== 'reserve') expect(store.unresolved).toBe(100);
});
test('no store defaults deny', async () => {
  const work = vi.fn(); expect((await executeReserved(undefined, binding(), work)).ok).toBe(false); expect(work).not.toHaveBeenCalled();
});
test('concurrent same reservation/attempt cannot dispatch twice', async () => {
  const store = new OfflineSpendStore(); const b = binding(); const work = vi.fn(async () => 'ok');
  const result = await Promise.all(Array.from({ length: 20 }, () => executeReserved(store, b, work)));
  expect(result.filter(r => r.ok)).toHaveLength(1); expect(work).toHaveBeenCalledTimes(1); expect(store.unresolved).toBe(100);
});
test('atomic claim rejects duplicate even when reserve replays a valid receipt', async () => {
  const store = new OfflineSpendStore(); const b = binding(); const reserve = store.reserve.bind(store);
  let receipt: Promise<unknown> | undefined; store.reserve = input => receipt ??= reserve(input);
  const work = vi.fn(async () => 'ok');
  const result = await Promise.all([executeReserved(store, b, work), executeReserved(store, b, work)]);
  expect(result.filter(r => r.ok)).toHaveLength(1); expect(work).toHaveBeenCalledTimes(1);
});
test('cumulative historical and unresolved liabilities are not reset across boundaries', async () => {
  const store = new OfflineSpendStore(); store.historical = 850; const work = vi.fn(async () => 'ok');
  expect((await executeReserved(store, binding(), work)).ok).toBe(true);
  expect((await executeReserved(store, binding(), work)).ok).toBe(false);
  expect(work).toHaveBeenCalledTimes(1); expect(store.historical).toBe(850);
});
test('exceptions retain reservation and retries require both new identities', async () => {
  const store = new OfflineSpendStore(); const b = binding(); const work = vi.fn(async () => { throw new Error('private response'); });
  expect(await executeReserved(store, b, work)).toEqual({ ok: false, code: 'execution-failed' });
  expect(store.unresolved).toBe(100);
  const good = vi.fn(async () => 'ok');
  expect((await executeReserved(store, { ...b, requestId: randomUUID() }, good)).ok).toBe(false);
  expect((await executeReserved(store, { ...binding(), attemptId: b.attemptId }, good)).ok).toBe(false);
  expect((await executeReserved(store, binding(), good)).ok).toBe(true);
  expect(good).toHaveBeenCalledTimes(1); expect(store.unresolved).toBe(200);
});
test.each([0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('invalid integer money %s never reserves', async cost => {
  const store = new OfflineSpendStore(); const work = vi.fn();
  expect((await executeReserved(store, { ...binding(), maxCostMicrousd: cost }, work)).ok).toBe(false);
  expect(store.rows.size).toBe(0); expect(work).not.toHaveBeenCalled();
});
test.each(['binding', 'currency', 'overflow', 'ceiling', 'liability', 'state', 'nonce', 'extra'])('invalid reserve receipt %s fails closed', async fault => {
  const store = new OfflineSpendStore(); const reserve = store.reserve.bind(store);
  store.reserve = async b => {
    const r = await reserve(b) as any;
    if (fault === 'binding') r.binding.imageSha256 = 'b'.repeat(64);
    if (fault === 'currency') r.ledger.currency = 'EUR';
    if (fault === 'overflow') r.ledger.incurredMicrousd = Number.MAX_SAFE_INTEGER;
    if (fault === 'ceiling') r.ledger.ceilingMicrousd = 1;
    if (fault === 'liability') r.ledger.unresolvedMicrousd = 0;
    if (fault === 'state') r.state = 'settled';
    if (fault === 'nonce') r.claimId = randomUUID();
    if (fault === 'extra') r.raw = 'private';
    return r;
  };
  const work = vi.fn(); expect((await executeReserved(store, binding(), work)).ok).toBe(false); expect(work).not.toHaveBeenCalled();
});
test.each(['claim', 'complete'] as const)('invalid %s receipt refuses output and holds liability', async stage => {
  const store = new OfflineSpendStore(); const original = store[stage].bind(store);
  store[stage] = async (b, id) => { const r = await original(b, id) as any; r.claimId = randomUUID(); return r; };
  const work = vi.fn(async () => 'private');
  expect(await executeReserved(store, binding(), work)).toEqual({ ok: false, code: 'spend-unavailable' });
  expect(work).toHaveBeenCalledTimes(stage === 'complete' ? 1 : 0); expect(store.unresolved).toBe(100);
});
