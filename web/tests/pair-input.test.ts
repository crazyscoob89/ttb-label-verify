import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import Review from '../app/review/page';
import { checkFileDeclaration } from '../lib/contracts';

test('manual entry has every explicit field and no commodity/import default', () => {
  const html = renderToStaticMarkup(createElement(Review));
  for (const label of ['Application ID', 'Application version', 'Brand name', 'Class / type', 'Alcohol by volume (%)', 'Net contents', 'Producer name', 'Producer address', 'Commodity', 'Imported product?', 'Origin context', 'Country of origin']) expect(html).toContain(label);
  expect(html).toContain('Check application fields');
  expect(html).toContain('10 MiB'); expect(html).toContain('20 megapixels');
  expect(html).toContain('Local previews stay in this browser');
  expect(html).toContain('Add another photo');expect(html).toContain('1–4');
  expect(html).not.toContain('name="governmentWarning"');
  expect(html).not.toContain('selected="" value="distilled-spirits"');
  expect(html).not.toContain('selected="" value="false"');
});

test('browser declarations are advisory and reject unsupported or empty selections', () => {
  const file = { name: 'label.png', type: 'image/png', size: 123 };
  expect(checkFileDeclaration(file)).toBeNull();
  expect(checkFileDeclaration({ ...file, name: 'label.JPG', type: 'image/jpeg' })).toBeNull();
  for (const invalid of [{ size: 0 }, { size: 10 * 1024 * 1024 + 1 }, { size: NaN }, { name: '../label.png' }, { name: 'label.jpg' }, { type: 'image/jpeg' }]) expect(checkFileDeclaration({ ...file, ...invalid })).not.toBeNull();
});
