import { test, expect } from '@playwright/test';
import { image } from '../fixtures/synthetic';

test('application checks are local, reject gaps, clear stale feedback and never enable comparison', async ({ page }) => {
  await page.goto('/review');
  const requests: string[] = [];
  page.on('request', req => requests.push(req.url()));
  await page.getByRole('button', { name: 'Check application fields' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('Choose a label image');
  await page.getByLabel('Label image (JPEG or PNG)', { exact: true }).setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: await image() });
  const fields = { 'Application ID': 'SYNTH-001', 'Application version': 'v1', 'Brand name': 'Sample Brand', 'Class / type': 'Vodka', 'Net contents': '750 mL', 'Producer name': 'Synthetic Producer', 'Producer address': '1 Example Street', 'Country of origin': 'United States' };
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Commodity', { exact: true }).selectOption('distilled-spirits');
  await page.getByLabel('Imported product?', { exact: true }).selectOption('false');
  await page.getByLabel('Origin context', { exact: true }).selectOption('domestic');
  await page.getByRole('button', { name: 'Check application fields' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('Alcohol by volume');
  await page.getByLabel('Alcohol by volume (%)', { exact: true }).fill('40.0');
  await page.getByRole('button', { name: 'Check application fields' }).click();
  await expect(page.getByRole('status')).toContainText('Application fields checked locally');
  await expect(page.getByRole('status')).toContainText('Image content is still unvalidated');
  await expect(page.getByRole('button', { name: 'Submit for comparison' })).toBeDisabled();
  await page.getByLabel('Application ID', { exact: true }).fill(' other ');
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check application fields' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('Application ID');
  expect(requests).toEqual([]);
});

test('local-only foundation renders without external requests or mobile overflow', async ({ page }, testInfo) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:3100') {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByRole('heading', { name: 'Pair a label with its application' })).toBeVisible();
  await expect(page.getByText('Foundation / preflight only', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit for comparison' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('foundation.png'), fullPage: true });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
