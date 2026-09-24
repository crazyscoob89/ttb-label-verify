import type { NextConfig } from 'next';

// Only one exact project origin; never *.supabase.co or a caller-controlled URL.
const transport = process.env.NEXT_PUBLIC_TTB_MEDIA_TRANSPORT;
const storageOrigin = process.env.NEXT_PUBLIC_TTB_SUPABASE_ORIGIN;
for (const key of Object.keys(process.env)) {
  if (key.startsWith('NEXT_PUBLIC_TTB_') && process.env[key]
    && !['NEXT_PUBLIC_TTB_MEDIA_TRANSPORT', 'NEXT_PUBLIC_TTB_SUPABASE_ORIGIN'].includes(key)) throw Error('Unsupported public TTB configuration');
}
if (transport === 'supabase-v1' && process.env.TTB_SUPABASE_URL && process.env.TTB_SUPABASE_URL !== storageOrigin) throw Error('Server/browser Storage origin mismatch');
if (transport && transport !== 'supabase-v1') throw Error('Unsupported media transport');
if (transport === 'supabase-v1' && (!storageOrigin || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(storageOrigin))) throw Error('Invalid Storage origin');
const connectSources = transport === 'supabase-v1' ? `'self' ${storageOrigin}` : "'self'";

const config: NextConfig = {
  poweredByHeader: false,
  // Bounded build worker count, not a runtime concurrency or test bypass.
  experimental: { cpus: 1 },
  turbopack: { root: import.meta.dirname },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src ${connectSources}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` },
    ] }];
  },
};
export default config;
