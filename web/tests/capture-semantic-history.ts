import { writeFileSync } from 'node:fs';
import { compareApplication as v1 } from '../lib/rules-v1';
import { compareApplication as v2 } from '../lib/rules';
import { compareApplicationV3 as v3 } from '../lib/wine-rules';
import { comparePhotoApplication } from '../lib/group-rules-v4';
import { aggregatePhotoEvidence } from '../lib/photo-evidence-v1';
import { checkedRecord } from '../lib/review-policy';
import ui from './fixtures/photo-ui-records.json';
import { application, incident } from './fixtures/jose-cuervo';
const photoEvidence=incident();
const singletons=[v1,v2,v3].map(compare=>({processing:'complete',application,imageSha256:'a'.repeat(64),source:'fixture',evidence:photoEvidence.photos[1].evidence,comparison:compare(application,photoEvidence.photos[1].evidence)}));
const template=ui.complementary;
const group={...template,application,photos:template.photos.map((p:any,i:number)=>({...p,photoId:photoEvidence.photos[i].photoId})),photoEvidence,...aggregatePhotoEvidence(photoEvidence),comparison:comparePhotoApplication(application,photoEvidence)};
// Rebind descriptor digest (synthetic historical fixture, no production identity).
const {photoSetCanonical}=await import('../lib/photo-contracts');
const {createHash}=await import('node:crypto');
group.photoSetSha256=createHash('sha256').update(photoSetCanonical(group.photos)).digest('hex');
for(const record of [...singletons,group])if(!checkedRecord(record))throw Error('Invalid pre-repair fixture');
writeFileSync(new URL('./fixtures/semantic-history.json',import.meta.url),JSON.stringify({sourceCommit:'49e8d131a77633a84291ab60409d40c5095b6871',description:'Synthetic records captured with original evaluators before semantic repair; incident text reconstructed from supplied UI report.',singletons,group},null,2)+'\n');
