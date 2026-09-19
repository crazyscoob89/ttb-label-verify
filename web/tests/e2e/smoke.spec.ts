import { test, expect } from '@playwright/test';

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
