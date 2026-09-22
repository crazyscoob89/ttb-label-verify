// Synthetic browser fixtures; recompute with the exact integrated evaluator.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseApplication} from '../lib/contracts';
import {finalizePhotoComparison} from '../lib/photo-record';
import {photoSetCanonical,type PhotoDescriptor} from '../lib/photo-contracts';
import base from '../tests/fixtures/comparisons.json';
const application=parseApplication(base.application),missing={status:'missing',text:null,reason:'Not visible in this synthetic photo.'};
function make(conflict:boolean){
 const front=structuredClone(base.evidence),back=structuredClone(base.evidence);
 Object.assign(front,{warning:{heading:missing,body:missing,headingBold:null,bodyBold:null}});
 for(const k of ['brand','classType','netContents','origin'])Object.assign(back,{[k]:missing});
 Object.assign(back,{producer:{name:missing,address:missing},abv:conflict?{status:'readable',text:'45%',reason:'Synthetic conflicting observation.'}:missing});
 const photos:PhotoDescriptor[]=['match','discrepancy'].map((name,i)=>{const bytes=readFileSync(`public/offline-samples/${name}.png`),sha256=createHash('sha256').update(bytes).digest('hex');return {photoId:`00000000-0000-4000-8000-00000000000${i+2}`,role:i?'back':'front',filename:i?'back.png':'front.png',mime:'image/png',bytes:bytes.length,sourceSha256:sha256,normalized:{sha256,bytes:bytes.length,mime:'image/png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}};});
 const hash=createHash('sha256').update(photoSetCanonical(photos)).digest('hex');
 return finalizePhotoComparison(application,'00000000-0000-4000-8000-000000000001',1,photos,hash,{processing:'complete',evidence:{schemaVersion:2,photos:photos.map((p,i)=>({photoId:p.photoId,evidence:i?back:front}))},metadata:{source:'fixture',model:'offline-fixture',schemaVersion:2,promptVersion:'photo-set-observations-v2',rulesVersion:'prototype-seven-fields-v1',requestId:'00000000-0000-4000-8000-000000000009',photoSetSha256:hash,photos:photos.map(p=>({photoId:p.photoId,imageSha256:p.normalized.sha256}))}});
}
writeFileSync('tests/fixtures/photo-ui-records.json',JSON.stringify({provenance:'Synthetic UI-only observations over demo PNG assets. Not AI analysis or real scan evidence.',complementary:make(false),conflict:make(true)},null,2)+'\n');
