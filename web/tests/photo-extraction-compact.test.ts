import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createOpenRouterGroupProvider } from '../lib/extraction/openrouter';
import { priceCheckedTransport } from '../lib/demo-route';
import { DEMO_RESERVATION } from '../lib/demo-store-contracts';
import { GROUP_OUTPUT_TOKENS, MAX_GROUP_REQUEST_BYTES } from '../lib/photo-contracts';
import { groupAttemptIds, photoSetHash } from '../lib/group-binding';
import { preparePhotoGroup } from '../lib/intake';
import { createGroupComparisonService } from '../lib/group-compare-service';
import { checkedRecord } from '../lib/review-policy';
import { groupInput } from './fixtures/photo-groups';
import { OfflineSpendStore } from './helpers/offline-spend-store';
import type { GroupExtractionRequest } from '../lib/extraction/group-provider';

// Synthetic transport transcriptions, NOT model accuracy evidence. No network.
const network = vi.fn(() => { throw Error('Network forbidden'); });
beforeEach(() => { network.mockClear(); vi.stubGlobal('fetch', network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const digest = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
async function setup(tall = false, count = 2) {
  const input = await groupInput(count);
  input.group.application.brand = 'APPLICATION_ONLY_SENTINEL';
  if (tall) for (let i = 0; i < 2; i++) {
    const width = 686, height = 1600;
    const pixels = Buffer.alloc(width * height * 3);
    for (let j = 0; j < pixels.length; j++) pixels[j] = (j + Math.floor(j / (width * 3)) + i) % 251;
    const bytes = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
    input.files[i].image.bytes = bytes;
    input.group.photos[i].bytes = bytes.length;
    input.group.photos[i].role = i === 0 ? 'front' : 'back';
  }
  const prepared = await preparePhotoGroup(input);
  const request: GroupExtractionRequest = {
    schemaVersion: 2, photos: prepared.photos.map(p => ({ descriptor: p.descriptor, image: p.normalized.bytes })),
    photoSetSha256: prepared.photoSetSha256, ...groupAttemptIds(input.group.groupId, 1),
  };
  const output: any = { wireVersion: 1, photos: request.photos.map((p, i) => ({
    photoId: p.descriptor.photoId, brand: 'Example Brand', classType: i ? null : 'TEQUILA GOLD',
    abv: i ? null : '40% ALC/VOL', netContents: '1.75 L',
    producer: {
      name: i ? { status: 'readable', text: 'Example Distillery', reason: 'Distillery identified; IMPORTED BY OTHER CO is a separate role.' } : null,
      address: i ? 'Some Street No. 73, Town, 46400 Mexico' : { status: 'uncertain', text: 'TOWN', reason: 'Locality only' },
    },
    origin: i ? 'PRODUCT OF MEXICO' : 'HECHO EN MEXICO',
    warning: { heading: i ? 'NOTICE:' : null, body: i ? 'VISIBLE WARNING, NOT A REFERENCE.' : null, headingBold: i ? true : null, bodyBold: i ? false : null },
  })) };
  const store = new OfflineSpendStore();
  const transport = vi.fn(async (_url: string, _init: RequestInit) => {
    const photoId = JSON.parse(JSON.parse(String(_init.body)).messages[1].content[0].text).photoId;
    const slot = request.photos.findIndex(p => p.descriptor.photoId === photoId);
    return Response.json({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({...output,photos:output.photos.slice(slot,slot+1)}) } }] });
  });
  const provider = createOpenRouterGroupProvider({ authorized: true, apiKey: 'offline', maxCostMicrousd: 100, store, transport });
  const payload = () => JSON.parse(String(transport.mock.calls[0][1].body));
  return { input, request, output, store, transport, provider, payload };
}

test.each([1, 2, 3, 4])('isolated compact %s-photo output passes production pricing with one reservation per POST', async count => {
  const s = await setup(false, count);
  s.store.ceiling = count * DEMO_RESERVATION;
  const transport = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'anthropic/claude-haiku-4.5', context_length: 200000, pricing: { prompt: '0.000001', completion: '0.000005', input_cache_read: '0.0000001', input_cache_write: '0.00000125', input_cache_write_1h: '0.000002' } }] });
    return s.transport(url, init);
  });
  const provider = createOpenRouterGroupProvider({ authorized: true, apiKey: 'offline', maxCostMicrousd: DEMO_RESERVATION, store: s.store, transport: priceCheckedTransport(transport, GROUP_OUTPUT_TOKENS) });
  expect((await provider.extractGroup(s.request)).processing).toBe('complete');
  expect(transport).toHaveBeenCalledTimes(2 * count); // Catalog checked inside each photo's own hold.
  expect(s.transport).toHaveBeenCalledTimes(count);
  expect(s.payload().max_tokens).toBe(2200);
  expect(s.payload().max_tokens).toBeLessThanOrEqual(GROUP_OUTPUT_TOKENS);
  expect(s.payload().provider.max_price).toEqual({ prompt: 1, completion: 5 });
  expect(Buffer.byteLength(String(s.transport.mock.calls[0][1].body))).toBeLessThan(MAX_GROUP_REQUEST_BYTES);
  expect(s.store.unresolved).toBe(count * DEMO_RESERVATION);
  expect((await provider.extractGroup(s.request)).processing).toBe('failed');
  expect(transport).toHaveBeenCalledTimes(2 * count);
});

test('compact wire expands losslessly into the existing per-photo record and provenance contracts', async () => {
  const s = await setup();
  const result = await createGroupComparisonService({ provider: s.provider, authorize: () => true })(s.input);
  expect(result.processing).toBe('complete'); if (result.processing !== 'complete' || !('recordVersion' in result)) throw Error('Expected photo record');
  expect(checkedRecord(result)).not.toBeNull();
  expect(result.photos).toEqual(s.request.photos.map(p => p.descriptor)); // Includes untouched original source hashes.
  const [front, back] = result.photoEvidence.photos.map(p => p.evidence);
  expect(front.abv).toMatchObject({ status: 'readable', text: '40% ALC/VOL' });
  expect(back.abv).toMatchObject({ status: 'missing', text: null });
  expect(front.classType.text).toBe('TEQUILA GOLD'); expect(back.classType.text).toBeNull();
  expect(back.producer.name).toEqual(s.output.photos[1].producer.name);
  expect(back.producer.address.text).toBe('Some Street No. 73, Town, 46400 Mexico');
  expect(front.producer.address).toEqual(s.output.photos[0].producer.address);
  expect(back.warning.body.text).toBe('VISIBLE WARNING, NOT A REFERENCE.');
  expect(back.warning.bodyBold).toBe(false);
  expect(result.provenance.abv.sourcePhotoIds).toEqual([s.request.photos[0].descriptor.photoId]);
  expect(s.transport).toHaveBeenCalledTimes(s.request.photos.length);
  expect(s.store.unresolved).toBe(200);
});

test('provider requests compact transcriptions instead of repeating nine verbose observation objects per photo', async () => {
  const s = await setup(); await s.provider.extractGroup(s.request);
  const body = s.payload();
  expect(body.messages[0].content).toContain('wireVersion');
  expect(body.messages[0].content.length).toBeLessThan(3300);
  expect(body.max_tokens).toBeLessThanOrEqual(3000);
  expect(String(s.transport.mock.calls[0][1].body)).not.toContain('APPLICATION_ONLY_SENTINEL');
  expect(body.messages[0].content).not.toMatch(/40%|Jose Cuervo|Especial|Rojeña|PROXIMO|GOVERNMENT WARNING/);
  expect(s.transport).toHaveBeenCalledTimes(s.request.photos.length);
});

test('tall images retain exactly one byte-identical full image per context with no ambiguous crops', async () => {
  const s = await setup(true), hashes = s.request.photos.map(p => digest(p.image));
  const result = await s.provider.extractGroup(s.request);
  expect(result.processing).toBe('complete'); if (result.processing !== 'complete') throw Error('Expected complete');
  for (let i = 0; i < 2; i++) {
    const content = JSON.parse(String(s.transport.mock.calls[i][1].body)).messages[1].content;
    expect(content).toHaveLength(2);
    const p = s.request.photos[i];
    expect(JSON.parse(content[0].text)).toEqual({ photoId: p.descriptor.photoId, role: p.descriptor.role });
    expect(content[1].image_url.url).toBe(`data:${p.descriptor.normalized.mime};base64,${Buffer.from(p.image).toString('base64')}`);
    expect(digest(p.image)).toBe(hashes[i]);
    expect(result.metadata.photos[i]).toEqual({ photoId: p.descriptor.photoId, imageSha256: hashes[i] });
  }
  expect(result.evidence.photos).toHaveLength(2); // Detail is not a third/fourth source photo.
  expect((await s.provider.extractGroup(s.request)).processing).toBe('failed');
  expect(s.transport).toHaveBeenCalledTimes(s.request.photos.length);
});

test.each(['unknown-photo', 'duplicate', 'missing-photo', 'blank', 'verdict', 'formatting', 'control', 'oversize', 'missing-field', 'wrong-version', 'uncertain-without-reason', 'producer-name-without-role'])('compact %s fails closed with the original hold and no retry', async fault => {
  const s = await setup(); const p = s.output.photos[0];
  if (fault === 'unknown-photo') p.photoId = '11111111-1111-4111-8111-111111111111';
  if (fault === 'duplicate') s.output.photos[1].photoId = p.photoId;
  if (fault === 'missing-photo') s.output.photos.pop();
  if (fault === 'blank') p.abv = '  ';
  if (fault === 'verdict') p.verdict = 'pass';
  if (fault === 'formatting') p.warning.bodyBold = true;
  if (fault === 'control') p.brand = 'BAD\u0000';
  if (fault === 'oversize') p.brand = 'A'.repeat(2001);
  if (fault === 'missing-field') delete p.abv;
  if (fault === 'wrong-version') s.output.wireVersion = 2;
  if (fault === 'uncertain-without-reason') p.abv = { status: 'uncertain', text: '4?' };
  if (fault === 'producer-name-without-role') p.producer.name = 'Example Brand';
  expect(await s.provider.extractGroup(s.request)).toEqual({ processing: 'failed', code: 'provider-failed' });
  const calls = 2; // Both first-wave holds dispatch before either response validates.
  expect(s.store.unresolved).toBe(100 * calls); expect(s.transport).toHaveBeenCalledTimes(calls);
});

test.each([0, 1])('compact single view %s cannot borrow evidence from an omitted photo', async index => {
  const s = await setup(); s.request.photos = [s.request.photos[index]];
  s.request.photoSetSha256 = photoSetHash(s.request.photos.map(p => p.descriptor));
  s.output.photos = [s.output.photos[index]];
  const r = await s.provider.extractGroup(s.request);
  expect(r.processing).toBe('complete'); if (r.processing !== 'complete') throw Error('Expected complete');
  expect(r.evidence.photos[0].evidence.abv.text).toBe(index ? null : '40% ALC/VOL');
  expect(r.evidence.photos[0].evidence.warning.body.text).toBe(index ? 'VISIBLE WARNING, NOT A REFERENCE.' : null);
  expect(s.transport).toHaveBeenCalledTimes(s.request.photos.length);
});
