import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import ReviewWorkspace from '../components/ReviewWorkspace';
import ReviewConfirmation from '../components/ReviewConfirmation';
import { compareApplication } from '../lib/rules';
import fixtures from './fixtures/comparisons.json';
import type { ComparisonRecord } from '../lib/comparison-record';

const source = (name:string) => readFileSync(new URL(`../components/${name}`,import.meta.url),'utf8');
test('live entry has independent Application and Label images tabs and no visible session credential',()=>{
 const html=renderToStaticMarkup(createElement(ReviewWorkspace,{offlineEnabled:false}));
 expect(html).toContain('>Application</button>');expect(html).toContain('>Label images</button>');
 expect(html.match(/type="password"/g)).toBeNull();
 expect(html).toContain('Public demo access');expect(html).toContain('50 per UTC day');
 expect(html).not.toContain('Verify access');expect(html).not.toContain('Demo access code');
 expect(html).toContain('Image-only extraction cannot establish an application match');
});
test('live comparison shares the evidence-first review, never normal-view JSON',()=>{
 expect(source('PairInput.tsx')).not.toContain('JSON.stringify(field.observed');
 expect(source('PairInput.tsx')).toContain('preview={preview}');
 expect(source('SavedReviewHistory.tsx')).not.toContain('history-code');
});
test('human resolution is attached to the comparison row, with one overall outcome',()=>{
 const application={...fixtures.application,abv:45};
 const record={processing:'complete',source:'openrouter',application,evidence:fixtures.evidence,imageSha256:'a'.repeat(64),comparison:compareApplication(application as never,fixtures.evidence)} as ComparisonRecord;
 const html=renderToStaticMarkup(createElement(ReviewConfirmation,{record}));
 expect(html).toContain('data-field="abv"');
 expect(html).toMatch(/data-field="abv"[\s\S]*Human resolution for Alcohol by volume[\s\S]*<\/tr>/);
 expect(html.match(/Internal review outcome/g)).toHaveLength(1);
 expect(html).toContain('Physical assessment notes');
});
test('approved v3 outcome and horizontal switcher styles are present',()=>{
 const css=readFileSync(new URL('../app/review.css',import.meta.url),'utf8');
 expect(css).toContain('.outcome-cards');expect(css).toContain('.batch-rail');
 expect(source('BatchSwitcher.tsx')).toContain('Batch overview');
});
