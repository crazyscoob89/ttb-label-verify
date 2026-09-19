import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort());
  await page.goto('/review');
});

test('explicit known sample comparison, image pairing, enlargement and stale reset', async ({ page }, info) => {
  await expect(page.getByText('Offline fixture demonstration – not AI analysis; nothing saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Batch/ })).toBeDisabled();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByLabel('Synthetic scenario').selectOption('match');
  await page.getByRole('button', { name: 'Submit comparison', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText('Source: fixture', { exact: false })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(8);
  await page.getByRole('button', { name: 'Enlarge label' }).click();
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
  await expect(page.getByRole('table')).toHaveCount(0);
});
