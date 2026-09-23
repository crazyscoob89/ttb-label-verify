import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createOpenRouterGroupProvider, OPENROUTER_ENDPOINT, OPENROUTER_MODEL } from '../lib/extraction/openrouter';
import { type GroupExtractionRequest } from '../lib/extraction/group-provider';
import { type Observation } from '../lib/extraction/schema';
import { groupAttemptIds, photoSetHash } from '../lib/group-binding';
import { createGroupComparisonService } from '../lib/group-compare-service';
import { preparePhotoGroup } from '../lib/intake';
import { GROUP_OUTPUT_TOKENS, GROUP_PROMPT_VERSION } from '../lib/photo-contracts';
import { WARNING_REFERENCE } from '../lib/rules';
import { groupInput, photoEvidence } from './fixtures/photo-groups';
import { OfflineSpendStore } from './helpers/offline-spend-store';

// Hand-authored transport output, NOT OCR of the synthetic test images. Wording
// follows the independent bottle-photo ground truth; no model-accuracy claim.
const observedBody = '(1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.';
const read = (text: string, reason = 'Visible printed text'): Observation => ({ status: 'readable', text, reason });
const missing = (): Observation => ({ status: 'missing', text: null, reason: 'Not visible in this photo' });
const network = vi.fn(async () => { throw Error('Network forbidden'); });
beforeEach(() => { network.mockClear(); vi.stubGlobal('fetch', network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

async function setup() {
  const input = await groupInput(2);
  input.group.photos[0].role = 'front'; input.group.photos[1].role = 'back';
  input.group.application.brand = 'APPLICATION_ONLY_BRAND_7c3a';
  input.group.application.producerName = 'APPLICATION_ONLY_PRODUCER_7c3a';
  input.group.application.producerAddress = 'APPLICATION_ONLY_ADDRESS_7c3a';
  const prepared = await preparePhotoGroup(input);
  const request: GroupExtractionRequest = {
    schemaVersion: 2, photos: prepared.photos.map(p => ({ descriptor: p.descriptor, image: p.normalized.bytes })),
    photoSetSha256: prepared.photoSetSha256, ...groupAttemptIds(input.group.groupId, 1),
  };
  const output = photoEvidence(request.photos.map(p => p.descriptor.photoId));
  const [front, back] = output.photos.map(p => p.evidence);
  for (const e of [front, back]) {
    e.brand = read('Jose Cuervo'); e.classType = read('TEQUILA GOLD'); e.netContents = read('1.75 L');
  }
  front.abv = read('40% ALC/VOL', 'Small print in the bottom silver strip');
  front.origin = read('HECHO EN MEXICO');
  front.producer.name = { status: 'uncertain', text: 'FABRICA LA ROJENA', reason: 'Stylized seal' };
  front.producer.address = { status: 'uncertain', text: 'TEQUILA', reason: 'Locality only, not a complete address' };
  front.warning = { heading: missing(), body: missing(), headingBold: null, bodyBold: null };
  back.abv = missing(); back.origin = read('PRODUCT OF MEXICO');
  back.producer.name = read('La Rojeña', 'Distillery named in narrative; separately: IMPORTED & BOTTLED BY PROXIMO, LAWRENCEBURG, IN');
  back.producer.address = read('Jose Cuervo No. 73, Tequila, Jalisco, 46400 Mexico', 'Address block names La Rojeña');
  back.warning = { heading: read('GOVERNMENT WARNING:'), body: read(observedBody), headingBold: true, bodyBold: false };
  const store = new OfflineSpendStore();
  const transport = vi.fn(async (_url: string, _init: RequestInit) => Response.json({
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({schemaVersion:2,photos:output.photos.filter(p=>p.photoId===JSON.parse(JSON.parse(String(_init.body)).messages[1].content[0].text).photoId)}) } }],
  }));
  const provider = createOpenRouterGroupProvider({ authorized: true, apiKey: 'offline-only', store, maxCostMicrousd: 100, transport });
  const payload = () => JSON.parse(String(transport.mock.calls[0][1].body));
  return { input, request, output, store, transport, provider, payload };
}

const clarityCases = [
  ['whole-photo search and ABV', [/whole image/i, /neck/i, /bottom/i, /strip/i, /abv/i]],
  ['warning prefix/body split independent of case', [/warning\.heading.*prefix/i, /warning\.body.*remaining/i, /regardless of capitalization/i]],
  ['typography uncertainty, not uppercase equals bold', [/uppercase is not bold/i, /null.*unknown/i]],
  ['role-aware producer, not brand/street/importer', [/producer\.name/i, /distillery/i, /street name/i, /importer.*bottler/i, /role.*unclear.*uncertain/i]],
  ['raw fragments and independent photo provenance', [/address fragment.*uncertain/i, /never copy.*another photo/i, /do not translate/i]],
  ['concise reasons without reducing evidence', [/concise.*reason/i, /do not shorten.*transcriptions/i]],
] as const;
test.each(clarityCases)('group prompt clarifies %s', async (_name, patterns) => {
  const s = await setup(); expect((await s.provider.extractGroup(s.request)).processing).toBe('complete');
  const prompt = s.payload().messages[0].content;
  for (const pattern of patterns) expect(prompt).toMatch(pattern);
});

test('isolated guarded one-image payloads, compact schema, no application or canonical answers', async () => {
  const s = await setup();
  const result = await createGroupComparisonService({ provider: s.provider, authorize: () => true })(s.input);
  expect(result.processing).toBe('complete'); expect(s.transport).toHaveBeenCalledTimes(s.request.photos.length);
  const [url, init] = s.transport.mock.calls[0]; const payload = s.payload();
  expect(url).toBe(OPENROUTER_ENDPOINT); expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(Object.keys(payload).sort()).toEqual(['model', 'max_tokens', 'temperature', 'stream', 'provider', 'response_format', 'messages'].sort());
  expect(payload).toMatchObject({ model: OPENROUTER_MODEL, max_tokens: 2200, temperature: 0, stream: false, provider: { only: ['Anthropic'], allow_fallbacks: false, require_parameters: true }, response_format: { type: 'json_object' } });
  expect(payload.messages).toHaveLength(2);
  expect(payload.messages[1]).toEqual({ role: 'user', content: s.request.photos.slice(0,1).flatMap(p => [
    { type: 'text', text: JSON.stringify({ photoId: p.descriptor.photoId, role: p.descriptor.role }) },
    { type: 'image_url', image_url: { url: `data:${p.descriptor.normalized.mime};base64,${Buffer.from(p.image).toString('base64')}` } },
  ]) });
  expect(payload.max_tokens).toBeLessThanOrEqual(GROUP_OUTPUT_TOKENS);
  expect(payload.messages[0].content).toContain('"wireVersion":1');
  expect(payload.messages[0].content).toContain('"producer":{"name":O,"address":O}');
  expect(payload.messages[0].content).toContain('"headingBold":B,"bodyBold":B');
  for (const secret of [s.input.group.application.brand, s.input.group.application.producerName, s.input.group.application.producerAddress, 'Jose Cuervo', 'La Rojeña', 'PROXIMO', '40% ALC/VOL', WARNING_REFERENCE.heading, WARNING_REFERENCE.body, observedBody]) {
    expect(String(init.body)).not.toContain(secret);
  }
  for (const photo of s.input.group.photos) expect(String(init.body)).not.toContain(photo.filename);
  expect([...s.store.rows.values()][0]).toMatchObject({ state: 'unresolved', binding: { schemaVersion: 2, promptVersion: GROUP_PROMPT_VERSION, imageSha256: s.request.photoSetSha256 } });
  expect((await createGroupComparisonService({ provider: s.provider, authorize: () => true })(s.input)).processing).toBe('failed');
  expect(s.transport).toHaveBeenCalledTimes(s.request.photos.length);
});

test.each([false, null, true] as const)('mock output preserves separate warning parts, typography %s and role-specific raw observations', async bodyBold => {
  const s = await setup(); s.output.photos[1].evidence.warning.bodyBold = bodyBold;
  const expected = structuredClone(s.output); s.output.photos.reverse();
  const result = await s.provider.extractGroup(s.request);
  expect(result.processing).toBe('complete'); if (result.processing !== 'complete') throw Error('Expected complete');
  expect(result.evidence).toEqual(expected); // Restore request order only; never normalize or repair text.
  expect(result.metadata).toMatchObject({ schemaVersion: 2, promptVersion: GROUP_PROMPT_VERSION, photoSetSha256: s.request.photoSetSha256, photos: s.request.photos.map(p => ({ photoId: p.descriptor.photoId, imageSha256: p.descriptor.normalized.sha256 })) });
  expect(s.transport).toHaveBeenCalledTimes(s.request.photos.length);
});

test('mock altered wording/case and uncertain truncation are not silently repaired from reference or another photo', async () => {
  const s = await setup(); const warning = s.output.photos[1].evidence.warning;
  warning.heading.text = 'Government Warning';
  warning.body = { status: 'uncertain', text: '(1) WOMEN SHOULD DRINK', reason: 'Only this fragment can be read' };
  warning.headingBold = null; warning.bodyBold = null;
  const result = await s.provider.extractGroup(s.request);
  expect(result.processing).toBe('complete'); if (result.processing !== 'complete') throw Error('Expected complete');
  expect(result.evidence).toEqual(s.output); expect(s.transport).toHaveBeenCalledTimes(s.request.photos.length);
});

test.each([0, 1])('single-view mock %s retains missing fields without borrowing from the omitted photo', async index => {
  const s = await setup();
  s.request.photos = [s.request.photos[index]];
  s.request.photoSetSha256 = photoSetHash(s.request.photos.map(p => p.descriptor));
  s.output.photos = [s.output.photos[index]];
  const result = await s.provider.extractGroup(s.request);
  expect(result.processing).toBe('complete'); if (result.processing !== 'complete') throw Error('Expected complete');
  expect(result.evidence).toEqual(s.output);
  expect(s.payload().messages[1].content).toHaveLength(2);
  const evidence = result.evidence.photos[0].evidence;
  if (index === 0) {
    expect(evidence.abv.text).toBe('40% ALC/VOL'); expect(evidence.warning.body.status).toBe('missing');
  } else {
    expect(evidence.abv.status).toBe('missing'); expect(evidence.warning.body.text).toBe(observedBody);
  }
  expect(s.transport).toHaveBeenCalledTimes(s.request.photos.length);
});

test('an incorrectly mapped mock warning remains raw evidence, not a silent adapter rewrite or repair request', async () => {
  const s = await setup(); const warning = s.output.photos[1].evidence.warning;
  warning.heading = read(`GOVERNMENT WARNING: ${observedBody}`);
  warning.body = missing(); warning.bodyBold = null;
  const result = await s.provider.extractGroup(s.request);
  expect(result.processing).toBe('complete'); if (result.processing !== 'complete') throw Error('Expected complete');
  expect(result.evidence).toEqual(s.output); expect(s.transport).toHaveBeenCalledTimes(s.request.photos.length);
});

test('application accidentally added to provider request fails before reservation/dispatch', async () => {
  const s = await setup();
  expect(await s.provider.extractGroup({ ...s.request, application: s.input.group.application } as GroupExtractionRequest)).toEqual({ processing: 'failed', code: 'invalid-request' });
  expect(s.store.rows.size).toBe(0); expect(s.transport).not.toHaveBeenCalled();
});
