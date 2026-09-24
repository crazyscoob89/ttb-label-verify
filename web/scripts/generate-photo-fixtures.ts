import {writeFileSync} from 'node:fs';
import {groupFixture} from '../tests/fixtures/photo-groups';
import {finalizePhotoComparison} from '../lib/photo-record';
import {photoSetHash} from '../lib/group-binding';
import {parseApplication} from '../lib/contracts';
import fixture from '../tests/fixtures/comparisons.json';
import legacy from '../tests/fixtures/rules-v1-records.json';
// Offline synthetic contract fixtures ONLY. No provider, secrets, storage, or ledger.
const missing=()=>({status:'missing' as const,text:null,reason:'Not visible in this synthetic source.'});
const missingWarning=()=>({heading:missing(),body:missing(),headingBold:null,bodyBold:null});
const cases:Record<string,unknown>={};
for(const [index,name] of ['complementary-front-back','conflicting-abv','warning-closeup','one-photo'].entries()){
 const count=name==='one-photo'?1:name==='warning-closeup'?3:2;
 const f=await groupFixture(count);f.input.group.application=parseApplication(fixture.application);
 f.input.group.groupId=`10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
 f.prepared.group=f.input.group;
 for(const [i,p] of f.prepared.photos.entries()){
  p.descriptor.photoId=`20000000-0000-4000-8000-${String(index*4+i+1).padStart(12,'0')}`;
  p.descriptor.role=i===0?'front':i===1?'back':'closeup';f.extraction.evidence.photos[i].photoId=p.descriptor.photoId;
 }
 if(count>1){
  const front=f.extraction.evidence.photos[0].evidence,back=f.extraction.evidence.photos[1].evidence;
  front.producer={name:missing(),address:missing()};front.origin=missing();front.warning=missingWarning();back.brand=missing();back.classType=missing();back.netContents=missing();back.abv=missing();
  if(name==='conflicting-abv')back.abv={status:'readable',text:'41%',reason:'Synthetic conflicting reading.'};
  if(name==='warning-closeup'){back.warning=missingWarning();const closeup=f.extraction.evidence.photos[2].evidence;closeup.brand=missing();closeup.classType=missing();closeup.abv=missing();closeup.netContents=missing();closeup.producer={name:missing(),address:missing()};closeup.origin=missing();}
 }
 const descriptors=f.prepared.photos.map(p=>p.descriptor),hash=photoSetHash(descriptors);
 f.extraction.metadata.photoSetSha256=hash;f.extraction.metadata.photos=descriptors.map(p=>({photoId:p.photoId,imageSha256:p.normalized.sha256}));f.extraction.metadata.requestId=`30000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
 const record=finalizePhotoComparison(f.input.group.application,f.input.group.groupId,1,descriptors,hash,f.extraction);
 cases[name]={record,media:f.prepared.photos.map(p=>({photoId:p.descriptor.photoId,originalBase64:p.original.toString('base64'),normalizedBase64:p.normalized.bytes.toString('base64')}))};
 if(name==='one-photo')cases['malformed-source-coverage']={expectedPhotoIds:[descriptors[0].photoId],response:{schemaVersion:2,photos:[{photoId:'ffffffff-ffff-4fff-8fff-ffffffffffff',evidence:f.extraction.evidence.photos[0].evidence}]}};
}
cases['untouched-legacy']=legacy;
writeFileSync('tests/fixtures/photo-contract-cases.json',JSON.stringify(cases,null,2)+'\n');
