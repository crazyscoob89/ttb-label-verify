import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { image } from '../fixtures/synthetic';
const samples = JSON.parse(readFileSync(new URL('../../lib/offline-samples.json', import.meta.url), 'utf8'));
const forbiddenTraffic = new WeakMap<Page, string[]>();
const browserErrors = new WeakMap<Page, string[]>();

const confirmation = 'I reviewed this exact evidence and application and confirm this internal outcome';
const panel = (page: Page) => page.getByRole('tabpanel');
const choose = (page: Page, filename: string) => page.getByRole('button', { name: `Open ${filename}`, exact: true }).click();
async function load(page: Page) {
  await page.getByRole('button', { name: 'Load synthetic fixture batch', exact: true }).click();
  await expect(page.getByText('4 files selected', { exact: true })).toBeVisible();
}
async function validate(page: Page) {
  await page.getByRole('button', { name: 'Validate batch manifest', exact: true }).click();
  await expect(page.getByTestId('manifest-counts')).toBeVisible();
}
async function compare(page: Page) {
  await load(page); await validate(page);
  await page.getByRole('button', { name: 'Compare queued fixtures', exact: true }).click();
  await expect(page.getByTestId('batch-summary')).toContainText('Compared: 3');
  await expect(page.getByTestId('batch-summary')).toContainText('Failed: 1');
}

test.beforeEach(async ({ page, baseURL }) => {
  const traffic: string[] = []; const errors: string[] = [];
  forbiddenTraffic.set(page, traffic); browserErrors.set(page, errors);
  // Existing CSP denies React development eval; Next requests its local stack
  // diagnostics on first load. This is not an application/provider API call.
  page.on('request', request=>{const url=new URL(request.url());const devStack=request.method()==='POST'&&url.pathname==='/__nextjs_original-stack-frames';if(url.origin!==new URL(baseURL!).origin||url.pathname.startsWith('/api/')||(request.method()!=='GET'&&!devStack))traffic.push(request.url());});
  page.on('pageerror', error=>errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL!).origin || url.pathname.startsWith('/api/')) return route.abort();
    return route.continue();
  });
  await page.goto('/review');
  await expect(page.getByRole('tab', { name: 'Batch upload', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Batch upload', exact: true }).click();
});

test.afterEach(async ({page})=>{
  expect(forbiddenTraffic.get(page)).toEqual([]);
  expect(browserErrors.get(page)).toEqual([]);
});

test('explicit manifest rejects missing, duplicate and invalid mappings without list-order pairing', async ({ page }, info) => {
  await load(page);
  const manifest = JSON.parse(await page.getByLabel('Batch JSON manifest').inputValue());
  manifest.reverse();
  manifest.find((row: {filename:string}) => row.filename === 'discrepancy.png').application.abv = '';
  manifest.push(structuredClone(manifest.find((row: {filename:string}) => row.filename === 'failure.png')));
  await page.getByLabel('Batch JSON manifest').fill(JSON.stringify(manifest.filter((row: {filename:string}) => row.filename !== 'uncertainty.png')));
  await validate(page);
  await expect(page.getByTestId('manifest-counts')).toContainText('Valid: 1 · Blocked: 3');
  await expect(page.getByTestId('manifest-entries')).toContainText('duplicate-mapping');
  await expect(page.getByTestId('manifest-entries')).toContainText('invalid-application');
  await expect(page.getByTestId('manifest-entries')).toContainText('missing-mapping');
  await page.getByRole('button', { name: 'Compare queued fixtures', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByTestId('active-pair')).toContainText(samples.match.application.applicationId);
  await expect(page.getByTestId('batch-summary')).toContainText('Compared: 1');
  await choose(page, 'discrepancy.png');
  await expect(page.getByRole('button', { name: 'Submit review', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('batch-manifest-blocked.png'),fullPage:true});
});

test('exact known fixtures compare, previews decode, unknown same-name uploads never receive sample evidence', async ({ page }, info) => {
  const traffic: string[] = []; const errors: string[] = [];
  page.on('request', req => { if (req.method() !== 'GET' || new URL(req.url()).pathname.startsWith('/api/') || new URL(req.url()).origin !== new URL(page.url()).origin) traffic.push(req.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await compare(page);
  await expect.poll(() => page.getByRole('img',{name:'Exact batch synthetic label'}).evaluate((img:HTMLImageElement) => img.naturalWidth)).toBe(840);
  await expect(page.getByRole('row').filter({hasText:'Alcohol by volume'})).toContainText('match');
  await choose(page,'discrepancy.png');
  await expect(page.getByRole('row').filter({hasText:'Alcohol by volume'})).toContainText('mismatch');
  await page.getByRole('button',{name:'Enlarge label',exact:true}).click();
  await expect.poll(() => page.getByRole('dialog').getByRole('img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(840);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('batch-mismatch.png'),fullPage:true});
  await page.getByLabel('Batch label images').setInputFiles({name:'match.png',mimeType:'image/png',buffer:await image()});
  await page.getByLabel('Batch JSON manifest').fill(JSON.stringify([{filename:'match.png',application:samples.match.application}]));
  await validate(page);
  await expect(page.getByTestId('manifest-counts')).toContainText('Valid: 0 · Blocked: 1');
  await expect(page.getByTestId('manifest-entries')).toContainText('Unknown image — processing unavailable');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Compare queued fixtures',exact:true})).toBeDisabled();
  expect(traffic).toEqual([]); expect(errors).toEqual([]);
});

test('file-byte identity, not filename, selects the fixture and explicit application mapping', async ({page}) => {
  await page.getByLabel('Batch label images').setInputFiles({name:'renamed.png',mimeType:'image/png',buffer:await readFile('public/offline-samples/discrepancy.png')});
  await page.getByLabel('Batch JSON manifest').fill(JSON.stringify([{filename:'renamed.png',application:{...samples.match.application,applicationId:'EXPLICIT',applicationVersion:'v7'}}]));
  await validate(page);
  await expect(page.getByTestId('manifest-counts')).toContainText('Valid: 1 · Blocked: 0');
  await page.getByRole('button',{name:'Compare queued fixtures',exact:true}).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByTestId('active-pair')).toContainText('EXPLICIT / version v7');
  await expect(page.getByRole('row').filter({hasText:'Alcohol by volume'})).toContainText('mismatch');
});

test('card and previous/next navigation isolate drafts, reset confirmation and never claim saved history', async ({page},info) => {
  await compare(page);
  await page.getByRole('radio',{name:'Second reviewer',exact:true}).check();
  await page.getByLabel('Correction / escalation notes').fill('Match pair independent escalation draft.');
  await page.getByLabel(confirmation).check();
  await page.getByRole('button',{name:'Submit review',exact:true}).click();
  await expect(page.getByTestId('unsaved-draft')).toContainText('UNSAVED');
  await page.getByRole('button',{name:'Next item',exact:true}).click();
  await expect(page.getByLabel('Correction / escalation notes')).toHaveValue('');
  await expect(page.getByLabel(confirmation)).not.toBeChecked();
  await page.getByRole('radio',{name:'Request correction',exact:true}).check();
  await page.getByLabel('Correction / escalation notes').fill('Discrepancy pair independent correction notes.');
  await page.getByLabel(confirmation).check();
  await page.getByRole('button',{name:'Previous item',exact:true}).click();
  await expect(page.getByLabel('Correction / escalation notes')).toHaveValue('Match pair independent escalation draft.');
  await expect(page.getByTestId('unsaved-draft')).toContainText('Match pair independent');
  await expect(page.getByLabel(confirmation)).not.toBeChecked();
  await choose(page,'discrepancy.png');
  await expect(page.getByLabel('Correction / escalation notes')).toHaveValue('Discrepancy pair independent correction notes.');
  await expect(page.getByLabel(confirmation)).not.toBeChecked();
  await expect(page.getByTestId('batch-summary')).toContainText('Saved reviews: 0');
  await expect(page.getByTestId('batch-summary')).toContainText('UNSAVED drafts: 1');
  await expect(page.getByTestId('batch-summary')).toContainText('Remaining: 4');
  await page.screenshot({path:info.outputPath('batch-draft-isolation.png'),fullPage:true});
  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
  await page.reload(); await page.getByRole('tab',{name:'Batch upload',exact:true}).click();
  await expect(page.getByTestId('unsaved-draft')).toHaveCount(0);
  await expect(page.getByTestId('batch-summary')).toHaveCount(0);
});

test('failure cannot be reviewed, retry is manual and only the selected pair runs', async ({page}) => {
  await compare(page);
  await choose(page,'failure.png');
  await expect(panel(page).getByRole('alert')).toContainText('Processing failed');
  await expect(page.getByRole('button',{name:'Submit review',exact:true})).toBeDisabled();
  await expect(page.getByTestId('batch-summary')).toContainText('Attempts: 4');
  await page.getByRole('button',{name:'Retry selected fixture',exact:true}).click();
  await expect(page.getByTestId('batch-summary')).toContainText('Attempts: 5');
  await expect(page.getByTestId('batch-summary')).toContainText('Failed: 1');
  await choose(page,'match.png');
  await expect(page.getByRole('button',{name:'Retry selected fixture',exact:true})).toBeDisabled();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByTestId('batch-summary')).toContainText('Compared: 3');
  await expect(page.getByTestId('batch-summary')).toContainText('Attempts: 5');
});

test('replacement advances revision and discards old review intent without inventing saved versions', async ({page}) => {
  await compare(page);
  await page.getByRole('radio',{name:'Second reviewer',exact:true}).check();
  await page.getByLabel('Correction / escalation notes').fill('Old version is not reusable intent.');
  await page.getByLabel(confirmation).check();
  await page.getByRole('button',{name:'Submit review',exact:true}).click();
  const replacement = {...samples.match.application,applicationVersion:'v2',abv:45};
  await page.getByText('Replace this pair with a new application version', {exact:true}).click();
  await page.getByLabel('Replacement application JSON').fill(JSON.stringify(replacement));
  await page.getByRole('button',{name:'Replace selected pair',exact:true}).click();
  await expect(page.getByTestId('active-pair')).toContainText('Revision 2');
  await expect(page.getByTestId('unsaved-draft')).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button',{name:'Compare queued fixtures',exact:true}).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'Alcohol by volume'})).toContainText('mismatch');
  await expect(page.getByLabel(confirmation)).not.toBeChecked();
  await expect(page.getByLabel('Correction / escalation notes')).toHaveValue('');
  await expect(page.getByTestId('active-pair')).toContainText('version v2');
  await expect(page.getByTestId('active-pair')).toContainText('Superseded page-memory versions: 1');
});

test('replacement fences a delayed completion and keeps the two occupied slots until settlement', async ({page}) => {
  await load(page); await validate(page);
  await page.evaluate(()=>{
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const scope = window as unknown as {releaseDigests:()=>void};
    let release!:()=>void; const gate = new Promise<void>(resolve=>{release=resolve;});
    scope.releaseDigests = release;
    crypto.subtle.digest = async (...args:Parameters<SubtleCrypto['digest']>) => { await gate; return digest(...args); };
  });
  await page.getByRole('button',{name:'Compare queued fixtures',exact:true}).click();
  await expect(page.getByTestId('batch-summary')).toContainText('Running: 2');
  await page.getByText('Replace this pair with a new application version', {exact:true}).click();
  await page.getByLabel('Replacement application JSON').fill(JSON.stringify({...samples.match.application,applicationVersion:'v2'}));
  await page.getByRole('button',{name:'Replace selected pair',exact:true}).click();
  await expect(page.getByTestId('active-pair')).toContainText('Revision 2');
  await expect(page.getByTestId('batch-summary')).toContainText('Occupied slots: 2');
  await expect(page.getByRole('button',{name:'Compare queued fixtures',exact:true})).toBeDisabled();
  await choose(page,'discrepancy.png'); await choose(page,'match.png');
  await page.evaluate(()=>(window as unknown as {releaseDigests:()=>void}).releaseDigests());
  await expect(page.getByTestId('batch-summary')).toContainText('Occupied slots: 0');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByTestId('active-pair')).toContainText('version v2');
  await expect(page.getByLabel(confirmation)).not.toBeChecked();
  await page.getByRole('button',{name:'Compare queued fixtures',exact:true}).click();
  await expect(page.getByRole('table')).toBeVisible();
});

test('batch uses the existing human policy for physical assessment and machine-preserving resolutions', async ({page}) => {
  await compare(page);
  const pass=page.getByRole('radio',{name:'Pass',exact:true});
  await expect(pass).toBeDisabled();
  await page.getByLabel('Physical assessment notes').fill('Independent physical-scale inspection, synthetic exercise only.');
  await page.getByLabel('I assessed physical print/type size outside this image').check();
  await pass.check(); await page.getByLabel(confirmation).check();
  await page.getByRole('button',{name:'Submit review',exact:true}).click();
  await expect(page.getByTestId('unsaved-draft')).toContainText('UNSAVED draft — Pass');
  await choose(page,'discrepancy.png');
  await expect(pass).toBeDisabled();
  await page.getByLabel('Human resolution for Alcohol by volume').selectOption('verified-match');
  await page.getByLabel('Resolution reason for Alcohol by volume').fill('Synthetic exercise: independent inspection corrects extraction.');
  await page.getByLabel('Supporting evidence for Alcohol by volume').fill('Simulated physical label assessment finds declared 40%.');
  await page.getByLabel('Physical assessment notes').fill('Independent physical-scale inspection, synthetic exercise only.');
  await page.getByLabel('I assessed physical print/type size outside this image').check();
  await expect(pass).toBeEnabled();
  await expect(page.getByRole('row').filter({hasText:'Alcohol by volume'})).toContainText('mismatch');
  await page.getByLabel('Human resolution for Alcohol by volume').selectOption('confirmed-mismatch');
  await expect(pass).toBeDisabled();
  await choose(page,'match.png');
  await expect(page.getByTestId('unsaved-draft')).toContainText('UNSAVED draft — Pass');
  await expect(page.getByLabel(confirmation)).not.toBeChecked();
});

test('corrupt fixture bytes are blocked and pending validation cannot restore edited-away input', async ({page}) => {
  await page.route('**/offline-samples/match.png',route=>route.fulfill({status:200,contentType:'image/png',body:'not a PNG'}));
  await load(page); await validate(page);
  await expect(page.getByTestId('manifest-counts')).toContainText('Valid: 3 · Blocked: 1');
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.evaluate(()=>{
    const digest=crypto.subtle.digest.bind(crypto.subtle);
    const scope=window as unknown as {releaseValidation:()=>void};
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});scope.releaseValidation=release;
    crypto.subtle.digest=async(...args:Parameters<SubtleCrypto['digest']>)=>{await gate;return digest(...args);};
  });
  await page.getByRole('button',{name:'Validate batch manifest',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Checking local fixture bytes');
  await page.getByLabel('Batch JSON manifest').fill('[]');
  await page.evaluate(()=>(window as unknown as {releaseValidation:()=>void}).releaseValidation());
  await expect(page.getByTestId('batch-summary')).toHaveCount(0);
  await expect(page.getByTestId('manifest-counts')).toHaveCount(0);
  await page.getByRole('button',{name:'Validate batch manifest',exact:true}).click();
  await expect(page.getByTestId('manifest-counts')).toContainText('Valid: 0 · Blocked: 4');
});

test('malformed and oversized manifests fail closed; keyboard mode navigation works', async ({page}) => {
  await page.getByLabel('Batch JSON manifest').fill('{bad json');
  await page.getByRole('button',{name:'Validate batch manifest',exact:true}).click();
  await expect(panel(page).getByRole('alert')).toContainText('JSON array');
  await page.getByLabel('Batch JSON manifest').fill(JSON.stringify(Array.from({length:301},(_,i)=>({filename:`${i}.png`,application:samples.match.application}))));
  await page.getByRole('button',{name:'Validate batch manifest',exact:true}).click();
  await expect(panel(page).getByRole('alert')).toContainText('300');
  await expect(page.getByTestId('batch-summary')).toHaveCount(0);
  await page.getByRole('tab',{name:'Batch upload',exact:true}).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('heading',{name:'Single label review',exact:true})).toBeVisible();
});
