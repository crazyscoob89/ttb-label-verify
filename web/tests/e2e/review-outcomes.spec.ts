import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort());
  await page.goto('/review');
});
const compare = async (page: import('@playwright/test').Page, scenario:string) => { await page.getByLabel('Synthetic scenario').selectOption(scenario); await page.getByRole('button',{name:'Submit comparison',exact:true}).click(); await expect(page.getByRole('table')).toBeVisible(); };

test('Pass requires physical assessment and co-located confirmation, remains an unsaved draft', async ({page},info) => {
  await compare(page,'match');
  await expect(page.getByRole('radio',{name:'Pass',exact:true})).toBeDisabled();
  await page.getByLabel('Physical assessment notes').fill('Measured print using physical scale; offline demonstration only.');
  await page.getByLabel('I assessed physical print/type size outside this image').check();
  await page.getByRole('radio',{name:'Pass',exact:true}).check();
  await expect(page.getByRole('button',{name:'Submit review',exact:true})).toBeDisabled();
  await page.getByLabel('I reviewed this exact evidence and application and confirm this internal outcome').check();
  await page.getByRole('button',{name:'Submit review',exact:true}).click();
  await expect(page.getByTestId('unsaved-draft')).toContainText('UNSAVED');
  await expect(page.getByTestId('unsaved-draft')).toContainText('Pass');
  await expect(page.getByRole('button',{name:'Submit review',exact:true})).toBeDisabled();
  await page.screenshot({path:info.outputPath('pass-unsaved.png'),fullPage:true});
  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByTestId('unsaved-draft')).toHaveCount(0);
});

test('blocked mismatch, correction notes and machine-preserving human resolution', async ({page},info) => {
  await compare(page,'discrepancy');
  const pass=page.getByRole('radio',{name:'Pass',exact:true});
  await expect(pass).toBeVisible(); await expect(pass).toBeDisabled();
  await expect(page.getByTestId('pass-reasons')).toContainText('abv: mismatch');
  await page.getByRole('radio',{name:'Request correction',exact:true}).check();
  await page.getByLabel('I reviewed this exact evidence and application and confirm this internal outcome').check();
  await expect(page.getByRole('button',{name:'Submit review',exact:true})).toBeDisabled();
  await page.getByLabel('Correction / escalation notes').fill('Label ABV is 45%; application declares 40%. Please correct.');
  await expect(page.getByLabel('I reviewed this exact evidence and application and confirm this internal outcome')).not.toBeChecked();
  await page.getByLabel('I reviewed this exact evidence and application and confirm this internal outcome').check();
  await page.getByRole('button',{name:'Submit review',exact:true}).click();
  await expect(page.getByTestId('unsaved-draft')).toContainText('Request correction');
  await page.screenshot({path:info.outputPath('correction-unsaved.png'),fullPage:true});
  await page.getByLabel('Human resolution for Alcohol by volume').selectOption('verified-match');
  await page.getByLabel('Resolution reason for Alcohol by volume').fill('Synthetic exercise: original print inspection corrects extraction.');
  await page.getByLabel('Supporting evidence for Alcohol by volume').fill('Observed 40% on original physical label; simulated assessment.');
  await page.getByLabel('Physical assessment notes').fill('Physical print assessed independently for this demonstration.');
  await page.getByLabel('I assessed physical print/type size outside this image').check();
  await expect(pass).toBeEnabled();
  await expect(page.getByRole('row').filter({hasText:'Alcohol by volume'})).toContainText('mismatch');
  await expect(page.getByTestId('unsaved-draft')).toHaveCount(0);
});

test('second review and every pairing switch reset outcome confirmation', async ({page}) => {
  await compare(page,'uncertainty');
  await page.getByRole('radio',{name:'Second reviewer',exact:true}).check();
  await page.getByLabel('Correction / escalation notes').fill('ABV is obscured; another person must inspect a new image.');
  await page.getByLabel('I reviewed this exact evidence and application and confirm this internal outcome').check();
  await page.getByRole('button',{name:'Submit review',exact:true}).click();
  await expect(page.getByTestId('unsaved-draft')).toContainText('Second reviewer');
  await page.getByLabel('Sample application version').fill('2');
  await expect(page.getByTestId('unsaved-draft')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Submit review',exact:true})).toBeDisabled();
  await page.getByLabel('Synthetic scenario').selectOption('failure');
  await page.getByRole('button',{name:'Submit comparison',exact:true}).click();
  await expect(page.getByRole('tabpanel').getByRole('alert')).toContainText('Processing failed');
  await expect(page.getByRole('button',{name:'Submit review',exact:true})).toBeDisabled();
  await page.getByLabel('Input source').selectOption('manual');
  await expect(page.getByTestId('unsaved-draft')).toHaveCount(0);
});
