import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
  await page.goto('/review');
});

test('explicit known sample comparison, image pairing, enlargement and stale reset', async ({ page }, info) => {
  await expect(page.getByText('Offline fixture demonstration – not AI analysis; nothing saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Batch/ })).toBeEnabled();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByLabel('Synthetic scenario').selectOption('match');
  await page.getByRole('button', { name: 'Submit comparison', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText('Source: fixture', { exact: false })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(8);
  await expect.poll(async()=>page.getByRole('img',{name:/Exact synthetic label:/}).evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(840);
  await page.getByRole('button', { name: 'Enlarge label' }).click();
  await expect.poll(async()=>page.getByRole('dialog').getByRole('img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(840);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Synthetic scenario').selectOption('discrepancy');
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Submit comparison', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Alcohol by volume' })).toContainText('mismatch');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('single-mismatch.png'), fullPage: true });
});

test('uncertainty and failure remain distinct; switching aborts pending evidence', async ({ page }) => {
  await page.getByLabel('Synthetic scenario').selectOption('uncertainty');
  await page.getByRole('button', { name: 'Submit comparison', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Alcohol by volume' })).toContainText('needs-review');
  await page.getByLabel('Synthetic scenario').selectOption('failure');
  await page.getByRole('button', { name: 'Submit comparison', exact: true }).click();
  await expect(page.getByRole('tabpanel').getByRole('alert')).toContainText('Processing failed');
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.route('**/offline-samples/match.png', async route => { await new Promise(r => setTimeout(r, 250)); await route.continue(); });
  await page.getByLabel('Synthetic scenario').selectOption('match');
  await page.getByRole('button', { name: 'Submit comparison', exact: true }).click();
  await page.getByLabel('Synthetic scenario').selectOption('discrepancy');
});

test('corrupt known asset and timeout fail closed, never reuse a prior result', async ({page}) => {
  await page.route('**/offline-samples/match.png', route=>route.fulfill({status:200,contentType:'image/png',body:'not a PNG'}));
  await page.getByRole('button',{name:'Submit comparison',exact:true}).click();
  await expect(page.getByRole('tabpanel').getByRole('alert')).toContainText('Corrupt, mismatched or invalid input');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Submit review',exact:true})).toBeDisabled();
  await page.unroute('**/offline-samples/match.png');
  await page.route('**/offline-samples/match.png', async route=>{await new Promise(r=>setTimeout(r,5500));await route.continue().catch(()=>{});});
  await page.getByRole('button',{name:'Submit comparison',exact:true}).click();
  await expect(page.getByRole('tabpanel').getByRole('status')).toContainText('No AI request');
  await expect(page.getByRole('tabpanel').getByRole('alert')).toContainText('timed out',{timeout:7000});
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('A to B to A switching rejects late result and releases exact preview URL', async ({page}) => {
  await page.evaluate(()=>{
    const original=URL.revokeObjectURL.bind(URL);
    (window as unknown as {revoked:string[]}).revoked=[];
    URL.revokeObjectURL=(url:string)=>{(window as unknown as {revoked:string[]}).revoked.push(url);original(url);};
  });
  await page.getByRole('button',{name:'Submit comparison',exact:true}).click();
  await expect(page.getByRole('table')).toBeVisible();
  const blob=await page.getByRole('img',{name:/Exact synthetic label:/}).getAttribute('src');
  await page.getByLabel('Sample application ID').fill('CHANGED');
  await expect(page.getByRole('table')).toHaveCount(0);
  expect(await page.evaluate(()=> (window as unknown as {revoked:string[]}).revoked)).toContain(blob);
  let finish!:()=>void;
  const done=new Promise<void>(r=>{finish=r;});
  await page.route('**/offline-samples/match.png',async route=>{await new Promise(r=>setTimeout(r,500));await route.continue().catch(()=>{});finish();});
  await page.getByRole('button',{name:'Submit comparison',exact:true}).click();
  await expect(page.getByRole('tabpanel').getByRole('status')).toBeVisible();
  await page.getByLabel('Synthetic scenario').selectOption('discrepancy');
  await page.getByLabel('Synthetic scenario').selectOption('match');
  await done;
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Submit review',exact:true})).toBeDisabled();
});
