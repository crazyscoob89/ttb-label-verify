import { approvedAzureOcrEndpoint } from './extraction/azure-ocr-pricing';
type Env = Record<string, string | undefined>;
const accessPattern = /^[A-Za-z0-9_-]{32,256}$/;
const projectOrigin = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const unavailable = () => Error('Runtime configuration unavailable');

export function groupExtractionProviderName(env: Env): 'openrouter' | 'azure-foundry' | 'gpt41' {
  const selected = env.TTB_GROUP_EXTRACTION_PROVIDER;
  if (typeof window !== 'undefined') throw unavailable();
  if (selected === undefined || selected === 'openrouter') return 'openrouter';
  if (selected === 'azure-foundry' && env.TTB_PERSISTENCE === 'supabase') return selected;
  if (selected === 'gpt41' && env.TTB_PERSISTENCE === 'supabase') return selected;
  throw unavailable();
}

/** Independent server-only signer. The demo access secret is NOT a media signing key.
 * Generate at least 32 random bytes (base64url); never set a NEXT_PUBLIC alias. */
export function mediaSigningSecret(env: Env): string {
  const key = env.TTB_MEDIA_SIGNING_SECRET;
  if (typeof window !== 'undefined' || !key || !accessPattern.test(key)
    || key === env.TTB_DEMO_ACCESS_SECRET || key === env.TTB_SUPABASE_SERVICE_ROLE_KEY
    || key === env.OPENROUTER_API_KEY || key === env.AZURE_FOUNDRY_API_KEY) throw unavailable();
  return key;
}

/** Pure validation, no DB/files/network. Call lazily after public-demo origin auth.
 * Legacy local mode remains the default only outside managed hosting. Hosted
 * selection cannot fall back to SQLite, even when configuration is incomplete. */
export function validateRuntimeEnv(env: Env): 'sqlite' | 'supabase' {
  if (typeof window !== 'undefined') throw unavailable();
  const groupProvider = groupExtractionProviderName(env);
  if (groupProvider === 'azure-foundry') {
    approvedAzureOcrEndpoint(env.AZURE_FOUNDRY_ENDPOINT);
    // Pricing freshness gates inference, never shared history/upload access.
  }
  const mode = env.TTB_PERSISTENCE;
  if (mode !== 'supabase') {
    if ((mode !== undefined && mode !== 'sqlite') || env.VERCEL || env.VERCEL_ENV
      || env.NEXT_PUBLIC_TTB_MEDIA_TRANSPORT || env.NEXT_PUBLIC_TTB_SUPABASE_ORIGIN
      || env.TTB_SUPABASE_URL || env.TTB_SUPABASE_SERVICE_ROLE_KEY) throw unavailable();
    return 'sqlite';
  }
  const origin = env.TTB_DEMO_ORIGIN;
  if (env.TTB_DEMO_ENABLED !== 'true' || !env.TTB_DEMO_ACCESS_SECRET
    || !accessPattern.test(env.TTB_DEMO_ACCESS_SECRET) || !origin) throw unavailable();
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin) throw unavailable();
  const serviceKey = env.TTB_SUPABASE_SERVICE_ROLE_KEY;
  const providerKey = groupProvider === 'azure-foundry' ? env.AZURE_FOUNDRY_API_KEY : env.OPENROUTER_API_KEY;
  if (!env.TTB_SUPABASE_URL || !projectOrigin.test(env.TTB_SUPABASE_URL)
    || env.NEXT_PUBLIC_TTB_MEDIA_TRANSPORT !== 'supabase-v1'
    || env.NEXT_PUBLIC_TTB_SUPABASE_ORIGIN !== env.TTB_SUPABASE_URL
    || !serviceKey || serviceKey.length > 8192 || /[\s\x00-\x1f\x7f]/.test(serviceKey)
    || !providerKey || providerKey.length > 8192 || /[\s\x00-\x1f\x7f]/.test(providerKey)
    || env.TTB_SUPABASE_EVIDENCE_BUCKET !== 'ttb-evidence'
    || env.TTB_SUPABASE_UPLOAD_BUCKET !== 'ttb-uploads'
    || env.TTB_DEMO_DATA_DIR || env.TTB_REVIEW_DATA_DIR || env.TTB_DEMO_PERSISTENT_VOLUME
    || (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== 'production')) throw unavailable();
  mediaSigningSecret(env);
  // There are exactly two supported public TTB settings, neither a credential.
  for (const key of Object.keys(env)) {
    if (key.startsWith('NEXT_PUBLIC_TTB_') && env[key]
      && !['NEXT_PUBLIC_TTB_MEDIA_TRANSPORT', 'NEXT_PUBLIC_TTB_SUPABASE_ORIGIN'].includes(key)) throw unavailable();
  }
  return 'supabase';
}
