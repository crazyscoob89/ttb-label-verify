import type {Page} from '@playwright/test';
import {test,expect,verifyAccess,PUBLIC_DEMO_SESSION} from './ui-diagnostics';
import {singletonWire} from './singleton-wire-fixture';
import type {UiCompleteComparison} from '../../lib/live-photo-client';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compareApplication } from '../../lib/rules';
const fixtures=JSON.parse(readFileSync(new URL('../fixtures/comparisons.json',import.meta.url),'utf8'));
import type { Application } from '../../lib/contracts';
const directory=process.env.V3_EVIDENCE_DIR||'/opt/data/ttb-v3-evidence';
const bytes=readFileSync('public/offline-samples/match.png');
const hash=createHash('sha256').update(bytes).digest('hex');
const code='synthetic-ui-only-session-code';
// Match the frozen v3 reference widths; retain each project's touch/device behavior.
test.beforeEach(async({page},info)=>{await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});});
const comparisonId='00000000-0000-4000-8000-000000000011', reviewId='00000000-0000-4000-8000-000000000022';
function record(application:Application){return {processing:'complete',source:'openrouter',application,evidence:fixtures.evidence,imageSha256:hash,comparison:compareApplication(application,fixtures.evidence)};}
async function screenshot(page:Page,name:string,project:string){
 mkdirSync(directory,{recursive:true});
 await page.evaluate(()=>{const note=document.createElement('p');note.id='acceptance-provenance';note.textContent='LOCAL UI ACCEPTANCE · MOCK API RESPONSES · NO LIVE PROVIDER OR STORAGE PROOF';note.style.cssText='margin:0;padding:8px 18px;background:#fff6df;color:#684600;font:12px Arial';document.body.prepend(note);});
 try{await page.screenshot({path:`${directory}/${name}-${project}.png`,fullPage:true,scale:'css'});}finally{await page.locator('#acceptance-provenance').evaluate(node=>node.remove());}
}
async function application(page:Page,abv=45){
 await page.locator('#entry-application-tab').click();
 for(const key of ['applicationId','applicationVersion','brand','classType','abv','netContents','producerName','producerAddress'] as const)await page.locator(`#${key}`).fill(String(key==='abv'?abv:fixtures.application[key]));
 await page.locator('#commodity').selectOption(fixtures.application.commodity);await page.locator('#imported').selectOption(String(fixtures.application.imported));await page.locator('#originKind').selectOption(fixtures.application.origin.kind);await page.locator('#country').fill(fixtures.application.origin.country);
}
async function verify(page:Page){await verifyAccess(page,code);}
async function enter(page:Page){await page.goto('/review');const mode=page.getByLabel('Input source');if(await mode.count())await mode.selectOption('manual');}

test('live v3 restoration: independent intake, one access session, inline resolution, honest save and original history',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));let checks=0,comparisons=0,saves=0;let savedIntent:unknown;
 const legacy=record({...fixtures.application,abv:45} as Application);let original:UiCompleteComparison=legacy as UiCompleteComparison;
 const receipt={state:'SAVED',reviewId,comparisonId,savedAt:'2026-09-22T12:00:00Z',identity:'Public demo use — NOT an individually authenticated reviewer'};
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  expect(request.headers()['x-ttb-demo-code']).toBe(PUBLIC_DEMO_SESSION);expect(request.url()).not.toContain(code);
  if(path==='/api/reviews/list'){checks++;return route.fulfill({json:{reviews:saves>1?[{receipt,application:original.application,outcome:'correction'}]:[]}});}
  if(path==='/api/comparisons')return singletonWire(route,legacy,bytes,result=>{comparisons++;original=result;});
  if(path==='/api/reviews'){saves++;savedIntent=request.postDataJSON().intent;return route.fulfill(saves===1?{status:503,json:{code:'reviews-unavailable'}}:{json:{receipt}});}
  if(path===`/api/reviews/${reviewId}`)return route.fulfill({json:{receipt,record:original,intent:savedIntent}});
  if(path===`/api/reviews/${reviewId}/evidence`||path.includes(`/api/reviews/${reviewId}/photos/`))return route.fulfill({body:bytes,contentType:'image/png'});
  return route.abort();
 });
 await enter(page);
 await expect(page.locator('input[type=password]')).toHaveCount(0);
 await page.getByLabel('Label image (JPEG or PNG)',{exact:true}).setInputFiles('public/offline-samples/match.png');
 await expect(page.getByAltText('Selected label — not analyzed')).toBeVisible();expect(comparisons).toBe(0);
 await expect(page.locator('#brand')).not.toBeVisible();await screenshot(page,'live-entry',info.project.name);
 await verify(page);expect(checks).toBe(0);await expect(page.locator('input[type=password]')).toHaveCount(0);
 await application(page);await page.getByRole('button',{name:'Submit for comparison',exact:true}).click();
 const results=page.getByRole('region',{name:'Live comparison results'});
 await expect(results.getByRole('table')).toBeVisible();await expect(results.locator('tbody>tr')).toHaveCount(7);
 await expect(results.getByAltText('other · match.png · original',{exact:true})).toBeVisible();
 await expect(results.locator('pre:visible')).toHaveCount(0);await expect(page.locator('#brand')).not.toBeVisible();
 await expect(results.getByRole('radio',{name:'Pass',exact:true})).toBeDisabled();
 await expect(results.getByRole('group',{name:'Internal review outcome',exact:true})).toHaveCount(1);
 await screenshot(page,'live-single-mismatch',info.project.name);
 await results.getByRole('button',{name:'Enlarge label'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Close preview'}).click();
 const row=results.locator('[data-field=abv]');await row.getByText('Resolve this field',{exact:true}).click();await row.getByLabel('Human resolution for Alcohol by volume',{exact:true}).selectOption('confirmed-mismatch');
 await row.getByLabel('Resolution reason for Alcohol by volume').fill('Synthetic acceptance: actual label differs from declaration.');await row.getByLabel('Supporting evidence for Alcohol by volume').fill('Synthetic acceptance: reference 45%; fixture text 40%.');await expect(row.getByTestId('resolved-abv')).toHaveCount(0);await row.getByRole('button',{name:'Confirm resolution for Alcohol by volume'}).click();await expect(row.getByTestId('resolved-abv')).toContainText('locally confirmed');
 await expect(results.getByRole('radio',{name:'Pass',exact:true})).toBeDisabled();await screenshot(page,'live-inline-resolution',info.project.name);
 await results.getByRole('radio',{name:'Request correction',exact:true}).check();await results.getByLabel('Correction / escalation notes').fill('Synthetic acceptance: correct the ABV declaration before approval.');
 const confirm=results.getByRole('checkbox',{name:/I reviewed this exact/});await confirm.check();await results.getByRole('radio',{name:'Second reviewer',exact:true}).check();await expect(confirm).not.toBeChecked();
 await results.getByRole('radio',{name:'Request correction',exact:true}).check();await confirm.check();
 await page.getByRole('tab',{name:'Batch upload',exact:true}).click();await expect(page.locator('input[type=password]')).toHaveCount(0);await page.getByRole('tab',{name:'Single review',exact:true}).click();await expect(confirm).not.toBeChecked();
 await confirm.check();await results.getByRole('button',{name:'Submit review',exact:true}).click();await expect(results.getByRole('alert')).toContainText('UNSAVED');await expect(results.getByTestId('saved-review')).toHaveCount(0);
 await results.getByRole('button',{name:'Submit review',exact:true}).click();await expect(results.getByTestId('saved-review')).toContainText('SAVED — durable');expect(comparisons).toBe(1);
 await page.getByRole('button',{name:'Change input',exact:true}).click();await page.locator('#brand').fill('Changed current input');await expect(results).toHaveCount(0);
 await page.getByRole('button',{name:'Load saved reviews'}).click();await page.getByRole('button',{name:/Reopen RULES/}).click();
 const reopened=page.getByTestId('reopened-review');await expect(reopened.getByRole('table')).toBeVisible();await reopened.getByText('Original application declarations',{exact:true}).click();await expect(reopened.getByTestId('original-application')).toContainText('Old Harbor');await expect(reopened).not.toContainText('Changed current input');await expect(reopened.getByRole('radio')).toHaveCount(0);
 await screenshot(page,'live-reopened-original',info.project.name);
 expect(await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage]))).not.toContain(code);expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Reset page session',exact:true}).click();await expect(page.locator('input[type=password]')).toHaveCount(0);await expect(reopened).toHaveCount(0);
});

test('public session has no reviewer-entered code or secret persistence',async({page})=>{
 await enter(page);const region=page.getByRole('region',{name:'Demo session access'});
 await expect(region.getByText('✓ Public demo access',{exact:true})).toBeVisible();
 await expect(page.locator('input[type=password]')).toHaveCount(0);
 await page.reload();await expect(page.locator('input[type=password]')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage]))).not.toContain(code);
});

test('matching live evidence still requires independent physical assessment before Pass',async({page},info)=>{
 await page.route('**/api/**',route=>new URL(route.request().url()).pathname==='/api/reviews/list'?route.fulfill({json:{reviews:[]}}):singletonWire(route,record(fixtures.application as Application),bytes,()=>{},false));
 await enter(page);await verify(page);await page.getByLabel('Label image (JPEG or PNG)',{exact:true}).setInputFiles('public/offline-samples/match.png');await application(page,40);await page.getByRole('button',{name:'Submit for comparison',exact:true}).click();
 const results=page.getByRole('region',{name:'Live comparison results'}),pass=results.getByRole('radio',{name:'Pass',exact:true});await expect(pass).toBeDisabled();await results.locator('.physical summary').click();await expect(results.getByLabel('Physical assessment notes')).toHaveValue('');await expect(results.getByRole('checkbox',{name:/I assessed physical/})).not.toBeChecked();
 // This is an explicit synthetic human statement exercising policy, not a real measurement.
 await results.getByLabel('Physical assessment notes').fill('Synthetic test-only independent print assessment; not a real bottle measurement.');await results.getByRole('checkbox',{name:/I assessed physical/}).check();await expect(pass).toBeEnabled();await pass.check();await results.getByRole('checkbox',{name:/I reviewed this exact/}).check();await expect(results.getByRole('button',{name:'Submit review',exact:true})).toBeEnabled();await screenshot(page,'live-pass-gating',info.project.name);
 await results.getByRole('button',{name:'Submit review',exact:true}).click();await expect(results.getByTestId('unsaved-draft')).toContainText('UNSAVED draft');await expect(results.getByTestId('saved-review')).toHaveCount(0);
 await page.getByRole('button',{name:'Change input',exact:true}).click();await page.locator('#entry-images-tab').click();await page.getByLabel('Label image (JPEG or PNG)',{exact:true}).setInputFiles('public/offline-samples/discrepancy.png');await expect(results).toHaveCount(0);
});

test('live Batch/C overview and horizontal selected review preserve per-record decisions, never bulk approve',async({page},info)=>{
 const appA={...fixtures.application,applicationId:'BATCH-A',abv:45} as Application,appB={...fixtures.application,applicationId:'BATCH-B'} as Application;
 let runs=0;
 await page.route('**/api/**',async route=>{
  const request=route.request();expect(request.headers()['x-ttb-demo-code']).toBe(PUBLIC_DEMO_SESSION);
  if(new URL(request.url()).pathname==='/api/reviews/list')return route.fulfill({json:{reviews:[]}});
  const body=await new Response(new Uint8Array(request.postDataBuffer()!),{headers:{'content-type':request.headers()['content-type']}}).formData();const group=JSON.parse(String(body.get('group')));return singletonWire(route,record(group.application.applicationId==='BATCH-A'?appA:appB),bytes,()=>{runs++;},false);
 });
 await enter(page);await verify(page);await page.getByRole('tab',{name:'Batch upload',exact:true}).click();
 const batch=page.locator('#batch-panel');
 await batch.getByLabel('Batch label images',{exact:true}).setInputFiles([{name:'a.png',mimeType:'image/png',buffer:bytes},{name:'b.png',mimeType:'image/png',buffer:bytes}]);
 await batch.getByRole('tab',{name:'Application',exact:true}).click();await batch.getByLabel('Application manifest file (JSON)').setInputFiles({name:'mapping.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{filename:'a.png',application:appA},{filename:'b.png',application:appB}]))});
 await batch.getByRole('button',{name:'Validate batch manifest'}).click();await expect(batch.getByTestId('manifest-counts')).toContainText('Valid: 2');
 await batch.getByRole('button',{name:'Start live batch',exact:true}).click();await expect(batch.getByTestId('batch-summary')).toContainText('Compared: 2');expect(runs).toBe(2);
 await screenshot(page,'live-batch-overview',info.project.name);
 await batch.getByRole('button',{name:'Open review',exact:true}).first().click();const active=batch.getByTestId('active-pair');await expect(active.getByRole('table')).toBeVisible();await expect(batch.getByRole('region',{name:'Batch preparation'})).not.toBeVisible();
 await active.getByRole('radio',{name:'Request correction',exact:true}).check();await active.getByLabel('Correction / escalation notes').fill('Synthetic acceptance: correction for batch A only.');await active.getByRole('checkbox',{name:/I reviewed this exact/}).check();
 await screenshot(page,'live-batch-switcher',info.project.name);
 await active.getByRole('button',{name:'Submit review',exact:true}).click();await expect(active.getByTestId('unsaved-draft')).toBeVisible();
 await page.getByRole('tab',{name:'Single review',exact:true}).click();await page.getByRole('tab',{name:'Batch upload',exact:true}).click();await expect(active.getByTestId('unsaved-draft')).toBeVisible();await expect(active.getByRole('checkbox',{name:/I reviewed this exact/})).not.toBeChecked();
 await batch.getByRole('button',{name:'Next item',exact:true}).click();await expect(active.getByLabel('Correction / escalation notes')).toHaveValue('');await expect(active.getByRole('checkbox',{name:/I reviewed this exact/})).not.toBeChecked();
 await batch.getByRole('button',{name:'Previous item',exact:true}).click();await expect(active.getByLabel('Correction / escalation notes')).toHaveValue('Synthetic acceptance: correction for batch A only.');await expect(active.getByRole('checkbox',{name:/I reviewed this exact/})).not.toBeChecked();
 await batch.getByRole('button',{name:'Batch overview',exact:true}).click();await expect(batch.getByRole('button',{name:'Open review',exact:true})).toHaveCount(2);await expect(active).not.toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
