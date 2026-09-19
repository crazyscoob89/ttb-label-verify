import { expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Review from '../app/review/page';

test('review shell declares foundation limits without fabricated results', () => {
  const html = renderToStaticMarkup(createElement(Review));
  expect(html).toContain('Foundation / preflight only');
  expect(html).toContain('Processing not connected');
  expect(html).toContain('Seven-category scope');
  expect(html).toContain('Pair a label with its application');
  expect(html).not.toMatch(/Submitted|Human verified|Sign out|History saved/);
});
