import { expect, test, vi } from 'vitest';
import { applicationSchema } from '../lib/contracts';
import { checkedPhotoRecord, finalizePhotoComparison, type CompletePhotoComparison } from '../lib/photo-record';
import { executeLiveGroup, type ReadyPhotoGroup } from '../lib/live-photo-client';
import { comparePhotoApplicationV8 } from '../lib/group-rules-v8';
import { aggregatePhotoEvidence as aggregateV3 } from '../lib/photo-evidence-v3';
import captured from './fixtures/bacardi-live-v8-composite.json';
import bacardiV7 from './fixtures/bacardi-live-v7.json';
import joseV7 from './fixtures/jose-live-v7.json';


const old = captured.result as CompletePhotoComparison;
const readable = (text: string) => ({ status: 'readable' as const, text, reason: 'Synthetic lexical regression; not provider extraction.' });
function fresh(record = old, photoEvidence = structuredClone(record.photoEvidence), application = record.application) {
  return finalizePhotoComparison(application, record.groupId, record.revision, record.photos, record.photoSetSha256, {
    processing: 'complete', evidence: photoEvidence,
    metadata: { ...record.extraction, source: record.source, rulesVersion: record.comparison.rulesVersion, photoSetSha256: record.photoSetSha256, photos: record.photos.map(p => ({ photoId: p.photoId, imageSha256: p.normalized.sha256 })) },
  });
}
function classes(front: string, back = front, declared = 'Gold Rum') {
  const set = structuredClone(old.photoEvidence);
  set.photos[0].evidence.classType = readable(front); set.photos[1].evidence.classType = readable(back);
  return fresh(old, set, { ...old.application, classType: declared });
}

test.each([['hosted Bacardi v8', old], ['Bacardi v7', bacardiV7.result], ['Jose v7', joseV7.result]])('%s historical record stays byte-exact', (_, record) => {
  expect(JSON.stringify(checkedPhotoRecord(record))).toBe(JSON.stringify(record));
});
test('actual hosted failure reproduced unchanged under frozen v8/v3, fresh finalizer fixes class only', () => {
  const before = JSON.stringify(old);
  expect(comparePhotoApplicationV8(old.application, old.photoEvidence)).toEqual(old.comparison);
  expect(aggregateV3(old.photoEvidence)).toEqual({ evidence: old.evidence, provenance: old.provenance });
  expect(old.comparison.fields.classType).toMatchObject({ status: 'mismatch', conflict: true });
  const next = fresh();
  expect(next.comparison.fields.classType).toMatchObject({ status: 'match', conflict: false, observed: old.photoEvidence.photos[0].evidence.classType, sourcePhotoIds: [old.photos[0].photoId] });
  expect(next.comparison.rulesRevision).toBe(9); expect(next.aggregationVersion).toBe('photo-set-aggregation-v4');
  expect(next.photoEvidence).toEqual(old.photoEvidence); expect(next.application).toEqual(old.application);
  expect(next.provenance.classType.variants).toEqual(old.provenance.classType.variants);
  for (const key of ['brand','abv','netContents','producer','origin','warning'] as const) expect(next.comparison.fields[key]).toEqual(old.comparison.fields[key]);
  expect(next.comparison.physicalPrintSize).toEqual(old.comparison.physicalPrintSize);
  expect(JSON.stringify(old)).toBe(before); expect(checkedPhotoRecord(next)).toEqual(next);
});
test.each(['GOLD RON SUPERIOR CARTA ORO','RUM GOLD','RON ORO','GOLD RUM ORO','ORO RUM GOLD','RON GOLD ORO GOLD','CARTA ORO RON SUPERIOR','Gold Ron Gold Oro','oro ron','RON SUPERIOR'])('bounded mixed/redundant rum words: %s', text => {
  const declared = text === 'RON SUPERIOR' ? 'Rum' : 'Gold Rum';
  expect(classes(text, text, declared).comparison.fields.classType).toMatchObject({ status: 'match', conflict: false });
});
test.each(['GOLD RUM SILVER','GOLD RON BLANCO','GOLD RUM DARK','GOLD RON OSCURO','GOLD RUM AGED','GOLD RUM SPICED','GOLD RUM COCONUT','NOT GOLD RUM','GOLD RUM 8','GOLD RUM 8 YEARS','GOLD RUM RESERVA','GOLD RUM COCKTAIL','GOLD RUM VODKA','GOLD RUM?','GOLD RUM/ORO','GOLD RHUM ORO'])('unknown, contradictory, age, flavor or punctuation is never discarded: %s', text => {
  const result = classes(text, 'Gold Rum');
  expect(result.comparison.fields.classType.status).not.toBe('match'); expect(result.provenance.classType.conflict).toBe(true);
  expect(result.photoEvidence.photos[0].evidence.classType.text).toBe(text);
});
test.each(['GOLD','ORO','GOLD ORO','SUPERIOR CARTA ORO','CARTA GOLD'])('missing category cannot prove rum: %s', text => {
  expect(classes(text).comparison.fields.classType.status).not.toBe('match');
});
test.each([['White Rum','BLANCO RUM WHITE'],['Dark Rum','OSCURO RON DARK'],['Aged Rum','AÑEJO RUM AGED'],['Spiced Rum','SPICED RUM SPICED'],['Rum','RON RUM SUPERIOR']])('all meaningful supported words retain existing style semantics: %s', (declared,actual) => {
  expect(classes(actual,actual,declared).comparison.fields.classType).toMatchObject({status:'match',conflict:false});
  expect(classes(actual,actual,'Rum').comparison.fields.classType.status).toBe('match');
});
test.each(['Rum Carta','Ron Carta Superior','Gold Ron Sin Alcohol','Gold Rum No Gold','Gold Rum Vanilla','Gold Rum Flavored','Gold Rum Nonalcoholic','Rum Gold Silver Oro'])('invalid designators, negations and modifiers remain non-green: %s', text => {
  expect(classes(text,text,'Rum').comparison.fields.classType.status).not.toBe('match');
});
test('style fragments retain directionality, contradictions, source specificity and all-pairs conflict checks', () => {
  expect(classes('GOLD RUM ORO','GOLD').comparison.fields.classType).toMatchObject({ status: 'match', conflict: false, sourcePhotoIds: [old.photos[0].photoId] });
  expect(classes('GOLD','GOLD RUM ORO').comparison.fields.classType).toMatchObject({ status: 'match', conflict: false, sourcePhotoIds: [old.photos[1].photoId] });
  expect(classes('GOLD RUM ORO','SILVER').comparison.fields.classType).toMatchObject({ status: 'mismatch', conflict: true });
  expect(classes('Rum').comparison.fields.classType.status).toBe('needs-review');
  expect(classes('White Rum').comparison.fields.classType.status).toBe('mismatch');
  const set = structuredClone(old.photoEvidence);
  set.photos[0].evidence.classType = readable('Rum'); set.photos[1].evidence.classType = readable('GOLD RUM ORO');
  set.photos.push({ ...structuredClone(set.photos[1]), photoId: '00000000-0000-4000-8000-000000000003', evidence: { ...structuredClone(set.photos[1].evidence), classType: readable('White Rum') } });
  // Public aggregate via a three-photo record with matching descriptor set.
  const record = { ...old, photos: [...old.photos, { ...old.photos[1], photoId: set.photos[2].photoId, sourceSha256: 'c'.repeat(64) }] };
  expect(fresh(record, set, { ...old.application, classType: 'Rum' }).provenance.classType.conflict).toBe(true);
});
test('no commodity/wine/tequila broadening and no uncertain evidence promotion', () => {
  const set = structuredClone(old.photoEvidence);
  for (const p of set.photos) p.evidence.classType = readable('GOLD RUM ORO');
  expect(fresh(old, set, { ...old.application, commodity: 'wine' }).comparison.fields.classType.status).not.toBe('match');
  expect(classes('GOLD TEQUILA ORO','GOLD TEQUILA ORO','Tequila Gold').comparison.fields.classType.status).not.toBe('match');
  for (const p of set.photos) p.evidence.classType.status = 'uncertain';
  expect(fresh(old, set).comparison.fields.classType.status).toBe('needs-review');
});
test('fresh Jose retains findings and v9 intake/digest serialization rejects forged tuple or relabeled v8', async () => {
  const jose = joseV7.result as CompletePhotoComparison, next = fresh(jose);
  expect(Object.values(next.comparison.fields).map(f=>f.status)).toEqual(Object.values(jose.comparison.fields).map(f=>f.status));
  expect(applicationSchema.parse(old.application)).toEqual(old.application);
  expect(checkedPhotoRecord(JSON.parse(JSON.stringify(fresh())))).toEqual(fresh());
  for (const [rulesRevision,aggregationVersion] of [[9,'photo-set-aggregation-v3'],[8,'photo-set-aggregation-v4'],[7,'photo-set-aggregation-v4'],['9','photo-set-aggregation-v4'],[9,null]]) expect(checkedPhotoRecord({ ...fresh(), aggregationVersion, comparison: { ...fresh().comparison, rulesRevision } })).toBeNull();
  expect(checkedPhotoRecord({ ...old, aggregationVersion: 'photo-set-aggregation-v4', comparison: { ...old.comparison, rulesRevision: 9 } })).toBeNull();
  for(const patch of [{source:'fixture'},{recordVersion:'2'},{extraction:{...next.extraction,model:'anthropic/claude-haiku-4.5'}},{extraction:{...next.extraction,promptVersion:'photo-set-observations-v2'}},{extraction:{...next.extraction,schemaVersion:'2'}}])expect(checkedPhotoRecord({...next,...patch})).toBeNull();
});
test('actual browser execute admission consumes serialized v9 and rejects cross-version/forged findings (offline transport only)', async () => {
  const next = fresh(), group = { schemaVersion: 2 as const, groupId: old.groupId, revision: old.revision, application: old.application, photos: old.photos.map(({photoId,role,filename,mime,bytes})=>({photoId,role,filename,mime,bytes})) };
  const ready = { group, files: group.photos.map(p=>new File([new Uint8Array(p.bytes)],p.filename,{type:p.mime})), prepared: { schemaVersion: 2, groupId: group.groupId, revision: group.revision, photoSetSha256: old.photoSetSha256, photos: old.photos, attemptId: 'attemptId' in old.extraction ? old.extraction.attemptId : '', reservationId: 'reservationId' in old.extraction ? old.extraction.reservationId : '', binding: old.photoSetSha256+'.'+'a'.repeat(64) } } as ReadyPhotoGroup;
  const transport = vi.fn<typeof fetch>(async()=>Response.json({ result: next }));
  expect((await executeLiveGroup(ready,'offline',new AbortController().signal,transport)).result).toEqual(next);
  transport.mockImplementation(async()=>Response.json({ result: { ...next, aggregationVersion: 'photo-set-aggregation-v3' } }));
  await expect(executeLiveGroup(ready,'offline',new AbortController().signal,transport)).rejects.toThrow('invalid-extraction');
  transport.mockImplementation(async()=>Response.json({ result: { ...next, comparison: { ...next.comparison, fields: { ...next.comparison.fields, classType: { ...next.comparison.fields.classType, status: 'mismatch' } } } } }));
  await expect(executeLiveGroup(ready,'offline',new AbortController().signal,transport)).rejects.toThrow('invalid-extraction');
});
