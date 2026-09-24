import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const sql = readFileSync('db/migrations/012_daily_scan_quota.sql', 'utf8');
const spendDefinition = sql.match(/CREATE OR REPLACE FUNCTION public\.ttb_demo_spend\([\s\S]*?END \$\$;/)?.[0] ?? '';

test('012 adds a durable UTC 50 paid-scan/day quota before provider claims', () => {
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS ttb_demo_private.daily_scan_quota');
  expect(sql).toContain('CHECK(scans BETWEEN 0 AND 50)');
  expect(spendDefinition).toContain("utc_day=(clock_timestamp() AT TIME ZONE 'UTC')::date");
  expect(spendDefinition).toContain('WHERE day=utc_day AND scans<50 RETURNING scans INTO reserved_count');
  expect(spendDefinition).toContain("RAISE EXCEPTION 'daily-limit-reached'");
  expect(spendDefinition.indexOf('daily_scan_quota')).toBeLessThan(spendDefinition.indexOf('INSERT INTO ttb_demo_private.holds'));
  expect(sql).toContain('ALTER TABLE ttb_demo_private.daily_scan_quota FORCE ROW LEVEL SECURITY');
  expect(sql).toContain('REVOKE ALL ON ttb_demo_private.daily_scan_quota FROM PUBLIC, anon, authenticated, service_role');
});

test('012 keeps saved receipts code-free for the public demo', () => {
  expect(sql).toContain('Public demo use — NOT an individually authenticated reviewer');
  expect(sql).not.toContain('Shared demo access code');
});
