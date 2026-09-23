import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createOpenRouterGroupProvider, type Transport } from '../lib/extraction/openrouter';
import { priceCheckedTransport } from '../lib/demo-route';
import { isolatedPhotoAttemptIds } from '../lib/extraction/isolated-photo';
import { groupFixture, photoEvidence } from './fixtures/photo-groups';
import { groupAttemptIds, photoSetHash } from '../lib/group-binding';
import { OfflineSpendStore } from './helpers/offline-spend-store';
import type { GroupExtractionRequest } from '../lib/extraction/group-provider';

const network = vi.fn(() => { throw Error('External network forbidden'); });
beforeEach(() => { network.mockClear(); vi.stubGlobal('fetch', network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const envelope = (value: unknown) => Response.json({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(value) } }] });
const payload = (init: RequestInit) => JSON.parse(String(init.body));
const id = (init: RequestInit): string => JSON.parse(payload(init).messages[1].content[0].text).photoId;
async function setup(count = 4) {
  const fixture = await groupFixture(count), store = new OfflineSpendStore(); store.ceiling = 25_000_000;
  const request: GroupExtractionRequest = { schemaVersion: 2, photos: fixture.prepared.photos.map(p => ({ descriptor: p.descriptor, image: p.normalized.bytes })), photoSetSha256: fixture.prepared.photoSetSha256, ...groupAttemptIds(fixture.input.group.groupId, 1) };
  const transport = vi.fn<Transport>(async (_url, init) => envelope(photoEvidence([id(init)])));
  const provider = () => createOpenRouterGroupProvider({ authorized: true, apiKey: 'offline', store, maxCostMicrousd: 1_000_000, transport });
  return { ...fixture, request, store, transport, provider };
}

test('regression: each Haiku context contains exactly one original photo, never other IDs, images or evidence', async () => {
  const s = await setup(); const result = await s.provider().extractGroup(s.request);
  expect(result.processing).toBe('complete'); if (result.processing !== 'complete') throw Error('Expected complete');
  expect(s.transport).toHaveBeenCalledTimes(4);
  for (const [index, [, init]] of s.transport.mock.calls.entries()) {
    const p = s.request.photos[index], body = payload(init), content = body.messages[1].content;
    expect(body.messages).toHaveLength(2); expect(content).toHaveLength(2);
    expect(body.provider).toEqual({ only: ['Anthropic'], allow_fallbacks: false, require_parameters: true });
    expect(JSON.parse(content[0].text)).toEqual({ photoId: p.descriptor.photoId, role: p.descriptor.role });
    expect(content[1].image_url.url).toBe(`data:${p.descriptor.normalized.mime};base64,${Buffer.from(p.image).toString('base64')}`);
    for (const other of s.request.photos.filter((_, i) => i !== index)) expect(String(init.body)).not.toContain(other.descriptor.photoId);
  }
  expect(result.evidence.photos.map(p => p.photoId)).toEqual(s.request.photos.map(p => p.descriptor.photoId));
  expect(result.metadata.photos).toEqual(s.request.photos.map(p => ({ photoId: p.descriptor.photoId, imageSha256: p.descriptor.normalized.sha256 })));
  expect(s.store.rows.size).toBe(4); expect(s.store.unresolved).toBe(4_000_000);
  expect([...s.store.rows.values()].every(r => r.state === 'unresolved')).toBe(true);
  const bindings = [...s.store.rows.values()].map(r => r.binding);
  expect(new Set(bindings.map(b => b.requestId)).size).toBe(4);
  bindings.forEach((binding, slot) => expect(binding).toMatchObject({...isolatedPhotoAttemptIds(s.request, slot), imageSha256:s.request.photoSetSha256}));
});

test('four-photo scheduling enforces actual managed two-claim cap, first pair concurrent and later children serial', async () => {
  const s = await setup(); let active = 0, peak = 0, peakClaims = 0, deniedClaims = 0;
  const claim = s.store.claim.bind(s.store), complete = vi.spyOn(s.store, 'complete');
  vi.spyOn(s.store, 'claim').mockImplementation(async (binding, claimId) => {
    // Match managed SQL: all claimed holds count, including the retained parent.
    if ([...s.store.rows.values()].filter(r => r.state === 'claimed').length >= 2) { deniedClaims++; return null; }
    const result = await claim(binding, claimId);
    peakClaims = Math.max(peakClaims, [...s.store.rows.values()].filter(r => r.state === 'claimed').length);
    return result;
  });
  const waiting = new Map<string, () => void>();
  s.transport.mockImplementation(async (_url, init) => {
    active++; peak = Math.max(peak, active);
    await new Promise<void>(resolve => waiting.set(id(init), resolve)); active--;
    return envelope(photoEvidence([id(init)]));
  });
  const pending = s.provider().extractGroup(s.request);
  await vi.waitFor(() => expect(waiting.size).toBe(2));
  expect(s.store.rows.get(s.request.reservationId)?.state).toBe('claimed');
  expect(await s.provider().extractGroup(s.request)).toEqual({ processing: 'failed', code: 'spend-unavailable' });
  expect(s.transport).toHaveBeenCalledTimes(2);
  waiting.get(s.request.photos[1].descriptor.photoId)!(); waiting.get(s.request.photos[0].descriptor.photoId)!();
  await vi.waitFor(() => expect(waiting.size).toBe(3));
  expect(s.store.rows.get(s.request.reservationId)?.state).toBe('claimed');
  expect(s.store.rows.size).toBe(3);
  waiting.get(s.request.photos[2].descriptor.photoId)!();
  await vi.waitFor(() => expect(waiting.size).toBe(4));
  expect(s.store.rows.get(s.request.reservationId)?.state).toBe('claimed');
  waiting.get(s.request.photos[3].descriptor.photoId)!();
  const result = await pending;
  expect(peak).toBe(2); expect(peakClaims).toBe(2); expect(deniedClaims).toBe(0); expect(result.processing).toBe('complete');
  expect(s.transport).toHaveBeenCalledTimes(4);expect(s.store.unresolved).toBe(4_000_000);
  expect([...s.store.rows.values()].every(r => r.state === 'unresolved')).toBe(true);
  expect(complete.mock.calls.map(([b]) => b.reservationId)).toEqual([1,2,3,0].map(slot => isolatedPhotoAttemptIds(s.request,slot).reservationId));
  if (result.processing === 'complete') expect(result.evidence.photos.map(p => p.photoId)).toEqual(s.request.photos.map(p => p.descriptor.photoId));
});

test('concurrent replay cannot split ownership or spend twice; parent and derived IDs remain permanent', async () => {
  const s = await setup(); const results = await Promise.all([s.provider().extractGroup(s.request), s.provider().extractGroup(s.request)]);
  expect(results.map(r => r.processing).sort()).toEqual(['complete', 'failed']); expect(s.transport).toHaveBeenCalledTimes(4);
  const rows = [...s.store.rows.values()]; expect(new Set(rows.map(r => r.binding.attemptId)).size).toBe(4);
  expect(rows[0].binding).toMatchObject({ attemptId: s.request.attemptId, reservationId: s.request.reservationId });
  // Changing only one parent identity cannot bypass the other identity's permanent fence.
  for (const change of [{ attemptId: randomUUID() }, { reservationId: randomUUID() }]) expect((await s.provider().extractGroup({ ...s.request, ...change })).processing).toBe('failed');
  const reordered = { ...s.request, photos: [...s.request.photos].reverse() }; reordered.photoSetSha256 = photoSetHash(reordered.photos.map(p => p.descriptor));
  expect((await s.provider().extractGroup(reordered)).processing).toBe('failed'); expect(s.transport).toHaveBeenCalledTimes(4);
});

test.each(['wrong-id', 'extra-photo', 'first-failure', 'late-failure'])('isolated %s fails the entire group with no salvage/retry', async fault => {
  const s = await setup(); let calls = 0;
  s.transport.mockImplementation(async (_url, init) => {
    calls++; const e = photoEvidence([id(init)]);
    if (fault === 'wrong-id') e.photos[0].photoId = randomUUID();
    if (fault === 'extra-photo') e.photos.push(photoEvidence([randomUUID()]).photos[0]);
    if (fault === 'first-failure' || (fault === 'late-failure' && calls === 2)) throw Error('offline failure');
    return envelope(e);
  });
  expect((await s.provider().extractGroup(s.request)).processing).toBe('failed');
  expect(calls).toBe(2);
  expect(s.store.unresolved).toBe(calls * 1_000_000);
  expect((await s.provider().extractGroup(s.request)).processing).toBe('failed'); expect(s.transport).toHaveBeenCalledTimes(calls);
});

test('every POST requires its own priced $1 reservation; insufficient managed balance never borrows the parent hold', async () => {
  const s = await setup(); s.store.historical = 23_000_000;
  const raw = vi.fn<Transport>(async (url, init) => {
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'anthropic/claude-haiku-4.5', context_length: 200000, pricing: { prompt: '0.000001', completion: '0.000005', input_cache_read: '0.0000001', input_cache_write: '0.00000125', input_cache_write_1h: '0.000002' } }] });
    const requestId = new Headers(init.headers).get('X-Request-ID');
    expect([...s.store.rows.values()].filter(r => r.state === 'claimed' && r.binding.requestId === requestId)).toHaveLength(1);
    return envelope(photoEvidence([id(init)]));
  });
  const provider = createOpenRouterGroupProvider({ authorized: true, apiKey: 'offline', store: s.store, maxCostMicrousd: 1_000_000, transport: priceCheckedTransport(raw) });
  expect((await provider.extractGroup(s.request)).processing).toBe('failed');
  expect(raw.mock.calls.filter(([url]) => url.endsWith('/chat/completions'))).toHaveLength(2);
  expect(s.store.historical).toBe(23_000_000); expect(s.store.unresolved).toBe(2_000_000);
});

test('aborted group does not start later photos or reserve again', async () => {
  const s = await setup(), controller = new AbortController();
  s.transport.mockImplementation(async (_url, init) => { controller.abort(); return envelope(photoEvidence([id(init)])); });
  expect((await s.provider().extractGroup(s.request, controller.signal)).processing).toBe('failed');
  expect(s.transport).toHaveBeenCalledTimes(1); expect(s.store.rows.size).toBe(1);
});

test('missing child completion acknowledgment drains first wave without later reservations or refunds', async () => {
  const s = await setup(); s.store.fail = 'complete';
  expect(await s.provider().extractGroup(s.request)).toEqual({processing:'failed',code:'spend-unavailable'});
  expect(s.store.rows.size).toBe(2); expect(s.store.unresolved).toBe(2_000_000); expect(s.transport).toHaveBeenCalledTimes(2);
});

test.each([0, 1])('slot %s failure awaits its in-flight sibling and retains both liabilities before failing', async failedSlot => {
  const s = await setup();
  const waiting = new Map<string, { resolve: () => void; reject: () => void }>();
  s.transport.mockImplementation(async (_url, init) => {
    await new Promise<void>((resolve, reject) => waiting.set(id(init), { resolve, reject: () => reject(Error('offline')) }));
    return envelope(photoEvidence([id(init)]));
  });
  let settled = false;
  const pending = s.provider().extractGroup(s.request).then(r => { settled = true; return r; });
  await vi.waitFor(() => expect(waiting.size).toBe(2));
  waiting.get(s.request.photos[failedSlot].descriptor.photoId)!.reject();
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(settled).toBe(false); expect(s.transport).toHaveBeenCalledTimes(2);
  expect(s.store.rows.get(s.request.reservationId)?.state).toBe('claimed');
  expect(s.store.unresolved).toBe(2_000_000);
  waiting.get(s.request.photos[1 - failedSlot].descriptor.photoId)!.resolve();
  expect(await pending).toEqual({ processing: 'failed', code: 'provider-failed' });
  expect(s.transport).toHaveBeenCalledTimes(2); expect(s.store.rows.size).toBe(2);
  expect([...s.store.rows.values()].every(r => r.state === 'unresolved')).toBe(true);
  expect(s.store.unresolved).toBe(2_000_000);
});

test('exact two-photo group dispatches both before either finishes, preserves parent metadata and completes parent last', async () => {
  const s = await setup(2), waiting: (() => void)[] = [];
  const complete = vi.spyOn(s.store, 'complete');
  s.transport.mockImplementation(async (_url, init) => {
    await new Promise<void>(resolve => waiting.push(resolve));
    return envelope(photoEvidence([id(init)]));
  });
  const pending = s.provider().extractGroup(s.request);
  await vi.waitFor(() => expect(waiting).toHaveLength(2));
  waiting[0]();
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(complete).not.toHaveBeenCalled();
  expect(await s.provider().extractGroup(s.request)).toEqual({ processing: 'failed', code: 'spend-unavailable' });
  expect(s.transport).toHaveBeenCalledTimes(2);
  waiting[1](); const result = await pending;
  expect(result.processing).toBe('complete');
  if (result.processing === 'complete') expect(result.metadata).toMatchObject({ attemptId: s.request.attemptId, reservationId: s.request.reservationId, photoSetSha256: s.request.photoSetSha256, schemaVersion: 2 });
  expect(complete).toHaveBeenCalledTimes(2);
  expect(complete.mock.calls[1][0].reservationId).toBe(s.request.reservationId);
  expect(s.store.unresolved).toBe(2_000_000);
});

test('child identities are stable, distinct, bounded and independently tied to each parent identity', () => {
  const parent = {attemptId:randomUUID(),reservationId:randomUUID()};
  const children = Array.from({length:4}, (_, slot) => isolatedPhotoAttemptIds(parent, slot));
  expect(new Set(children.flatMap(c => [c.attemptId,c.reservationId])).size).toBe(8);
  children.forEach((child, slot) => {
    expect(isolatedPhotoAttemptIds({...parent},slot)).toEqual(child);
    expect(isolatedPhotoAttemptIds({...parent,attemptId:randomUUID()},slot).reservationId).toBe(child.reservationId);
    expect(isolatedPhotoAttemptIds({...parent,reservationId:randomUUID()},slot).attemptId).toBe(child.attemptId);
  });
  for (const slot of [-1,4,1.5]) expect(() => isolatedPhotoAttemptIds(parent,slot)).toThrow();
});

test('group reservations cannot exceed four dollars or silently accept an overlarge per-photo hold', async () => {
  const s = await setup();
  const provider = createOpenRouterGroupProvider({ authorized: true, apiKey: 'offline', store: s.store, maxCostMicrousd: 1_000_001, transport: s.transport });
  expect(await provider.extractGroup(s.request)).toEqual({ processing: 'failed', code: 'unconfigured' }); expect(s.store.rows.size).toBe(0); expect(s.transport).not.toHaveBeenCalled();
});
