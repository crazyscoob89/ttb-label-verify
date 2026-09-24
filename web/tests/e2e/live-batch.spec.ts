import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createDemoHandler } from '../../lib/demo-route';
import { SqliteSpendStore } from '../../lib/sqlite-spend';
import { privateLedgerDir } from '../fixtures/private-ledger';
const fixtures = JSON.parse(readFileSync(new URL('../fixtures/comparisons.json', import.meta.url), 'utf8'));
const confirmation = 'I reviewed this exact evidence and application and confirm this internal outcome';

test('live batch retains Files/tabs, caps two slots, fences edited revision, and creates only UNSAVED drafts', async ({ page, baseURL }) => {
  const dir = privateLedgerDir(); const path = join(dir,'spend.sqlite'); SqliteSpendStore.provision(path);
  const code = 'synthetic-browser-batch-0123456789abcdef';
  const env = { TTB_DEMO_ENABLED:'true', TTB_DEMO_ACCESS_SECRET:code, TTB_DEMO_ORIGIN:'', TTB_DEMO_DATA_DIR:dir, TTB_DEMO_PERSISTENT_VOLUME:'single-private-volume-v1', OPENROUTER_API_KEY:'synthetic-key' };
  const releases: (() => void)[] = []; let paidCalls = 0; let phases: string[] = [];
  const handler = createDemoHandler({ env, transport:async url => {
    if (url.endsWith('/models')) return Response.json({data:[{id:'anthropic/claude-haiku-4.5',context_length:200000,pricing:{prompt:'0.000001',completion:'0.000005'}}]});
    paidCalls++;
    if (paidCalls <= 2) await new Promise<void>(resolve => { releases.push(resolve); });
    return Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(fixtures.evidence)}}]});
  } });
  // Same-origin loopback harness passes real multipart File bytes to guarded code.
  // Synthetic transport only; production ledger/credentials are never discovered.
  const server = createServer(async (req,res) => {
    try {
      let response: Response;
      if (req.url === '/api/comparisons') {
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const headers = new Headers(); for (const [key,value] of Object.entries(req.headers)) if(typeof value==='string') headers.set(key,value);
        phases.push(headers.get('x-ttb-batch-phase') ?? 'single');
        response = await handler(new Request(env.TTB_DEMO_ORIGIN+req.url,{method:'POST',headers,body:new Uint8Array(Buffer.concat(chunks))}));
      } else response = await fetch(baseURL+req.url!);
      res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')??'application/octet-stream'});res.end(Buffer.from(await response.arrayBuffer()));
    } catch {res.writeHead(500);res.end();}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  env.TTB_DEMO_ORIGIN=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.route('**/*',route=>new URL(route.request().url()).origin===env.TTB_DEMO_ORIGIN?route.continue():route.abort());
    await page.goto(env.TTB_DEMO_ORIGIN+'/review');
    await page.getByLabel('Input source').selectOption('manual');
    await page.locator('#brand').fill('Single state retained');
    await page.getByLabel('Label image (JPEG or PNG)',{exact:true}).setInputFiles('public/offline-samples/match.png');
    await page.getByRole('tab',{name:'Batch upload',exact:true}).click();
    const mode=page.getByLabel('Batch execution mode'); if (await mode.count()) await mode.selectOption('live');
    const png=readFileSync('public/offline-samples/match.png');
    await page.getByLabel('Batch label images').setInputFiles(['a.png','b.png','bad.png'].map(name=>({name,mimeType:'image/png',buffer:name==='bad.png'?Buffer.from('invalid png'):png})));
    const manifest=['a.png','b.png','bad.png'].map(filename=>({filename,application:{...fixtures.application,applicationId:filename}}));
    await page.getByLabel('Batch JSON manifest').fill(JSON.stringify(manifest));
    await page.getByRole('button',{name:'Validate batch manifest',exact:true}).click();
    await expect(page.getByTestId('manifest-counts')).toContainText('Valid: 3');
    expect(phases).toEqual([]);
    await page.getByRole('button',{name:'Start live batch',exact:true}).click();
    await expect.poll(()=>paidCalls).toBe(2);
    await expect(page.getByTestId('batch-summary')).toContainText('Occupied slots: 2');
    expect(phases.filter(p=>p==='prepare')).toHaveLength(2);
    await page.getByText('Replace this pair with a new application version',{exact:true}).click();
    await page.getByLabel('Replacement application JSON').fill(JSON.stringify({...manifest[0].application,applicationVersion:'v2',brand:'New revision brand'}));
    await page.getByRole('button',{name:'Replace selected pair',exact:true}).click();
    await expect(page.getByTestId('active-pair')).toContainText('Revision 2');
    // Switch while both original slots are occupied; neither workspace unmounts.
    await page.getByRole('tab',{name:'Single review',exact:true}).click();
    await expect(page.locator('#brand')).toHaveValue('Single state retained');
    expect(await page.getByLabel('Label image (JPEG or PNG)',{exact:true}).evaluate((input:HTMLInputElement)=>input.files?.[0].name)).toBe('match.png');
    await page.getByRole('tab',{name:'Batch upload',exact:true}).click();
    await expect(page.getByTestId('batch-summary')).toContainText('Occupied slots: 2');
    // Resolve second before first. The corrupt third file must fail preparation.
    releases[1]();
    await expect(page.getByTestId('batch-summary')).toContainText('Failed: 1');
    releases[0]();
    await expect(page.getByTestId('batch-summary')).toContainText('Occupied slots: 0');
    expect(paidCalls).toBe(2); expect(phases.filter(p=>p==='execute')).toHaveLength(2);
    await expect(page.getByTestId('active-pair')).toContainText('Revision 2');
    await expect(page.getByRole('table')).toHaveCount(0);
    // Replacement wasn't included in the old start click. New explicit start only.
    await page.getByRole('button',{name:'Start live batch',exact:true}).click();
    await expect(page.getByRole('table')).toBeVisible(); expect(paidCalls).toBe(3);
    await expect(page.getByRole('row')).toHaveCount(8); // all seven fields
    await expect(page.getByTestId('active-pair')).toContainText('New revision brand');
    await page.getByRole('radio',{name:'Second reviewer',exact:true}).check();
    await page.getByLabel('Correction / escalation notes').fill('Synthetic-only live batch draft.');
    await page.getByLabel(confirmation).check();
    await page.getByRole('button',{name:'Submit review',exact:true}).click();
    await expect(page.getByTestId('unsaved-draft')).toContainText('UNSAVED');
    await expect(page.getByTestId('batch-summary')).toContainText('Saved reviews: 0');
    await page.getByRole('tab',{name:'Single review',exact:true}).click();
    await page.getByRole('tab',{name:'Batch upload',exact:true}).click();
    await expect(page.getByTestId('unsaved-draft')).toContainText('Synthetic-only live batch draft.');
    await expect(page.getByLabel('Batch JSON manifest')).toHaveValue(JSON.stringify(manifest));
    expect(await page.getByLabel('Batch label images').evaluate((input:HTMLInputElement)=>input.files?.length)).toBe(3);
    // No implicit retry for the invalid third image. Manual retry prepares only.
    await page.getByRole('button',{name:'Open bad.png',exact:true}).click();
    const previousPhases=phases.length;
    await page.getByRole('button',{name:'Retry selected pair (new paid intent)',exact:true}).click();
    await expect(page.getByTestId('batch-summary')).toContainText('Occupied slots: 0');
    await expect.poll(()=>phases.length).toBe(previousPhases+1);
    expect(phases.at(-1)).toBe('prepare'); expect(paidCalls).toBe(3);
    const store=new SqliteSpendStore(path); expect(store.totals().unresolvedMicrousd).toBe(3_000_000);store.close();
    expect(errors).toEqual([]);
  } finally {
    releases.forEach(release=>release());server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});
  }
});
