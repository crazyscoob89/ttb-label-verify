import { describe, expect, it } from 'vitest';
import { demoAccess, PUBLIC_DEMO_SESSION } from '../lib/demo-security';

const secret = 'synthetic-only-access-secret-0123456789';
const origin = 'https://demo.example';
const env = { TTB_DEMO_ENABLED: 'true', TTB_DEMO_ACCESS_SECRET: secret, TTB_DEMO_ORIGIN: origin };
const req = (headers: Record<string, string> = {}) => new Request(`${origin}/api/reviews/list`, { method: 'POST', headers: { origin, ...headers } });

describe('public demo access fence', () => {
  it('allows the server secret for internal/test compatibility but still rejects explicit cross-site metadata', () => {
    expect(demoAccess(req({ 'x-ttb-demo-code': secret }), env)).toBe(true);
    expect(demoAccess(req({ 'x-ttb-demo-code': secret, 'sec-fetch-site': 'cross-site' }), env)).toBe(false);
  });

  it('allows public demo browser requests only with same-origin fetch metadata', () => {
    expect(demoAccess(req({ 'x-ttb-demo-code': PUBLIC_DEMO_SESSION, 'sec-fetch-site': 'same-origin' }), env)).toBe(true);
    expect(demoAccess(req({ 'sec-fetch-site': 'same-origin' }), env)).toBe(true);
  });

  it('denies forged codes before falling back to public browser metadata', () => {
    expect(demoAccess(req({ 'x-ttb-demo-code': 'bad', 'sec-fetch-site': 'same-origin' }), env)).toBe(false);
  });

  it('denies direct/non-browser no-code requests even when Origin and URL match', () => {
    expect(demoAccess(req(), env)).toBe(false);
    expect(demoAccess(req({ 'x-ttb-demo-code': PUBLIC_DEMO_SESSION }), env)).toBe(false);
  });
});
