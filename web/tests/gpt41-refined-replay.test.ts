import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { GPT41_PHOTO_PROMPT } from '../lib/extraction/gpt41-prompt';
import { gpt41JsonSchema, parseGpt41Wire } from '../lib/extraction/gpt41-wire';
import { parseGpt41Envelope, GPT41_MODEL, GPT41_PROMPT_VERSION } from '../lib/extraction/gpt41';
import { makeGpt41Request } from '../lib/extraction/gpt41-pricing';
import { finalizePhotoComparison, checkedPhotoRecord } from '../lib/photo-record';
import { groupAttemptIds } from '../lib/group-binding';
import { ReviewStore } from '../lib/review-store';
import { newReviewIntent } from '../lib/review-policy';
import { comparePhotoApplication } from '../lib/group-rules';
import { executeLiveGroup } from '../lib/live-photo-client';
import { preparedGroupSchema } from '../lib/photo-contracts';
import { groupFixture } from './fixtures/photo-groups';
import { privateLedgerDir } from './fixtures/private-ledger';
import { application } from './fixtures/jose-cuervo';
import front from './fixtures/gpt41-refined-envelope-0.json';
import back from './fixtures/gpt41-refined-envelope-1.json';
import originalFront from './fixtures/gpt41-benchmark-envelope-0.json';
import originalBack from './fixtures/gpt41-benchmark-envelope-1.json';
import originalRequest from './fixtures/gpt41-benchmark-request-redacted.json';

const captured = [front, back];
const wires = () => captured.map(e => JSON.parse(e.choices[0].message.content));
const network = vi.fn(() => { throw Error('Network forbidden'); });
beforeEach(() => { network.mockClear(); vi.stubGlobal('fetch', network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const fixtureBytes = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function replay(envelopes = captured) {
  // Tiny generated media exercise custody only. Captured label responses are
  // replayed, NOT claimed to have been extracted from these synthetic images.
  const f = await groupFixture(2);
  const evidence = { schemaVersion: 2, photos: envelopes.map((e, i) => ({ photoId: f.record.photos[i].photoId, evidence: parseGpt41Envelope(e) })) };
  const record = finalizePhotoComparison(application, f.record.groupId, 1, f.record.photos, f.record.photoSetSha256, {
    ...f.extraction, evidence, metadata: { ...f.extraction.metadata, source: 'openrouter', model: GPT41_MODEL, promptVersion: GPT41_PROMPT_VERSION, ...groupAttemptIds(f.record.groupId, 1) },
  });
  return { ...f, record };
}
function meaningfulMatches(record: Awaited<ReturnType<typeof replay>>['record']) {
  expect(record.comparison.rulesRevision).toBe(7);
  expect(Object.keys(record.comparison.fields)).toHaveLength(7);
  for (const field of Object.values(record.comparison.fields)) {
    expect(field.status).toBe('match');
    expect(field.sourcePhotoIds.length).toBeGreaterThan(0);
    expect(field.conflict).toBe(false);
  }
  expect(record.comparison.physicalPrintSize.status).toBe('unverified');
  expect(record.comparison.fields.producer.sourcePhotoIds).toEqual([record.photos[1].photoId]);
  expect(record.evidence.producer.name.text).toBe('La Rojeña');
  expect(record.evidence.producer.address.text).toBe('Jose Cuervo No. 73, Tequila, Jalisco, 46400 Mexico');
}

test('production prompt and schema bytes equal the captured successful refined exports, not the old baseline', () => {
  const prompt = fixtureBytes('gpt41-refined-prompt.txt'), schema = fixtureBytes('gpt41-refined-schema.json');
  expect(Buffer.from(GPT41_PHOTO_PROMPT)).toEqual(prompt);
  expect(Buffer.from(JSON.stringify(gpt41JsonSchema, null, 2) + '\n')).toEqual(schema);
  const body = makeGpt41Request(Buffer.from('offline'), 'image/jpeg');
  expect(body.messages[0].content).toBe(prompt.toString('utf8'));
  expect(JSON.stringify(body.response_format.json_schema.schema, null, 2) + '\n').toBe(schema.toString('utf8'));
  // All routing/schema/user-message settings remain identical to the original
  // captured request. Only prompt refinement differs; original fixture untouched.
  const expected = structuredClone(originalRequest);
  expected.messages[0].content = GPT41_PHOTO_PROMPT;
  const content = body.messages[1].content;
  if (!Array.isArray(content) || !content[1].image_url) throw Error('Expected image');
  content[1].image_url.url = '[IMAGE OMITTED]';
  expect(body).toEqual(expected);
  expect(originalRequest.messages[0].content).not.toBe(GPT41_PHOTO_PROMPT);
  expect(digest(prompt)).toBe('d4b16230c52d3c786560ac7e503d1e9bdb7b0436b36bf51581a6b173ba39cee3');
  expect(digest(schema)).toBe('81a66789c80e6197cb7e0fc8f4c5d3c4489ae917092547dadde1a81396f938af');
  expect(digest(fixtureBytes('gpt41-refined-envelope-0.json'))).toBe('01f0828b0b0847f723c03a08d0c800c01ee8104ecdefacb5ba7b99b0a938dd80');
  expect(digest(fixtureBytes('gpt41-refined-envelope-1.json'))).toBe('267b0b284ab74af5b54aae71fcadb3435cde5c56928dba0f1342e91c017a694e');
});

test('actual production parse -> finalize yields seven sourced matches despite null + uncertainty on opposite photo', async () => {
  const original = JSON.stringify(captured), wire = wires();
  const frontEvidence = parseGpt41Wire(wire[0]), backEvidence = parseGpt41Wire(wire[1]);
  // Preserve conservative parser states. A null observation is no identity
  // variant; an independently readable view wins in existing aggregation v2.
  expect(frontEvidence.producer.name).toMatchObject({ status: 'unreadable', text: null });
  expect(backEvidence.brand).toMatchObject({ status: 'unreadable', text: null });
  const { record } = await replay();
  meaningfulMatches(record);
  expect(record.photoEvidence.photos.map(p => p.evidence)).toEqual([frontEvidence, backEvidence]);
  for (const [i, p] of record.photoEvidence.photos.entries()) {
    for (const key of ['brand', 'classType', 'abv', 'netContents', 'origin'] as const) expect(p.evidence[key].text).toBe(wire[i][key]);
    for (const key of ['name', 'address'] as const) expect(p.evidence.producer[key].text).toBe(wire[i].producer[key]);
    for (const key of ['heading', 'body'] as const) expect(p.evidence.warning[key].text).toBe(wire[i].warning[key]);
    expect(p.evidence.warning.headingBold).toBe(wire[i].warning.headingBold);
    expect(p.evidence.warning.bodyBold).toBe(wire[i].warning.bodyBold);
  }
  expect(JSON.stringify(captured)).toBe(original);
});

test('captured refined replay saves/reopens unchanged alongside retained original benchmark history', async () => {
  const fresh = await replay(), old = await replay([originalFront, originalBack]);
  // Recreate the pre-refinement revision explicitly; history must not upgrade.
  old.record.comparison = comparePhotoApplication(old.record.application, old.record.photoEvidence);
  const dir = privateLedgerDir(), path = join(dir, 'reviews.sqlite');
  let store: ReviewStore | undefined;
  try {
    ReviewStore.provision(path); ReviewStore.migratePhotos(path); store = new ReviewStore(path);
    const save = (f: typeof fresh) => {
      const comparisonId = store!.snapshotGroup(f.record, f.photos);
      const request = { comparisonId, idempotencyKey: randomUUID(), intent: { ...newReviewIntent(f.record), outcome: 'second-review', confirmed: true, notes: 'Offline captured response replay; physical dimensions remain unverified.' } };
      return { request, receipt: store!.save(request), serialized: JSON.stringify(f.record) };
    };
    const original = save(old), refined = save(fresh);
    store.close(); store = new ReviewStore(path);
    for (const saved of [original, refined]) {
      expect(store.save(saved.request)).toEqual(saved.receipt);
      const reopened = store.detail(saved.receipt.reviewId);
      expect(JSON.stringify(reopened.record)).toBe(saved.serialized);
      expect(reopened.intent).toEqual(saved.request.intent);
      expect(checkedPhotoRecord(reopened.record)).toEqual(reopened.record);
    }
    const reopened = checkedPhotoRecord(store.detail(refined.receipt.reviewId).record);
    if (!reopened) throw Error('Expected replayable record');
    meaningfulMatches(reopened);
    expect(checkedPhotoRecord({ ...reopened, comparison: { ...reopened.comparison, rulesRevision: 6 } })).toBeNull();
    for (const p of fresh.photos) for (const variant of ['original', 'normalized'] as const) expect(store.evidence(refined.receipt.reviewId, { photoId: p.photoId, variant }).bytes).toEqual(p[variant]);
    expect(store.list()).toHaveLength(2);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('browser production client admits the bound refined revision and rejects a forged finding', async () => {
  vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT', '');
  const f = await replay(), record = f.record;
  const group = { ...f.input.group, application: record.application };
  const files = f.input.files.map(p => new File([new Uint8Array(p.image.bytes)], p.image.filename, { type: p.image.mime }));
  const prepared = preparedGroupSchema.parse({ schemaVersion: 2, groupId: group.groupId, revision: 1, photos: record.photos, photoSetSha256: record.photoSetSha256, ...groupAttemptIds(group.groupId, 1), binding: record.photoSetSha256 + '.' + 'b'.repeat(64) });
  const ready = { group, files, prepared };
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: record }));
  expect((await executeLiveGroup(ready, 'offline', AbortSignal.timeout(5000), transport)).result).toEqual(record);
  const forged = structuredClone(record); forged.comparison.fields.abv.observed.text = '40% alc/vol';
  transport.mockResolvedValue(Response.json({ result: forged }));
  await expect(executeLiveGroup(ready, 'offline', AbortSignal.timeout(5000), transport)).rejects.toThrow('invalid-extraction');
});

test.each(['producer-role', 'producer-identity', 'producer-address', 'warning-case', 'warning-clause', 'abv', 'classType'])('captured replay does not erase or bless a genuine %s defect', async fault => {
  const changed = structuredClone(captured), wire = wires();
  if (fault === 'producer-role') wire[1].producer.roleEvidence = null;
  if (fault === 'producer-identity') { wire[1].producer.name = 'Other Distillery'; wire[1].producer.roleEvidence = 'Produced by Other Distillery'; }
  if (fault === 'producer-address') wire[1].producer.address = wire[1].producer.address.replace('No. 73', 'No. 74');
  if (fault === 'warning-case') wire[1].warning.heading = 'Government Warning:';
  if (fault === 'warning-clause') wire[1].warning.body = wire[1].warning.body.replace('BIRTH DEFECTS', 'HEADACHES');
  if (fault === 'abv') wire[0].abv = '35% Alc./Vol.';
  if (fault === 'classType') wire[0].classType = 'Vodka';
  changed.forEach((e, i) => { e.choices[0].message.content = JSON.stringify(wire[i]); });
  const { record } = await replay(changed);
  const key = fault.startsWith('producer') ? 'producer' : fault.startsWith('warning') ? 'warning' : fault === 'abv' ? 'abv' : 'classType';
  expect(record.comparison.fields[key].status).toBe(fault === 'producer-role' || fault === 'producer-identity' ? 'needs-review' : 'mismatch');
  expect(record.photoEvidence.photos[1].evidence.producer.address.text).toBe(wire[1].producer.address);
});
