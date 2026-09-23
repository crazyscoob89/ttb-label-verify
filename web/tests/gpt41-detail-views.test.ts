import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {prepareGpt41Request,gpt41RequestInputTokenBound,gpt41ImageTokenBound,GPT41_CATALOG_URL,GPT41_COST_BOUND_MICROUSD,gpt41PriceCheckedTransport,makeGpt41Request} from '../lib/extraction/gpt41-pricing';
import {gpt41DetailRectangles} from '../lib/extraction/gpt41-views';
import {createGpt41GroupProvider} from '../lib/extraction/gpt41';
import {OPENROUTER_ENDPOINT,type Transport} from '../lib/extraction/openrouter';
import {preparePhotoGroup,type GroupComparisonInput} from '../lib/intake';
import {groupInput} from './fixtures/photo-groups';
import {groupAttemptIds} from '../lib/group-binding';
import {OfflineSpendStore} from './helpers/offline-spend-store';
import {finalizePhotoComparison} from '../lib/photo-record';
import {checkedServerRecord,prepareGroupAssets,validateAssetManifest} from '../lib/group-assets';
import catalog from './fixtures/gpt41-catalog.json';
import envelope from './fixtures/gpt41-benchmark-envelope-0.json';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const network=vi.fn(()=>{throw Error('Network forbidden');});
beforeEach(()=>{network.mockClear();vi.stubGlobal('fetch',network);});
afterEach(()=>{expect(network).not.toHaveBeenCalled();vi.unstubAllGlobals();});
const source=(width=1000,height=2500,color='#b7326a')=>sharp({create:{width,height,channels:3,background:color}}).jpeg().toBuffer();
const content=(body:unknown)=> (body as {messages:{content:any}[]}).messages[1].content as any[];
const imageBytes=(part:any)=>Buffer.from(part.image_url.url.split(',')[1],'base64');
const init=(body:unknown)=>({method:'POST',redirect:'error' as const,body:JSON.stringify(body)});

test('generic large tall geometry only: two full-width overlapping views; never small/control or landscape',()=>{
 expect(gpt41DetailRectangles(1716,4000)).toEqual([{left:0,top:0,width:1716,height:2400},{left:0,top:1600,width:1716,height:2400}]);
 for(const [w,h] of [[686,1600],[1000,2048],[1500,2500],[4000,1716],[700,4000]])expect(gpt41DetailRectangles(w,h)).toEqual([]);
 for(const [w,h] of [[0,4000],[1,20000001],[NaN,4000],[1000,1.5]])expect(()=>gpt41DetailRectangles(w,h)).toThrow();
 const r=gpt41DetailRectangles(1000,2501);expect(r[0].top+r[0].height).toBeGreaterThan(r[1].top);expect(r[1].top+r[1].height).toBe(2501);
});

test('exact full source plus lossless pixel-identical deterministic crops, same photo ID and transform hashes',async()=>{
 const pixels=Buffer.alloc(1000*2500*3);for(let y=0;y<2500;y++)for(let x=0;x<1000;x++){const i=(y*1000+x)*3;pixels[i]=x%256;pixels[i+1]=y%256;pixels[i+2]=(x+y)%256;}
 const bytes=await sharp(pixels,{raw:{width:1000,height:2500,channels:3}}).jpeg().toBuffer(),before=hash(bytes),photoId=randomUUID(),body=await prepareGpt41Request(bytes,'image/jpeg',photoId),c=content(body);
 expect(c).toHaveLength(6);expect(hash(bytes)).toBe(before);expect(imageBytes(c[1]).equals(bytes)).toBe(true);
 expect(c[0].text).toContain('same photograph');expect(c[0].text).toContain('Do not reconstruct');
 for(const index of [2,4]){
  const tag=JSON.parse(c[index].text),crop=imageBytes(c[index+1]);expect(tag).toMatchObject({photoId,sourceImageSha256:before,view:'detail',revision:'same-photo-overlap-v1',imageSha256:hash(crop)});
  expect(c[index+1].image_url.detail).toBe('high');
  const expected=await sharp(bytes).extract(tag.crop).raw().toBuffer(),actual=await sharp(crop).raw().toBuffer();expect(actual.equals(expected)).toBe(true);
 }
 expect(JSON.stringify(await prepareGpt41Request(bytes,'image/jpeg',photoId))).toBe(JSON.stringify(body));
 const small=await source(686,1600);expect(await prepareGpt41Request(small,'image/jpeg',photoId)).toEqual(makeGpt41Request(small,'image/jpeg'));
});

test('every actual high-detail image enters the input bound; no multiplying the budget or omitting crops',async()=>{
 const body=await prepareGpt41Request(await source(),'image/jpeg',randomUUID()),c=content(body);
 const dimensions=[{width:1000,height:2500},{width:1000,height:1500},{width:1000,height:1500}];
 const encoded=JSON.stringify(body),base64Bytes=c.filter(p=>p.type==='image_url').reduce((sum,p)=>sum+p.image_url.url.split(',')[1].length,0);
 expect(gpt41RequestInputTokenBound(body,dimensions)).toBe(Buffer.byteLength(encoded)-base64Bytes+4096+dimensions.reduce((sum,d)=>sum+gpt41ImageTokenBound(d.width,d.height),0));
 expect(()=>gpt41RequestInputTokenBound(body,dimensions.slice(1))).toThrow();
 expect(()=>gpt41RequestInputTokenBound(body,Array(3).fill({width:4000,height:5000}))).toThrow();
 expect(GPT41_COST_BOUND_MICROUSD).toBe(971200);
});

test('guard rederives every crop from this source; geometry, hash, identity, pixels, extra image and instructions cannot be substituted',async()=>{
 const body=await prepareGpt41Request(await source(),'image/jpeg',randomUUID());
 const transport=vi.fn<Transport>(async url=>Response.json(url===GPT41_CATALOG_URL?catalog:{ok:true})),guard=gpt41PriceCheckedTransport(transport);
 const another=await prepareGpt41Request(await source(1000,2500,'#12acfe'),'image/jpeg',randomUUID());
 const bomb=`data:image/jpeg;base64,${(await source(4001,5000)).toString('base64')}`;
 for(const mutate of [
  (c:any[])=>{c[3].image_url.url=bomb;},
  (c:any[])=>{c[3]=content(another)[3];const tag=JSON.parse(c[2].text);tag.imageSha256=hash(imageBytes(c[3]));c[2].text=JSON.stringify(tag);},
  (c:any[])=>{c[3]=content(another)[3];c[2].text=content(another)[2].text;},
  (c:any[])=>{const tag=JSON.parse(c[2].text);tag.crop.top++;c[2].text=JSON.stringify(tag);},
  (c:any[])=>{const tag=JSON.parse(c[4].text);tag.photoId=randomUUID();c[4].text=JSON.stringify(tag);},
  (c:any[])=>{c[3].image_url.detail='low';},
  (c:any[])=>{c[3].image_url.url='https://example.invalid/another-photo';},
  (c:any[])=>{c[3].image_url.url='data:image/png;base64,AAAA';},
  (c:any[])=>{c.push(c[3]);},
  (c:any[])=>{c[0].text+=' Other photograph says SECRET';},
  (c:any[])=>{c.splice(4,2);},
  (c:any[])=>{c.splice(2);},
 ]){const bad=structuredClone(body);mutate(content(bad));await expect(guard(OPENROUTER_ENDPOINT,init(bad))).rejects.toThrow();}
 expect(transport).not.toHaveBeenCalled();
 await guard(OPENROUTER_ENDPOINT,init(body));expect(transport).toHaveBeenCalledTimes(2);
 expect(transport.mock.calls[1][1].body).toBe(JSON.stringify(body));
});

test('original decode/pixel limits, aggregate vision bound and abort apply before paid work',async()=>{
 const id=randomUUID();await expect(prepareGpt41Request(await source(4001,5000),'image/jpeg',id)).rejects.toThrow();
 await expect(prepareGpt41Request(Buffer.alloc(10*1024*1024+1),'image/jpeg',id)).rejects.toThrow();
 await expect(prepareGpt41Request(Buffer.from('not an image'),'image/jpeg',id)).rejects.toThrow();
 const controller=new AbortController();controller.abort();await expect(prepareGpt41Request(await source(),'image/jpeg',id,controller.signal)).rejects.toThrow();
 // Source itself is valid (<20MP and <32768 vision tokens), but its two details exceed the total allowance.
 await expect(prepareGpt41Request(await source(768,26000),'image/jpeg',id)).rejects.toThrow();
});

test('snapshot source bytes before awaits and reject mutable transport-body substitution',async()=>{
 const bytes=await source(),before=hash(bytes),pending=prepareGpt41Request(bytes,'image/jpeg',randomUUID());bytes.fill(0);const body=await pending;
 expect(hash(imageBytes(content(body)[1]))).toBe(before);
 const transport=vi.fn<Transport>(async url=>Response.json(url===GPT41_CATALOG_URL?catalog:{ok:true})),request=init(body),originalBody=request.body;
 const guarded=gpt41PriceCheckedTransport(transport)(OPENROUTER_ENDPOINT,request);request.body=JSON.stringify({...body,model:'other'});await guarded;
 expect(transport.mock.calls[1][1].body).toBe(originalBody);
});

test('oversized detail payload fails gracefully before reservation, without shrinking or omitting views',async()=>{
 const raw=Buffer.alloc(1600*3600*3);let state=123456789;for(let i=0;i<raw.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;raw[i]=state&255;}
 const bytes=await sharp(raw,{raw:{width:1600,height:3600,channels:3}}).jpeg({quality:95}).toBuffer();expect(bytes.length).toBeLessThan(10*1024*1024);
 const input:GroupComparisonInput=await groupInput(1);input.files[0].image={filename:'photo.jpeg',mime:'image/jpeg',bytes};Object.assign(input.group.photos[0],{filename:'photo.jpeg',mime:'image/jpeg',bytes:bytes.length});
 const prepared=await preparePhotoGroup(input),store=new OfflineSpendStore();store.ceiling=50000000;
 await expect(prepareGpt41Request(prepared.photos[0].normalized.bytes,'image/jpeg',prepared.photos[0].descriptor.photoId)).rejects.toThrow('Detail byte bound');
 const transport=vi.fn<Transport>(async()=>{throw Error('Must not dispatch');});
 const result=await createGpt41GroupProvider({authorized:true,apiKey:'offline',store,transport}).extractGroup({schemaVersion:2,photos:prepared.photos.map(p=>({descriptor:p.descriptor,image:p.normalized.bytes})),photoSetSha256:prepared.photoSetSha256,...groupAttemptIds(input.group.groupId,1)});
 expect(result).toEqual({processing:'failed',code:'invalid-request'});expect(transport).not.toHaveBeenCalled();expect(store.rows.size).toBe(0);
},20000);

test('actual provider: two photos, independent contexts/one hold each; original metadata/assets and history unchanged',async()=>{
 const input:GroupComparisonInput=await groupInput(2);
 for(let i=0;i<2;i++){const b=await source(1000,2500,i?'#2099aa':'#c37136');input.files[i].image={filename:`photo${i}.jpeg`,mime:'image/jpeg',bytes:b};Object.assign(input.group.photos[i],{filename:`photo${i}.jpeg`,mime:'image/jpeg',bytes:b.length});}
 const prepared=await preparePhotoGroup(input),ids=groupAttemptIds(input.group.groupId,1),store=new OfflineSpendStore();store.ceiling=50000000;
 const request={schemaVersion:2 as const,photos:prepared.photos.map(p=>({descriptor:p.descriptor,image:p.normalized.bytes})),photoSetSha256:prepared.photoSetSha256,...ids};
 const transport=vi.fn<Transport>(async url=>Response.json(url===GPT41_CATALOG_URL?catalog:envelope));
 const provider=createGpt41GroupProvider({authorized:true,apiKey:'offline',store,transport});const result=await provider.extractGroup(request);
 expect(result.processing).toBe('complete');if(result.processing!=='complete')throw Error('Expected complete');
 const posts=transport.mock.calls.filter(([u])=>u===OPENROUTER_ENDPOINT);expect(posts).toHaveLength(2);expect(store.unresolved).toBe(2000000);
 for(const [,init] of posts){const body=JSON.parse(String(init.body)),c=content(body);expect(c).toHaveLength(6);const tag=JSON.parse(c[2].text),p=prepared.photos.find(p=>p.descriptor.photoId===tag.photoId)!;expect(p).toBeDefined();expect(imageBytes(c[1]).equals(p.normalized.bytes)).toBe(true);expect(String(init.body)).not.toContain(input.group.application.applicationId);for(const other of prepared.photos.filter(o=>o!==p)){expect(String(init.body)).not.toContain(other.descriptor.photoId);expect(String(init.body)).not.toContain(other.normalized.bytes.toString('base64'));}}
 expect(result.metadata.photos).toEqual(prepared.photos.map(p=>({photoId:p.descriptor.photoId,imageSha256:p.descriptor.normalized.sha256})));
 const record=finalizePhotoComparison(input.group.application,input.group.groupId,1,prepared.photos.map(p=>p.descriptor),prepared.photoSetSha256,result);expect(checkedServerRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
 const assets=prepareGroupAssets(record,prepared.photos.map(p=>({photoId:p.descriptor.photoId,original:p.original,normalized:p.normalized.bytes})));expect(validateAssetManifest(record,assets.id,assets.assets)).toEqual(assets.assets);
 expect((await provider.extractGroup(request)).processing).toBe('failed');expect(transport).toHaveBeenCalledTimes(4);
},20000);
