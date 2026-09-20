import { test, expect } from '@playwright/test';
import { rmSync, readFileSync } from 'node:fs';
import { privateLedgerDir } from '../fixtures/private-ledger';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createDemoHandler } from '../../lib/demo-route';
import { SqliteSpendStore } from '../../lib/sqlite-spend';
const fixtures = JSON.parse(readFileSync(new URL('../fixtures/comparisons.json', import.meta.url),'utf8'));

test('browser upload through real guarded handler and synthetic provider transport',async({page,baseURL})=>{
 const dir=privateLedgerDir();SqliteSpendStore.provision(join(dir,'spend.sqlite'));
 const code='synthetic-only-browser-code-0123456789abcdef';let calls=0;
 const env={TTB_DEMO_ENABLED:'true',TTB_DEMO_ACCESS_SECRET:code,TTB_DEMO_ORIGIN:'',TTB_DEMO_DATA_DIR:dir,TTB_DEMO_PERSISTENT_VOLUME:'single-private-volume-v1',OPENROUTER_API_KEY:'synthetic-key'};
 const handler=createDemoHandler({env,transport:async(url)=>{calls++;return url.endsWith('/models')?Response.json({data:[{id:'anthropic/claude-haiku-4.5',context_length:200000,pricing:{prompt:'0.000001',completion:'0.000005'}}]}):Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(fixtures.evidence)}}]});}});
 // Local same-origin HTTP harness; do not use Playwright postDataBuffer, which
 // omits multipart file bytes. Assets proxy to Next; the API uses the real handler.
 const server=createServer(async(req,res)=>{
  try {
   let response:Response;
   if(req.url==='/api/comparisons'){
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(typeof value==='string')headers.set(key,value);
    response=await handler(new Request(`${env.TTB_DEMO_ORIGIN}${req.url}`,{method:'POST',headers,body:new Uint8Array(Buffer.concat(chunks))}));
   }else response=await fetch(`${baseURL}${req.url}`);
   res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')??'application/octet-stream'});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end();}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));env.TTB_DEMO_ORIGIN=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 try {
 await page.route('**/*',route=>new URL(route.request().url()).origin===env.TTB_DEMO_ORIGIN?route.continue():route.abort());
 await page.goto(`${env.TTB_DEMO_ORIGIN}/review`);await page.getByLabel('Input source').selectOption('manual');
 await page.getByLabel('Label image (JPEG or PNG)',{exact:true}).setInputFiles('public/offline-samples/match.png');
 for(const key of ['applicationId','applicationVersion','brand','classType','abv','netContents','producerName','producerAddress'] as const) await page.locator(`#${key}`).fill(String(fixtures.application[key]));
 await page.locator('#commodity').selectOption(fixtures.application.commodity);await page.locator('#imported').selectOption(String(fixtures.application.imported));await page.locator('#originKind').selectOption(fixtures.application.origin.kind);await page.locator('#country').fill(fixtures.application.origin.country);
 await page.getByLabel('Demo access code',{exact:true}).fill(code);await page.getByRole('button',{name:'Submit for comparison',exact:true}).click();
 await expect(page.getByRole('table')).toBeVisible();await expect(page.getByText(/Measured elapsed time:/)).toBeVisible();await expect(page.getByText(/Source: openrouter/)).toBeVisible();await expect(page.getByRole('radio',{name:'Pass',exact:true})).toBeDisabled();expect(calls).toBe(2);
 await page.locator('#brand').fill('Changed');await expect(page.getByRole('table')).toHaveCount(0);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});}
});
