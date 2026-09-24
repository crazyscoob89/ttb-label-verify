import { describe, it, expect } from 'vitest';
import { comparePhotoApplication } from '../lib/group-rules';
import { aggregatePhotoEvidence } from '../lib/photo-evidence';
import { checkedRecord } from '../lib/review-policy';
import { application, incident, readable } from './fixtures/jose-cuervo';
import history from './fixtures/semantic-history.json';
import { WARNING_REFERENCE } from '../lib/rules';
import { compareApplicationV5 } from '../lib/semantic-rules';
import { finalizePhotoComparison, verifyPhotoRecordDigest } from '../lib/photo-record';

function compare(set=incident(), app=application) { return comparePhotoApplication(app,set); }
describe('bounded bottle semantics, not label-specific corrections',()=>{
 it('preserves reported raw evidence and repairs compatible class/origin/mapped warning without all-green',()=>{
  const set=incident(), before=JSON.stringify(set), r=compare(set), a=aggregatePhotoEvidence(set);
  expect(r.rulesRevision).toBe(6);
  expect(r.fields.classType.status).toBe('match');
  expect(r.fields.classType.observed.text).toBe('Tequila Gold');
  expect(r.fields.origin.status).toBe('match');expect(r.fields.origin.conflict).toBe(false);
  expect(a.provenance.origin.variants.map(v=>v.value)).toEqual(['Hecho en Mexico','Product of Mexico']);
  expect(r.fields.warning.status).toBe('needs-review');expect(r.fields.warning.conflict).toBe(false);
  expect(r.fields.warning.observed.heading.text).toBe(WARNING_REFERENCE.heading);
  expect(r.fields.warning.observed.body.text).toBe(WARNING_REFERENCE.body.toUpperCase());
  expect(r.fields.warning.reasons.join(' ')).not.toMatch(/proven defect|Missing from observed/);
  expect(r.fields.abv.status).toBe('needs-review');expect(r.fields.producer.status).not.toBe('match');
  expect(a.provenance['producer.address'].conflict).toBe(false);
  expect(JSON.stringify(set)).toBe(before);
 });
 it.each(['Vodka','Tequila Silver'])('does not excuse explicit class contradiction against %s',classType=>{
  expect(compare(incident(),{...application,classType}).fields.classType.status).toBe('mismatch');
 });
 it('compares all class pairs so a generic view cannot bridge conflicting subtypes',()=>{
  const set=incident();set.photos[0].evidence.classType=readable('Tequila');set.photos[1].evidence.classType=readable('Tequila Gold');
  set.photos.push({...structuredClone(set.photos[1]),photoId:'9c7b9132-2420-4523-985c-eadbba027c08'});
  set.photos[2].evidence.classType=readable('Tequila Silver');
  expect(compare(set).fields.classType).toMatchObject({conflict:true,status:'needs-review'});
 });
 it.each(['IMPORTED FROM MEXICO','MEXICO OR CANADA','Made with Mexico ingredients'])('does not substring-normalize %s',text=>{
  const set=incident();set.photos=[set.photos[0]];set.photos[0].evidence.origin=readable(text);
  expect(compare(set).fields.origin.status).toBe('needs-review');
 });
 it('keeps a genuine country conflict',()=>{
  const set=incident();set.photos[1].evidence.origin=readable('PRODUCT OF CANADA');
  expect(compare(set).fields.origin).toMatchObject({conflict:true,status:'mismatch'});
 });
 it('keeps unknown typography separate from uppercase; no missing-word reconstruction',()=>{
  const set=incident();set.photos[1].evidence.warning.bodyBold=null;
  expect(compare(set).fields.warning.status).toBe('needs-review');
  set.photos[1].evidence.warning.heading=readable(set.photos[1].evidence.warning.heading.text!.replace(' NOT ',' '));
  expect(compare(set).fields.warning.status).toBe('mismatch');
  expect(aggregatePhotoEvidence(set).evidence.warning.body.text).not.toContain(' NOT ');
 });
 it.each(['Government Warning:','GOVERNMENT WARNING'])('requires exact heading %s',heading=>{
  const set=incident();set.photos[1].evidence.warning={heading:readable(heading),body:readable(WARNING_REFERENCE.body.toUpperCase()),headingBold:true,bodyBold:false};
  expect(compare(set).fields.warning.status).toBe('mismatch');
 });
 it.each([WARNING_REFERENCE.body.replace('not ','').toUpperCase(),WARNING_REFERENCE.body.replace('defects.','defects'),WARNING_REFERENCE.body.slice(0,-30)])('does not relax words/punctuation/truncation',body=>{
  const set=incident();set.photos[1].evidence.warning={heading:readable(WARNING_REFERENCE.heading),body:readable(body),headingBold:true,bodyBold:false};
  expect(compare(set).fields.warning.status).toBe('mismatch');
 });
 it('allows body case only and rejects actual boldness defects',()=>{
  const set=incident();const w=set.photos[1].evidence.warning;
  w.heading=readable(WARNING_REFERENCE.heading);w.body=readable(WARNING_REFERENCE.body.toUpperCase());w.bodyBold=false;
  expect(compare(set).fields.warning.status).toBe('match');
  w.bodyBold=true;expect(compare(set).fields.warning.status).toBe('mismatch');
  w.bodyBold=false;w.headingBold=false;expect(compare(set).fields.warning.status).toBe('mismatch');
 });
 it('uses a compatible full address without verifying the partial address alone',()=>{
  const set=incident();for(const p of set.photos)p.evidence.producer.name=readable('La Rojeña');
  set.photos[1].evidence.producer.address=readable('Jose Cuervo No. 73, Tequila, Jalisco, 46400 Mexico');
  expect(compare(set).fields.producer).toMatchObject({status:'match',conflict:false});
  expect(compare({...set,photos:[set.photos[0]]}).fields.producer.status).toBe('needs-review');
  set.photos[0].evidence.producer.address=readable('Jose Cuervo No. 74, Tequila, Jalisco, 46400 Mexico');
  expect(compare(set).fields.producer).toMatchObject({status:'mismatch',conflict:true});
 });
 it('cannot turn a wrong entity into the declared producer',()=>{
  const set=incident();for(const p of set.photos)p.evidence.producer.name=readable('PROXIMO');
  expect(compare(set).fields.producer.status).not.toBe('match');
 });
 it('never invents missing front/back evidence and retains numeric/brand negatives',()=>{
  const set=incident();expect(compare({...set,photos:[set.photos[0]]}).fields.warning.status).toBe('needs-review');
  expect(compare({...set,photos:[set.photos[1]]}).fields.abv.status).toBe('needs-review');
  set.photos[0].evidence.abv=readable('45%');set.photos[0].evidence.netContents=readable('750 mL');set.photos[0].evidence.brand=readable('Other Brand');
  for(const key of ['brand','abv','netContents'] as const)expect(compare(set).fields[key].status).toBe('mismatch');
 });
 it('replays captured old singleton 1/2/3 and group 4 exactly, rejects revision relabeling',()=>{
  for(const r of [...history.singletons,history.group])expect(checkedRecord(r)).toEqual(r);
  expect(checkedRecord({...history.group,aggregationVersion:'photo-set-aggregation-v2'})).toBeNull();
  expect(checkedRecord({...history.group,comparison:{...history.group.comparison,rulesRevision:6}})).toBeNull();
 });
 it('finalizes fresh 6/v2, replays its derived provenance, and rejects projected/raw tampering',async()=>{
  const old=checkedRecord(history.group);if(!old||!('recordVersion' in old))throw Error('fixture');
  const r=finalizePhotoComparison(old.application,old.groupId,old.revision,old.photos,old.photoSetSha256,{processing:'complete',evidence:old.photoEvidence,metadata:{source:'fixture',model:'offline-fixture',schemaVersion:2,promptVersion:'photo-set-observations-v2',rulesVersion:'prototype-seven-fields-v1',requestId:old.extraction.requestId,photoSetSha256:old.photoSetSha256,photos:old.photos.map(p=>({photoId:p.photoId,imageSha256:p.normalized.sha256}))}});
  expect(r.aggregationVersion).toBe('photo-set-aggregation-v2');expect(r.comparison.rulesRevision).toBe(6);
  expect(r.photoEvidence).toEqual(old.photoEvidence);expect(checkedRecord(r)).toEqual(r);expect(await verifyPhotoRecordDigest(r)).toBe(true);
  expect(r.provenance['warning.body'].derivations).toEqual([{photoId:r.photos[1].photoId,sourcePath:'warning.heading',operation:'split-visible-warning-prefix'}]);
  const tampered=structuredClone(r);tampered.evidence.warning.body.text=WARNING_REFERENCE.body;expect(checkedRecord(tampered)).toBeNull();
  const unmapped=structuredClone(r);delete unmapped.provenance['warning.body'].derivations;expect(checkedRecord(unmapped)).toBeNull();
  const rawChange=structuredClone(r);rawChange.photoEvidence.photos[1].evidence.warning.heading.text=WARNING_REFERENCE.heading;expect(checkedRecord(rawChange)).toBeNull();
  expect(checkedRecord({...r,aggregationVersion:'photo-set-aggregation-v1'})).toBeNull();
  expect(checkedRecord({...r,comparison:{...r.comparison,rulesRevision:4}})).toBeNull();
 });
 it('singleton 5 applies identical semantics but retains raw extracted evidence',()=>{
  const e=incident().photos[1].evidence,before=JSON.stringify(e),r=compareApplicationV5(application,e);
  expect(r.processing).toBe('complete');if(r.processing!=='complete')throw Error('fixture');
  expect(r.rulesRevision).toBe(5);expect(r.fields.warning.status).toBe('needs-review');
  expect(r.fields.warning.reasons.join(' ')).toContain('Field mapping correction');
  expect(JSON.stringify(e)).toBe(before);
  const record={...history.singletons[2],evidence:e,comparison:r};expect(checkedRecord(record)).toEqual(record);
  expect(checkedRecord({...record,comparison:{...r,rulesRevision:3}})).toBeNull();
 });
 it('matches separately inspected photo text without assuming producer role or typography',()=>{
  // Independent inspection: /opt/data/ttb-jose-cuervo-ground-truth.json, NOT a
  // provider capture. Imported/distilled-spirits context is the explicit test assumption.
  const set=incident();const front=set.photos[0].evidence,back=set.photos[1].evidence;
  front.abv=readable('40% ALC/VOL');front.producer.name=readable('FABRICA LA ROJENA');
  back.producer.name=readable('La Rojeña');back.producer.address=readable('Jose Cuervo No. 73, Tequila, Jalisco, 46400 Mexico');
  back.netContents=readable('1.75 L');back.abv={status:'missing',text:null,reason:'No ABV visible in inspected back view.'};
  back.warning={heading:readable('GOVERNMENT WARNING:'),body:readable(WARNING_REFERENCE.body.toUpperCase()),headingBold:true,bodyBold:false};
  const r=compare(set);for(const key of ['brand','classType','abv','netContents','origin','warning'] as const)expect(r.fields[key].status).toBe('match');
  expect(r.fields.producer.status).toBe('needs-review');expect(r.physicalPrintSize.status).toBe('unverified');
 });
 it('does not infer subtype, address coverage or producer identity from arbitrary substrings',()=>{
  const set=incident();set.photos=[set.photos[0]];const e=set.photos[0].evidence;
  e.classType=readable('Tequila');expect(compare(set,{...application,classType:'Tequila Gold'}).fields.classType.status).toBe('needs-review');
  e.producer.name=readable('La Rojeña');e.producer.address=readable('Tequila, Mexico');
  expect(compare(set).fields.producer.status).toBe('needs-review');
  e.producer.address=readable('Not Tequila, Mexico');expect(compare(set).fields.producer.status).toBe('needs-review');
  e.producer.address=readable('Jose Cuervo No. 73, Tequila, Jalisco, 46401 Mexico');expect(compare(set).fields.producer.status).toBe('mismatch');
 });
 it('unknown/truncated observations remain review, and populated body is never replaced',()=>{
  const set=incident(),w=set.photos[1].evidence.warning;
  w.heading={status:'uncertain',text:w.heading.text,reason:'Truncated or blurred'};expect(compare(set).fields.warning.status).toBe('needs-review');
  expect(aggregatePhotoEvidence(set).evidence.warning.body.text).toBeNull();
  w.heading=readable(`${WARNING_REFERENCE.heading} ${WARNING_REFERENCE.body}`);w.body=readable('Visible wrong body');
  expect(aggregatePhotoEvidence(set).evidence.warning.body.text).toBe('Visible wrong body');expect(compare(set).fields.warning.status).toBe('mismatch');
 });
});
