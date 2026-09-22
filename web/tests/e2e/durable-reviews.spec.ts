import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { ReviewStore } from '../../lib/review-store';
import { SqliteSpendStore } from '../../lib/sqlite-spend';
const fixtures=JSON.parse(readFileSync(new URL('../fixtures/comparisons.json',import.meta.url),'utf8'));
const confirmation='I reviewed this exact evidence and application and confirm this internal outcome';

test('durable single + batch save, lost-response retry, process restart and original evidence reopen',async({page})=>{
 test.setTimeout(180000);
 const artifacts=process.env.TTB_DURABLE_EVIDENCE_DIR;
 if(artifacts)mkdirSync(artifacts,{recursive:true});
 const root=mkdtempSync(join(artifacts??tmpdir(),'disposable-ttb-review-'));
 const spend=join(root,'spend'),reviews=join(root,'reviews');mkdirSync(spend,{mode:0o700});mkdirSync(reviews,{mode:0o700});
 SqliteSpendStore.provision(join(spend,'spend.sqlite'));ReviewStore.provision(join(reviews,'reviews.sqlite'));
 const listener=createServer();await new Promise<void>(r=>listener.listen(0,'127.0.0.1',r));const port=(listener.address() as {port:number}).port;await new Promise<void>(r=>listener.close(()=>r()));
 // NextRequest normalizes numeric loopback hosts to localhost. Keep exact-origin
 // security intact by using localhost in the browser and configured origin.
 const origin=`http://localhost:${port}`,code=randomUUID();
 let child:ChildProcess|undefined,log='',pids:number[]=[];
 const env={...process.env,TTB_TEST_PORT:String(port),TTB_TEST_DISPOSABLE:'yes',TTB_DEMO_ENABLED:'true',TTB_DEMO_ACCESS_SECRET:code,TTB_DEMO_ORIGIN:origin,TTB_DEMO_DATA_DIR:spend,TTB_REVIEW_DATA_DIR:reviews,TTB_DEMO_PERSISTENT_VOLUME:'single-private-volume-v1',OPENROUTER_API_KEY:'synthetic-unused-key'};
 async function start(){
  child=spawn(process.execPath,['--import','tsx','tests/fixtures/durable-server.ts'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});pids.push(child.pid!);
  await new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Service readiness timeout: '+log)),45000);
   child!.once('exit',exit=>{clearTimeout(timer);reject(Error('Service exited '+exit+': '+log));});
   child!.stdout!.on('data',chunk=>{const s=String(chunk);log+=s;if(s.includes('READY pid=')){clearTimeout(timer);resolve();}});
   child!.stderr!.on('data',chunk=>{log+=String(chunk);});
  });
  expect((await fetch(origin+'/review')).status).toBe(200);
 }
 async function stop(){if(child&&child.exitCode===null){const current=child;await new Promise<void>(r=>{current.once('exit',()=>r());current.kill('SIGTERM');});}}
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await start();
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin+'/review');const source=page.getByLabel('Input source');if(await source.count())await source.selectOption('manual');
  await page.getByLabel('Label image (JPEG or PNG)',{exact:true}).setInputFiles('public/offline-samples/match.png');
  await page.locator('#entry-application-tab').click();
  const application={...fixtures.application,applicationId:'DURABLE-SYNTHETIC-001',applicationVersion:'original-v1'};
  for(const key of ['applicationId','applicationVersion','brand','classType','abv','netContents','producerName','producerAddress'])await page.locator('#'+key).fill(String(application[key]));
  await page.locator('#commodity').selectOption(application.commodity);await page.locator('#imported').selectOption(String(application.imported));await page.locator('#originKind').selectOption(application.origin.kind);await page.locator('#country').fill(application.origin.country);
  await page.getByLabel('Demo access code',{exact:true}).fill(code);await page.getByRole('button',{name:'Verify access',exact:true}).click();await expect(page.getByText('✓ Access verified',{exact:true})).toBeVisible();
  const comparing=page.waitForResponse(r=>r.url()===origin+'/api/comparisons');
  await page.getByRole('button',{name:'Submit for comparison',exact:true}).click();const compared=await(await comparing).json();expect(compared.comparisonId).toBeTruthy();
  await expect(page.getByRole('radio',{name:'Pass',exact:true})).toBeDisabled();
  await page.getByRole('radio',{name:'Second reviewer',exact:true}).check();await page.getByLabel('Correction / escalation notes').fill('Synthetic durability proof: original evidence needs another reviewer.');await page.getByLabel(confirmation).check();
  let firstReceipt:unknown,requests:unknown[]=[];
  // Commit really happens; only its HTTP response is lost. Browser must not claim SAVED.
  await page.route('**/api/reviews',async route=>{
   requests.push(route.request().postDataJSON());

   if(requests.length===1){const response=await route.fetch();expect(response.status()).toBe(200);firstReceipt=(await response.json()).receipt;await route.abort('failed');}
   else await route.continue();
  });
  await page.getByRole('button',{name:'Submit review',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'UNSAVED — receipt not confirmed'})).toBeVisible();await expect(page.getByTestId('saved-review')).toHaveCount(0);
  if(artifacts)await page.screenshot({path:join(artifacts,'01-unsaved-response-loss.png'),fullPage:true});
  await page.getByRole('button',{name:'Submit review',exact:true}).click();await expect(page.getByTestId('saved-review')).toContainText('SAVED — durable');expect(requests[1]).toEqual(requests[0]);
  if(artifacts)await page.screenshot({path:join(artifacts,'02-single-saved.png'),fullPage:true});
  await page.unroute('**/api/reviews');
  // Batch uses the same real save endpoint, never the reducer as receipt authority.
  await page.getByRole('tab',{name:'Batch upload',exact:true}).click();
  const mode=page.getByLabel('Batch execution mode');if(await mode.count())await mode.selectOption('live');
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  const png=readFileSync('public/offline-samples/match.png');
  await page.getByLabel('Batch label images').setInputFiles(['a.png','b.png'].map(name=>({name,mimeType:'image/png',buffer:png})));
  const manifest=['a.png','b.png'].map(filename=>({filename,application:{...fixtures.application,applicationId:'DURABLE-BATCH-'+filename}}));
  await page.locator('#batch-input-application-tab').click();await page.getByLabel('Application manifest file (JSON)').setInputFiles({name:'manifest.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(manifest))});await page.getByRole('button',{name:'Validate batch manifest',exact:true}).click();await page.getByRole('button',{name:'Start live batch',exact:true}).click();
  await expect(page.getByTestId('batch-summary')).toContainText('Compared: 2');
  await page.getByRole('button',{name:'Open review',exact:true}).first().click();
  const activePair=page.getByTestId('active-pair');
  await activePair.getByRole('radio',{name:'Second reviewer',exact:true}).check();await activePair.getByLabel('Correction / escalation notes').fill('Synthetic batch durable human decision.');await activePair.getByLabel(confirmation).check();await activePair.getByRole('button',{name:'Submit review',exact:true}).click();
  await expect(page.getByTestId('batch-summary')).toContainText('Saved reviews: 1');
  await page.getByRole('button',{name:'Open b.png',exact:true}).click();await expect(activePair.getByTestId('saved-review')).toHaveCount(0);
  await page.getByRole('button',{name:'Open a.png',exact:true}).click();await expect(activePair.getByTestId('saved-review')).toContainText('SAVED — durable');
  if(artifacts)await page.screenshot({path:join(artifacts,'03-batch-saved.png'),fullPage:true});
  await page.getByText('Replace this pair with a new application version',{exact:true}).click();await page.getByLabel('Replacement application JSON').fill(JSON.stringify({...manifest[0].application,applicationVersion:'replacement-v2'}));await page.getByRole('button',{name:'Replace selected pair',exact:true}).click();
  await expect(activePair).toContainText('Revision 2');await expect(activePair.getByTestId('saved-review')).toHaveCount(0);await expect(page.getByTestId('batch-summary')).toContainText('Saved reviews: 0');
  // A new OS process, same explicitly provisioned SQLite files, empty browser state.
  await stop();await start();expect(pids[1]).not.toBe(pids[0]);await page.reload();
  await page.getByLabel('Demo access code',{exact:true}).fill(code);await page.getByRole('button',{name:'Verify access',exact:true}).click();await expect(page.getByText('✓ Access verified',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Load saved reviews',exact:true}).click();
  await page.getByRole('button',{name:'Reopen DURABLE-SYNTHETIC-001 / original-v1 — second-review',exact:true}).click();
  await expect(page.getByTestId('reopened-review')).toContainText('SAVED — original review reopened');
  await page.getByText('Original application declarations',{exact:true}).click();
  const original=page.getByTestId('original-application');for(const value of Object.values(compared.result.application))await expect(original).toContainText(typeof value==='object'?Object.values(value as object).join(' · '):String(value));
  const image=page.getByAltText('Preserved normalized label from saved review');await expect(image).toBeVisible();expect(await image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  const store=new ReviewStore(join(reviews,'reviews.sqlite'));const list=store.list();expect(list).toHaveLength(2);const saved=list.find(r=>r.application.applicationId===application.applicationId)!;expect(saved.receipt).toEqual(firstReceipt);const detail=store.detail(saved.receipt.reviewId);expect(detail.record).toEqual(compared.result);const bytes=store.evidence(saved.receipt.reviewId).bytes;expect(createHash('sha256').update(bytes).digest('hex')).toBe(compared.result.imageSha256);store.close();
  // No public access to original label, including after restart.
  const denied=await fetch(origin+`/api/reviews/${saved.receipt.reviewId}/evidence`,{method:'POST',headers:{origin}});expect(denied.status).toBe(403);expect(denied.headers.get('cache-control')).toBe('no-store');
  if(artifacts){await page.screenshot({path:join(artifacts,'04-reopened-after-restart.png'),fullPage:true});writeFileSync(join(artifacts,'persistence-proof.json'),JSON.stringify({pids,reviewDb:join(reviews,'reviews.sqlite'),receipt:saved.receipt,record:detail.record,intent:detail.intent,imageSha256:createHash('sha256').update(bytes).digest('hex'),savedReviewCount:list.length,identicalRetry:JSON.stringify(requests[0])===JSON.stringify(requests[1]),unauthenticatedEvidenceStatus:denied.status,browserErrors:errors},null,2));writeFileSync(join(artifacts,'preserved-normalized-label.png'),bytes);}
  expect(errors).toEqual([]);
 }finally{await stop();if(artifacts)writeFileSync(join(artifacts,'service-restart.log'),log);else rmSync(root,{recursive:true,force:true});}
});
