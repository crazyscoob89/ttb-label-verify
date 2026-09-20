import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const samples = JSON.parse(readFileSync(new URL('../../lib/offline-samples.json', import.meta.url),'utf8'));

test('production has no fixture controls and even exact known uploads remain unavailable', async ({page,baseURL},info)=>{
  const traffic:string[]=[];
  page.on('request',request=>{const url=new URL(request.url());if(url.origin!==new URL(baseURL!).origin||url.pathname.startsWith('/api/')||request.method()!=='GET')traffic.push(request.url());});
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin?route.continue():route.abort());
  await page.goto('/review');
  await expect(page.getByText('COMPARISON UNAVAILABLE',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Synthetic scenario')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Submit comparison',exact:true})).toHaveCount(0);
  await page.getByRole('tab',{name:'Batch upload',exact:true}).click();
  await expect(page.getByRole('button',{name:'Load synthetic fixture batch',exact:true})).toHaveCount(0);
  await expect(page.getByText('Development-only synthetic fixture batch — not AI analysis; nothing saved',{exact:true})).toHaveCount(0);
  await page.getByLabel('Batch label images').setInputFiles('public/offline-samples/match.png');
  await page.getByLabel('Batch JSON manifest').fill(JSON.stringify([{filename:'match.png',application:samples.match.application}]));
  await page.getByRole('button',{name:'Validate batch manifest',exact:true}).click();
  await expect(page.getByTestId('manifest-counts')).toContainText('Valid: 0 · Blocked: 1');
  await expect(page.getByTestId('manifest-entries')).toContainText('Processing unavailable — runtime adapters are not configured');
  await expect(page.getByRole('button',{name:'Compare queued fixtures',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Submit review',exact:true})).toBeDisabled();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('img')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(traffic).toEqual([]);
  await page.screenshot({path:info.outputPath('production-batch-denied.png'),fullPage:true});
});

test('production comparison API stays default-denied before interpreting fixture requests',async({request})=>{
  const response=await request.post('/api/comparisons',{data:{offline:true,fixture:'match',application:samples.match.application},headers:{'x-offline-demo':'1'}});
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({processing:'failed',code:'access-denied'});
});
