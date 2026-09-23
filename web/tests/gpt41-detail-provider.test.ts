import {expect,test,vi} from 'vitest';
import sharp from 'sharp';
import {createGpt41GroupProvider} from '../lib/extraction/gpt41';
import {GPT41_CATALOG_URL} from '../lib/extraction/gpt41-pricing';
import {OPENROUTER_ENDPOINT,type Transport} from '../lib/extraction/openrouter';
import {preparePhotoGroup} from '../lib/intake';
import {groupInput} from './fixtures/photo-groups';
import {groupAttemptIds} from '../lib/group-binding';
import {OfflineSpendStore} from './helpers/offline-spend-store';
import catalog from './fixtures/gpt41-catalog.json';
import envelope from './fixtures/gpt41-benchmark-envelope-0.json';

test('real adapter sends original plus four same-photo details for a large tall source',async()=>{
 const input=await groupInput(1),bytes=await sharp({create:{width:1000,height:2500,channels:3,background:'#ac35e1'}}).png().toBuffer();
 input.files[0].image.bytes=bytes;input.group.photos[0].bytes=bytes.length;
 const prepared=await preparePhotoGroup(input),store=new OfflineSpendStore();store.ceiling=50000000;
 const request={schemaVersion:2 as const,photos:prepared.photos.map(p=>({descriptor:p.descriptor,image:p.normalized.bytes})),photoSetSha256:prepared.photoSetSha256,...groupAttemptIds(input.group.groupId,1)};
 const transport=vi.fn<Transport>(async url=>Response.json(url===GPT41_CATALOG_URL?catalog:envelope));
 const result=await createGpt41GroupProvider({authorized:true,apiKey:'offline',store,transport}).extractGroup(request);
 expect(result.processing).toBe('complete');const posts=transport.mock.calls.filter(([url])=>url===OPENROUTER_ENDPOINT);expect(posts).toHaveLength(1);
 const parts=JSON.parse(String(posts[0][1].body)).messages[1].content;expect(parts.filter((p:{type:string})=>p.type==='image_url')).toHaveLength(5);
 expect(store.unresolved).toBe(1000000);
});
