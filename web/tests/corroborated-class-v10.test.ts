import { expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checkedPhotoRecord, finalizePhotoComparison, type CompletePhotoComparison } from '../lib/photo-record';
import { comparePhotoApplicationV9 } from '../lib/group-rules-v9';
import { aggregatePhotoEvidence as aggregateV4 } from '../lib/photo-evidence-v4';
import { executeLiveGroup, type ReadyPhotoGroup } from '../lib/live-photo-client';
import { EvidenceTable } from '../components/EvidenceReview';
import capture from './fixtures/bacardi-live-v9-corroboration.json';
import v8 from './fixtures/bacardi-live-v8-composite.json';
import bacardi from './fixtures/bacardi-live-v7.json';
import jose from './fixtures/jose-live-v7.json';

const old = capture.record as CompletePhotoComparison;
const readable = (text: string) => ({status:'readable' as const,text,reason:'Synthetic regression, not model output.'});
function fresh(record = old, set = structuredClone(record.photoEvidence), application = record.application) {
  return finalizePhotoComparison(application,record.groupId,record.revision,record.photos,record.photoSetSha256,{
    processing:'complete',evidence:set,metadata:{...record.extraction,source:record.source,rulesVersion:record.comparison.rulesVersion,photoSetSha256:record.photoSetSha256,photos:record.photos.map(p=>({photoId:p.photoId,imageSha256:p.normalized.sha256}))},
  });
}
function sample(front = 'GOLD', back = 'GOLD', origin = 'RUM OF PUERTO RICO', declared = 'Gold Rum') {
  const set = structuredClone(old.photoEvidence);
  set.photos[0].evidence.classType = readable(front);
  set.photos[0].evidence.origin = {status:'missing',text:null,reason:'No origin in this synthetic view.'};
  set.photos[1].evidence.classType = readable(back);
  set.photos[1].evidence.origin = readable(origin);
  return fresh(old,set,{...old.application,classType:declared});
}

test.each([['saved hosted v9',old],['saved hosted v8',v8.result],['Bacardi v7',bacardi.result],['Jose v7',jose.result]])('%s remains byte-exact',(_,record)=>{
  expect(JSON.stringify(checkedPhotoRecord(record))).toBe(JSON.stringify(record));
});
test('actual hosted v9 capture: unchanged extraction and application gives six matches only in fresh v10/v5',()=>{
  expect(createHash('sha256').update(readFileSync(new URL('./fixtures/bacardi-live-v9-corroboration.json',import.meta.url))).digest('hex')).toBe('2c9c6b00e57c2512f5eb9b8447a4dce35dfb7488cba4d983dbfaac095c169b3f');
  expect(comparePhotoApplicationV9(old.application,old.photoEvidence)).toEqual(old.comparison);
  expect(aggregateV4(old.photoEvidence)).toEqual({evidence:old.evidence,provenance:old.provenance});
  expect(Object.values(old.comparison.fields).map(f=>f.status).sort()).toEqual(['match','match','match','match','match','needs-review','not-applicable']);
  const next = fresh();
  expect(next.comparison.rulesRevision).toBe(10); expect(next.aggregationVersion).toBe('photo-set-aggregation-v5');
  expect(next.comparison.fields.classType).toMatchObject({status:'match',conflict:false,observed:old.photoEvidence.photos[1].evidence.classType,sourcePhotoIds:[old.photos[1].photoId]});
  expect(Object.values(next.comparison.fields).map(f=>f.status).sort()).toEqual(['match','match','match','match','match','match','not-applicable']);
  const reason = next.comparison.fields.classType.reasons.join(' ');
  expect(reason).toContain('GOLD'); expect(reason).toContain('RUM OF PUERTO RICO'); expect(reason).toContain(old.photos[1].photoId); expect(reason).toContain('same-photo');
  expect(next.photoEvidence).toEqual(old.photoEvidence); expect(next.application).toEqual(old.application); expect(next.extraction).toEqual(old.extraction); expect(next.photos).toEqual(old.photos);
  expect(next.provenance.classType).toEqual(old.provenance.classType);
  expect(next.evidence.classType).toEqual(old.photoEvidence.photos[1].evidence.classType);
  expect(next.evidence.origin).toEqual(old.evidence.origin);
  for (const key of ['brand','abv','netContents','producer','origin','warning'] as const) expect(next.comparison.fields[key]).toEqual(old.comparison.fields[key]);
  expect(next.comparison.physicalPrintSize).toEqual(old.comparison.physicalPrintSize); expect(next.comparison.physicalPrintSize.status).toBe('unverified');
  expect(checkedPhotoRecord(JSON.parse(JSON.stringify(next)))).toEqual(next);
});
test.each(['RUM OF PUERTO RICO','RON DE CUBA','Rum of Mexico','Ron de México','RUM OF FRANCE','RON DE PR',' rum\nOF\tCanada '])('whole supported category origin: %s',origin=>{
  expect(sample('GOLD','GOLD',origin).comparison.fields.classType.status).toBe('match');
});
test.each(['MADE IN PUERTO RICO','Puerto Rico','For rum cocktails from Puerto Rico','HISTORY OF RUM OF PUERTO RICO','RUM OF PUERTO RICO AND VODKA','RUM OF PUERTO RICO?','RUM OF UNKNOWNLAND','RUM OF MADE IN MEXICO','RUM OF PRODUCT OF MEXICO','RON DE RUM OF CUBA','NOT RUM OF CUBA','RUM OF CUBA SINCE 1862','RUM OF CUBA, FRANCE','BACARDI RUM OF PUERTO RICO','RUM OF CATAÑO, PR 00962'])('non-complete origin cannot supply category: %s',origin=>{
  expect(sample('GOLD','GOLD',origin).comparison.fields.classType.status).toBe('needs-review');
});
test.each(['GOLD COCONUT','GOLD 8','GOLD 8 YEARS','GOLD EXTRA','GOLD SILVER','GOLD?','VODKA','SILVER','GOLD RUM VODKA'])('unknown and contradictory fragments stay non-green: %s',text=>{
  expect(sample(text,'GOLD').comparison.fields.classType.status).not.toBe('match');
  expect(sample(text,text).comparison.fields.classType.status).not.toBe('match');
});
test('same-photo category contradiction cannot green even if application agrees with literal vodka',()=>{
  expect(sample('Vodka','Vodka','RUM OF PUERTO RICO','Vodka').comparison.fields.classType).toMatchObject({status:'mismatch',conflict:true});
  expect(sample('Vodka','Vodka','RUM OF PUERTO RICO','Vodka').comparison.fields.classType.reasons.join(' ')).not.toContain('agree with the declaration');
});
test.each(['uncertain','unreadable','missing'] as const)('origin/class %s is not positive category evidence',status=>{
  const set = structuredClone(old.photoEvidence);
  set.photos[1].evidence.origin.status = status;
  if(status === 'missing') set.photos[1].evidence.origin.text = null;
  expect(fresh(old,set).comparison.fields.classType.status).toBe('needs-review');
  set.photos[1].evidence.origin = readable('RUM OF PUERTO RICO');
  set.photos[1].evidence.classType = {status,text:null,reason:'No readable class on category-origin photo.'};
  expect(fresh(old,set).comparison.fields.classType.status).not.toBe('match');
});
test('category not transplanted from a separate photo, producer, brand or warning',()=>{
  const set = structuredClone(old.photoEvidence);
  set.photos[0].evidence.origin = readable('RUM OF PUERTO RICO');
  set.photos[0].evidence.classType = {status:'missing',text:null,reason:'Absent'};
  set.photos[1].evidence.origin = readable('Made in Puerto Rico');
  expect(fresh(old,set).comparison.fields.classType.status).toBe('needs-review');
  for(const p of set.photos) { p.evidence.classType = readable('GOLD'); p.evidence.origin = readable('Made in Puerto Rico'); p.evidence.brand = readable('RUM OF PUERTO RICO'); p.evidence.producer.name = readable('RUM OF PUERTO RICO'); p.evidence.producer.address = readable('RUM OF PUERTO RICO'); p.evidence.warning.body = readable('RUM OF PUERTO RICO'); }
  expect(fresh(old,set).comparison.fields.classType.status).toBe('needs-review');
});
test('arbitrary IDs/roles/order cite actual corroborating photo; generic category cannot bridge subtype conflicts',()=>{
  const record = structuredClone(old), set = record.photoEvidence;
  for(let i=0;i<record.photos.length;i++){ const id=`00000000-0000-4000-8000-00000000000${i+1}`;record.photos[i].photoId=id;record.photos[i].role='other';set.photos[i].photoId=id; }
  record.photos.reverse(); set.photos.reverse();
  const next=fresh(record,set);
  expect(next.comparison.fields.classType.sourcePhotoIds).toEqual([record.photos[0].photoId]);
  expect(next.comparison.fields.classType.reasons.join(' ')).toContain(record.photos[0].photoId);
  expect(sample('Rum','GOLD').comparison.fields.classType.status).toBe('match');
  expect(sample('White Rum','GOLD','RUM OF CUBA','Rum').comparison.fields.classType.status).not.toBe('match');
  expect(sample('GOLD','GOLD','RUM OF CUBA','White Rum').comparison.fields.classType.status).toBe('mismatch');
});
test('Jose unchanged; strict replay forbids forged version tuples, origin certainty, observed and reasons',()=>{
  const joseRecord = jose.result as CompletePhotoComparison;
  expect(fresh(joseRecord).comparison.fields).toEqual(comparePhotoApplicationV9(joseRecord.application,joseRecord.photoEvidence).fields);
  expect(Object.values(fresh(joseRecord).comparison.fields).map(f=>f.status)).toEqual(Object.values(joseRecord.comparison.fields).map(f=>f.status));
  const next=fresh();
  for(const revision of [4,6,7,8,9,'10',null]) expect(checkedPhotoRecord({...next,comparison:{...next.comparison,rulesRevision:revision}})).toBeNull();
  for(const aggregationVersion of ['photo-set-aggregation-v1','photo-set-aggregation-v2','photo-set-aggregation-v3','photo-set-aggregation-v4',null]) expect(checkedPhotoRecord({...next,aggregationVersion})).toBeNull();
  for(const patch of [{source:'fixture'},{recordVersion:'2'},{extraction:{...next.extraction,model:'anthropic/claude-haiku-4.5'}},{extraction:{...next.extraction,promptVersion:'photo-set-observations-v2'}},{extraction:{...next.extraction,schemaVersion:'2'}}]) expect(checkedPhotoRecord({...next,...patch})).toBeNull();
  for(const patch of [{observed:readable('Gold Rum')},{reasons:['Matches']},{sourcePhotoIds:[old.photos[0].photoId]}]) expect(checkedPhotoRecord({...next,comparison:{...next.comparison,fields:{...next.comparison.fields,classType:{...next.comparison.fields.classType,...patch}}}})).toBeNull();
  const forged=structuredClone(next);forged.photoEvidence.photos[1].evidence.origin.status='uncertain';expect(checkedPhotoRecord(forged)).toBeNull();
});
test('all-pairs check cannot bridge gold/white via generic Rum; no wine category promotion',()=>{
  const record=structuredClone(old), set=record.photoEvidence;
  set.photos[0].evidence.classType=readable('Rum');
  const thirdId='00000000-0000-4000-8000-000000000003';
  record.photos.push({...structuredClone(record.photos[1]),photoId:thirdId,sourceSha256:'c'.repeat(64)});
  set.photos.push({...structuredClone(set.photos[1]),photoId:thirdId});
  set.photos[2].evidence.classType=readable('WHITE');
  const next=fresh(record,set,{...record.application,classType:'Rum'});
  expect(next.comparison.fields.classType.status).not.toBe('match'); expect(next.provenance.classType.conflict).toBe(true);
  expect(fresh(old,old.photoEvidence,{...old.application,commodity:'wine'}).comparison.fields.classType.status).not.toBe('match');
});
test('actual evidence table keeps GOLD raw and exposes exact origin/photo justification in match details',()=>{
  const html=renderToStaticMarkup(createElement(EvidenceTable,{record:fresh()}));
  const row=html.match(/<tr[^>]*data-field="classType"[\s\S]*?<\/tr>/)![0];
  expect(row).toContain('data-title="Observed"><div>GOLD');
  expect(row).toContain('raw-observation">GOLD');
  expect(row).not.toContain('raw-observation">gold rum');
  expect(row).toContain('same-photo origin &quot;RUM OF PUERTO RICO&quot;');
  expect(row).toContain(old.photos[1].photoId); expect(row).toContain('Check details');
});
test('actual browser execute accepts v10/v5 offline transport and rejects mismatched tuple',async()=>{
  const next=fresh(),group={schemaVersion:2 as const,groupId:old.groupId,revision:old.revision,application:old.application,photos:old.photos.map(({photoId,role,filename,mime,bytes})=>({photoId,role,filename,mime,bytes}))};
  const ready={group,files:group.photos.map(p=>new File([new Uint8Array(p.bytes)],p.filename,{type:p.mime})),prepared:{schemaVersion:2,groupId:group.groupId,revision:group.revision,photoSetSha256:old.photoSetSha256,photos:old.photos,attemptId:'attemptId' in old.extraction?old.extraction.attemptId:'',reservationId:'reservationId' in old.extraction?old.extraction.reservationId:'',binding:old.photoSetSha256+'.'+'a'.repeat(64)}} as ReadyPhotoGroup;
  const transport=vi.fn<typeof fetch>(async()=>Response.json({result:next}));
  expect((await executeLiveGroup(ready,'offline',new AbortController().signal,transport)).result).toEqual(next);
  transport.mockImplementation(async()=>Response.json({result:{...next,aggregationVersion:'photo-set-aggregation-v4'}}));
  await expect(executeLiveGroup(ready,'offline',new AbortController().signal,transport)).rejects.toThrow('invalid-extraction');
});
