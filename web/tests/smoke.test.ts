import { expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Review from '../app/review/page';

test('review shell declares foundation limits without fabricated results', () => {
  const html = renderToStaticMarkup(createElement(Review));
  expect(html).toContain('GUARDED DEMO');
  expect(html).toContain('Guarded live demo');
  expect(html).toContain('Demo access code');
  expect(html).toContain('Arbitrary images never receive sample findings');
  expect(html).toContain('Single label review');
  expect(html).not.toMatch(/Submitted|Human verified|Sign out|History saved/);
});
