import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const bacardi = JSON.parse(readFileSync(new URL('../fixtures/bacardi-live-v7.json', import.meta.url), 'utf8'));

test('domestic Puerto Rico intake keeps declared territory through edits; contradictory foreign context fails locally without a scan', async ({page,baseURL},info)=>{
  const requests:string[]=[];
  await page.route('**/*',route=>{
    const request=route.request(), url=new URL(request.url());
    if(request.method()==='POST') { requests.push(url.pathname); return route.abort(); }
    return url.origin===new URL(baseURL!).origin?route.continue():route.abort();
  });
  await page.goto('/review');
  await page.locator('input[type=file]').first().setInputFiles('public/offline-samples/match.png');
  await page.getByRole('tab',{name:'Application',exact:true}).click();
  const app=bacardi.result.application;
  for(const key of ['applicationId','applicationVersion','brand','classType','abv','netContents','producerName','producerAddress'] as const) await page.locator(`#${key}`).fill(String(app[key]));
  await page.locator('#commodity').selectOption('distilled-spirits');
  await page.locator('#country').fill('Puerto Rico');
  await page.locator('#imported').selectOption('false'); await page.locator('#originKind').selectOption('domestic');
  await expect(page.locator('#country')).toHaveValue('Puerto Rico');
  await page.getByRole('button',{name:'Check application fields',exact:true}).click();
  await expect(page.getByText('Application fields checked locally.',{exact:false})).toBeVisible();
  await page.screenshot({path:info.outputPath('domestic-puerto-rico-intake.png'),fullPage:true});
  await page.locator('#imported').selectOption('true'); await page.locator('#originKind').selectOption('imported');
  await page.getByRole('button',{name:'Check application fields',exact:true}).click();
  await expect(page.getByRole('tabpanel',{name:'Single review',exact:true}).getByRole('alert')).toContainText('Origin context / country');
  await expect(page.locator('#country')).toHaveValue('Puerto Rico');
  expect(requests).toEqual([]);
});
