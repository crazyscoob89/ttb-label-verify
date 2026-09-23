import { expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Review from '../app/review/page';
import { applicationSchema, type Application } from '../lib/contracts';
import { checkedPhotoRecord, finalizePhotoComparison, type CompletePhotoComparison } from '../lib/photo-record';
import type { PhotoSetEvidence } from '../lib/photo-contracts';
import { aggregatePhotoEvidence } from '../lib/photo-evidence-v3';
import bacardi from './fixtures/bacardi-live-v7.json';
import jose from './fixtures/jose-live-v7.json';

// Exact retained production APPLICATION COMPARISON responses, not invented provider wire.
const old = bacardi.result as CompletePhotoComparison;
const domestic = { ...old.application, imported: false, origin: { kind: 'domestic' as const, country: 'Puerto Rico' } };
const imported = { ...old.application, origin: { kind: 'imported' as const, country: 'Mexico' } };
const readable = (text: string) => ({ status: 'readable' as const, text, reason: 'Synthetic regression observation, not a new extraction.' });
function fresh(application: Application = imported, evidence: PhotoSetEvidence = structuredClone(old.photoEvidence), record = old) {
  return finalizePhotoComparison(application, record.groupId, record.revision, record.photos, record.photoSetSha256, {
    processing: 'complete', evidence,
    metadata: { ...record.extraction, source: record.source, rulesVersion: record.comparison.rulesVersion, photoSetSha256: record.photoSetSha256, photos: record.photos.map(p => ({ photoId: p.photoId, imageSha256: p.normalized.sha256 })) },
  });
}
function field(key: 'brand'|'classType'|'netContents'|'origin'|'abv', expected: string, actual: string, second = actual, app: Application = imported) {
  const evidence = structuredClone(old.photoEvidence);
  evidence.photos[0].evidence[key] = readable(actual); evidence.photos[1].evidence[key] = readable(second);
  const application = key === 'origin' ? { ...app, origin: { ...app.origin, country: expected } } : key === 'abv' ? { ...app, abv: Number(expected) } : { ...app, [key]: expected };
  return fresh(application, evidence).comparison.fields[key];
}

test.each([['Bacardi', bacardi.result], ['Jose', jose.result]])('exact frozen %s production response still replays byte-for-byte', (_, value) => {
  expect(JSON.stringify(checkedPhotoRecord(value))).toBe(JSON.stringify(value));
});
test('fresh Bacardi replay repairs brand/volume, uses truthful domestic PR context, but cannot manufacture RUM from GOLD', () => {
  const before = JSON.stringify(old), result = fresh(domestic);
  expect(result.comparison.rulesRevision).toBe(8); expect(result.aggregationVersion).toBe('photo-set-aggregation-v3');
  expect(result.application).toEqual(domestic); expect(result.photoEvidence).toEqual(old.photoEvidence);
  expect(result.comparison.fields.brand).toMatchObject({ status: 'match', conflict: false });
  expect(result.comparison.fields.netContents).toMatchObject({ status: 'match', conflict: false });
  expect(result.comparison.fields.classType.status).not.toBe('match');
  expect(result.comparison.fields.origin.status).toBe('not-applicable');
  for (const key of ['producer', 'warning', 'abv'] as const) expect(result.comparison.fields[key].status).toBe('match');
  expect(result.provenance.brand.variants.map(v=>v.value)).toEqual(['BACARDÍ','BACARDI']);
  expect(result.provenance.netContents.variants.map(v=>v.value)).toEqual(['1.75 L','1.75 LTR']);
  expect(result.comparison.physicalPrintSize.status).toBe('unverified');
  expect(JSON.stringify(old)).toBe(before); expect(checkedPhotoRecord(result)).toEqual(result);
});
test('exact frozen Jose real observations remain seven matching fields under fresh rules', () => {
  const record = jose.result as CompletePhotoComparison;
  const result = fresh(record.application, record.photoEvidence, record);
  expect(result.photoEvidence).toEqual(record.photoEvidence);
  expect(Object.values(result.comparison.fields).map(f=>f.status)).toEqual(Object.values(record.comparison.fields).map(f=>f.status));
});
test.each([['Rhum Clément 10','RHUM CLEMENT 10'],['Viña Sol','VINA SOL'],['Château Étoile','CHATEAU ETOILE']])('Latin diacritics only: %s', (a,b) => {
  expect(field('brand',a,b,a)).toMatchObject({status:'match',conflict:false});
});
test.each(['Clement 12','Clement Reserve 10','Clement-10','Clement'])('brand tokens, punctuation and numbers retained: %s', b => {
  expect(field('brand','Clement 10',b,'Clement 10')).toMatchObject({status:'mismatch',conflict:true});
});
test.each(['1.75 LTR','1.750 liter','1.75 litre','1.75 liters','1.75 litres','1750 mL','1750ml',' 1.750 l '])('exact positive metric amounts agree: %s', b => {
  expect(field('netContents','1.75 L',b,'1750mL')).toMatchObject({status:'match',conflict:false});
});
test.each(['1.7501 LTR','175 mL','1.75 mL','2 litres'])('real volume differences survive: %s', b => {
  expect(field('netContents','1.75 L',b,'1.75 L')).toMatchObject({status:'mismatch',conflict:true});
});
test.each(['-1.75 LTR','0 LTR','1,75 LTR','1.75 gal','1.75 LTR extra','1.75 L / 1750 mL','1e3 mL'])('unsupported or invalid volume never matches: %s', b => {
  expect(field('netContents',b,b).status).toBe('needs-review');
});
test.each(['Rum','Gold Rum','RON','RON SUPERIOR CARTA ORO','Ron Oro','Dark Rum','White Rum','Aged Rum'])('generic rum compatible with explicit supported rum designation: %s', text => {
  expect(field('classType','Rum',text,'Rum')).toMatchObject({status:'match',conflict:false});
});
test.each(['GOLD','Gold Vodka','Tequila Gold','RUM COCKTAIL','Gold Rum flavored vodka'])('not rum evidence by substring/color alone: %s', text => {
  expect(field('classType','Rum',text).status).not.toBe('match');
});
test('rum subtypes are directional; generic cannot bridge contradictory gold/white', () => {
  expect(field('classType','Gold Rum','Rum').status).toBe('needs-review');
  expect(field('classType','Gold Rum','White Rum').status).toBe('mismatch');
  expect(field('classType','Gold Rum','RON SUPERIOR CARTA ORO','Gold Rum')).toMatchObject({status:'match',conflict:false});
  expect(field('classType','Rum','Gold Rum','White Rum')).toMatchObject({status:'needs-review',conflict:true});
  const set = structuredClone(old.photoEvidence);
  set.photos[0].evidence.classType = readable('Rum'); set.photos[1].evidence.classType = readable('Gold Rum');
  const third = structuredClone(set.photos[1]); third.photoId='00000000-0000-4000-8000-000000000003'; third.evidence.classType=readable('White Rum');
  set.photos.push(third);
  expect(aggregatePhotoEvidence(set).provenance.classType.conflict).toBe(true);
});
test('rum compatibility is commodity-bound; wine behavior and real class differences remain', () => {
  expect(field('classType','Rum','Gold Rum','Rum',{...imported,commodity:'wine'}).status).not.toBe('match');
  expect(field('classType','Vodka','Gold Rum').status).toBe('mismatch');
  expect(field('classType','Cabernet Sauvignon','Merlot','Merlot',{...imported,commodity:'wine'}).status).toBe('mismatch');
});
test('explicit PR origins are equivalent without treating territory as foreign', () => {
  expect(field('origin','Puerto Rico','MADE IN PUERTO RICO','RUM OF PUERTO RICO',domestic)).toMatchObject({status:'not-applicable',conflict:false});
  expect(field('origin','US','Made in Puerto Rico','Rum of Puerto Rico',{...domestic,origin:{kind:'domestic',country:'US'}}).status).toBe('not-applicable');
  expect(field('origin','Puerto Rico','Made in Mexico','Made in Puerto Rico',domestic)).toMatchObject({status:'mismatch',conflict:true});
  expect(field('origin','Puerto Rico','Made in United States','Made in United States',domestic).status).not.toBe('not-applicable');
  expect(field('origin','France','Made in Puerto Rico').status).toBe('mismatch');
});
test.each(['SANTIAGO DE CUBA','ESTABLECIDO EN 1862 SANTIAGO DE CUBA','FOR THE ORIGINAL CUBA LIBRE','Imported from Puerto Rico','Puerto Rico or Cuba'])('no historical/cocktail/shipping/prose origin inference: %s', text => {
  expect(field('origin','Puerto Rico',text,text,domestic).status).toBe('needs-review');
});
test('wrong ABV and uncertainty remain non-green with raw observed text', () => {
  expect(field('abv','40','35% ALC./VOL.','40% ALC./VOL.')).toMatchObject({status:'mismatch',conflict:true});
  const set=structuredClone(old.photoEvidence); for(const photo of set.photos) photo.evidence.brand={...readable('BACARDI'),status:'uncertain'};
  expect(fresh(imported,set).comparison.fields.brand.status).toBe('needs-review');
});
test('wrong producer identity cannot pass, and generic/specific rum views retain provenance without manufacturing words', () => {
  const set=structuredClone(old.photoEvidence); set.photos[1].evidence.producer.name=readable('Unrelated Distillery');
  expect(fresh(domestic,set).comparison.fields.producer.status).not.toBe('match');
  set.photos[0].evidence.classType=readable('Gold Rum'); set.photos[1].evidence.classType=readable('Rum');
  const result=fresh({...domestic,classType:'Rum'},set);
  expect(result.comparison.fields.classType).toMatchObject({status:'match',conflict:false,observed:{text:'Gold Rum'}});
  expect(result.provenance.classType.variants.map(v=>v.value)).toEqual(['Gold Rum','Rum']);
  expect(result.photoEvidence).toEqual(set);
});
test.each(['Made in Cuba','Product of France','Rum of Mexico'])('explicit foreign origin conflicts with domestic PR: %s', text => {
  expect(field('origin','Puerto Rico',text,text,domestic).status).toBe('mismatch');
});
test('new intake admits domestic PR verbatim, rejects foreign/territory context contradiction, old imported diagnostic remains readable', () => {
  for(const country of ['Puerto Rico','PR','P.R.']) expect(applicationSchema.parse({...domestic,origin:{kind:'domestic',country}}).origin.country).toBe(country);
  expect(applicationSchema.safeParse(old.application).success).toBe(false);
  expect(applicationSchema.safeParse({...domestic,origin:{kind:'domestic',country:'France'}}).success).toBe(false);
  expect(checkedPhotoRecord(old)).toEqual(old);
  const html=renderToStaticMarkup(createElement(Review)); expect(html).toContain('Puerto Rico');
});
test('new records reject forged version pairs and historical records are never relabeled/recomputed as new', () => {
  const next=fresh(imported);
  for(const [rulesRevision,aggregationVersion] of [[8,'photo-set-aggregation-v2'],[7,'photo-set-aggregation-v3'],[6,'photo-set-aggregation-v3'],[null,'photo-set-aggregation-v3'],[8,null]]) {
    expect(checkedPhotoRecord({...next,aggregationVersion,comparison:{...next.comparison,rulesRevision}})).toBeNull();
  }
  expect(checkedPhotoRecord({...old,aggregationVersion:'photo-set-aggregation-v3',comparison:{...old.comparison,rulesRevision:8}})).toBeNull();
});
