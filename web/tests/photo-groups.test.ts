import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {preparePhotoGroup} from '../lib/intake';
import {signGroupPreparation,verifyGroupPreparation} from '../lib/group-binding';
import {photoGroupDeclarationSchema,parsePhotoSetEvidence,type PhotoSetEvidence} from '../lib/photo-contracts';
import {aggregatePhotoEvidence} from '../lib/photo-evidence';
import {comparePhotoApplication} from '../lib/group-rules';
import {parseApplication} from '../lib/contracts';
import {image,application} from './fixtures/synthetic';
import {parseExtractionEvidence} from '../lib/extraction/schema';
import fixtures from './fixtures/comparisons.json';
import {groupInput,photoEvidence} from './fixtures/photo-groups';
const obs=(text:string)=>({status:'readable' as const,text,reason:'Visible'});
const missing={status:'missing' as const,text:null,reason:'Not visible'};
describe('group intake and bindings',()=>{
 it.each([1,4])('accepts %i complete photos and binds all roles/order/hash',async n=>{
  const input=await groupInput(n);const p=await preparePhotoGroup(input);expect(p.photos).toHaveLength(n);
  const signed=signGroupPreparation(p,'server-secret');expect(verifyGroupPreparation(p,'server-secret',signed)).toBe(true);
  p.photos[0].descriptor.role='back';p.group.revision++;expect(verifyGroupPreparation(p,'server-secret',signed)).toBe(false);
 });
 it('rejects subset, excess, duplicate bytes, corrupt secondary and byte mismatch',async()=>{
  const input=await groupInput();await expect(preparePhotoGroup({...input,files:input.files.slice(0,1)})).rejects.toThrow();
  input.files[1].image.bytes=Buffer.from(input.files[0].image.bytes);input.group.photos[1].bytes=input.files[1].image.bytes.length;
  await expect(preparePhotoGroup(input)).rejects.toThrow();input.files[1].image.bytes.fill(0);await expect(preparePhotoGroup(input)).rejects.toThrow();
 });
});
describe('deterministic photo evidence',()=>{
 it('fills complementary leaves without converting missing into contributions',()=>{
  const ids=[randomUUID(),randomUUID()];const set=photoEvidence(ids);set.photos[0].evidence.brand=missing;set.photos[1].evidence.brand=obs('Sample Brand');
  const a=aggregatePhotoEvidence(set);expect(a.evidence.brand.text).toBe('Sample Brand');expect(a.provenance.brand.sourcePhotoIds).toEqual([ids[1]]);
 });
 it('keeps contrary tentative values and known defects; never majority votes',()=>{
  const set=photoEvidence([randomUUID(),randomUUID()]);set.photos[0].evidence.abv=obs('40%');set.photos[1].evidence.abv=obs('41%');
  const a=aggregatePhotoEvidence(set);expect(a.provenance.abv.conflict).toBe(true);expect(a.evidence.abv.text).toBe(null);
  expect(comparePhotoApplication(parseApplication(application),set).fields.abv.status).toBe('mismatch');
  set.photos[1].evidence.abv.status='uncertain';expect(comparePhotoApplication(parseApplication(application),set).fields.abv.status).toBe('needs-review');
 });
 it('uses exact decimal and volume equivalence but not warning punctuation/case changes',()=>{
  const set=photoEvidence([randomUUID(),randomUUID()]);set.photos[0].evidence.abv=obs('40.0% ABV');set.photos[1].evidence.abv=obs('40');
  set.photos[0].evidence.netContents=obs('0.75 L');set.photos[1].evidence.netContents=obs('750 mL');
  let a=aggregatePhotoEvidence(set);expect(a.provenance.abv.conflict).toBe(false);expect(a.provenance.netContents.conflict).toBe(false);
  set.photos[1].evidence.warning.heading=obs('Government Warning:');a=aggregatePhotoEvidence(set);expect(a.provenance['warning.heading'].conflict).toBe(true);
 });
 it('rejects unknown/omitted/duplicate sources and formatting detached from text',()=>{
  const ids=[randomUUID(),randomUUID()];const set=photoEvidence(ids);
  expect(()=>parsePhotoSetEvidence(set,[ids[0]])).toThrow();set.photos[1].photoId=ids[0];expect(()=>aggregatePhotoEvidence(set)).toThrow();
  set.photos[1].photoId=ids[1];set.photos[1].evidence.warning.body=missing;set.photos[1].evidence.warning.bodyBold=false;expect(()=>aggregatePhotoEvidence(set)).toThrow();
 });
});
