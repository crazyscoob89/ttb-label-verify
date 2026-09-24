import { expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Review from '../app/review/page';

test('review shell declares foundation limits without fabricated results', () => {
  const html = renderToStaticMarkup(createElement(Review));
  expect(html).toContain('PUBLIC DEMO');
  expect(html).toContain('Public demo access');
  expect(html).toContain('50 per UTC day');
  expect(html).not.toContain('Demo access code');
  expect(html).not.toContain('Verify access');
  expect(html).toContain('Image-only extraction cannot establish an application match');
  expect(html).toContain('Single label review');
  expect(html).not.toMatch(/Submitted|Human verified|Sign out|History saved/);
});
