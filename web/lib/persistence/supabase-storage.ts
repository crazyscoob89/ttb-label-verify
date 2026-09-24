import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MAX_IMAGE_BYTES } from '../contracts';
import { boundedBody } from '../demo-security';

export type MediaEnv = Record<string, string | undefined>;
const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const mimeType = z.enum(['image/png', 'image/jpeg']);
const byteCount = z.number().int().min(1).max(MAX_IMAGE_BYTES);
const bucketName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function keyFor(prefix: 'snapshots' | 'uploads', key: string) {
  if (!key.startsWith(`${prefix}/`)) throw Error('Invalid object key');
  uuid.parse(key.slice(prefix.length + 1));
  return key;
}
function metadata(key: string, hash: string, bytes: number, mime: string) {
  keyFor('snapshots', key); digest.parse(hash); byteCount.parse(bytes); mimeType.parse(mime);
}

/** Server-only: never import this module into a client component. No public key,
 * anon fallback, redirect, retry, list, delete, or bucket-management operation. */
export function storageConfig(env: MediaEnv) {
  if (typeof window !== 'undefined') throw Error('Server-only Storage adapter');
  const origin = env.TTB_SUPABASE_URL;
  if (env.TTB_PERSISTENCE !== 'supabase' || !origin || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin)
    || !env.TTB_SUPABASE_SERVICE_ROLE_KEY) throw Error('Storage unavailable');
  return { origin, secret: env.TTB_SUPABASE_SERVICE_ROLE_KEY,
    evidence: bucketName.parse(env.TTB_SUPABASE_EVIDENCE_BUCKET), uploads: bucketName.parse(env.TTB_SUPABASE_UPLOAD_BUCKET) };
}

/** Raw REST protocol matches supabase/storage-js StorageFileApi:
 * POST /object/upload/sign/{bucket}/{key}, {} -> {url:"/object/upload/sign/...?..."};
 * signed capability is used by an unauthenticated PUT, not POST /object/{bucket}.
 * https://github.com/supabase/storage-js/blob/master/src/packages/StorageFileApi.ts
 * Provider upload capabilities last 2 hours; our HMAC consumption deadline is separate.
 */
export function createStorageTransport(env: MediaEnv) {
  const config = storageConfig(env);
  async function call(path: string, init: RequestInit, limit: number, expectedMime?: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${config.origin}/storage/v1${path}`, { ...init, redirect: 'error',
        cache: 'no-store', signal: init.signal?AbortSignal.any([init.signal,controller.signal]):controller.signal, headers: { ...init.headers,
          authorization: `Bearer ${config.secret}`, apikey: config.secret } });
      if (!response.ok || response.redirected || (expectedMime && response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== expectedMime)) {
        void response.body?.cancel().catch(() => {}); throw Error('Storage unavailable');
      }
      return await boundedBody(response, limit, 15000);
    } finally { clearTimeout(timer); controller.abort(); }
  }
  function signedUrl(value: unknown, path: string) {
    if (typeof value !== 'string' || value.length > 8192 || !value.startsWith(`${path}?`)) throw Error('Invalid Storage capability');
    const url = new URL(`${config.origin}/storage/v1${value}`);
    if (url.origin !== config.origin || url.pathname !== `/storage/v1${path}` || url.hash || !url.searchParams.get('token')
      || [...url.searchParams.keys()].some(key => key !== 'token') || url.searchParams.getAll('token').length !== 1) throw Error('Invalid Storage capability');
    return url.href;
  }
  return { config, call, signedUrl };
}

export function createSupabaseObjects(env: MediaEnv) {
  const { config, call, signedUrl } = createStorageTransport(env);
  async function getEvidence(key: string, hash: string, bytes: number, mime: string,signal?:AbortSignal): Promise<Buffer> {
    metadata(key, hash, bytes, mime);
    const result = await call(`/object/authenticated/${config.evidence}/${key}`, { method: 'GET',signal }, bytes, mime);
    if (result.length !== bytes || sha256(result) !== hash) throw Error('Evidence integrity mismatch');
    return result;
  }
  return {
    async putEvidence(id: string, bytes: Buffer, mime: string, hash: string,signal?:AbortSignal): Promise<{ key: string }> {
      uuid.parse(id);
      if (!Buffer.isBuffer(bytes) || bytes.buffer instanceof SharedArrayBuffer) throw Error('Invalid evidence');
      const key = `snapshots/${id}`; metadata(key, hash, bytes.length, mime);
      // Snapshot caller-owned memory before the first await.
      const snapshot = Buffer.from(bytes);
      if (sha256(snapshot) !== hash) throw Error('Evidence integrity mismatch');
      await call(`/object/${config.evidence}/${key}`, { method: 'POST', headers: {
        'content-type': mime, 'x-upsert': 'false', 'cache-control': 'no-store',
      }, body: new Uint8Array(snapshot),signal }, 16384);
      // Do not acknowledge snapshot metadata until persisted bytes are verified.
      // A lost acknowledgement remains conservative; never overwrite or retry.
      await getEvidence(key, hash, snapshot.length, mime,signal);
      return { key };
    },
    getEvidence,
    async signEvidence(key: string, hash: string, bytes: number, mime: string) {
      metadata(key, hash, bytes, mime);
      const path = `/object/sign/${config.evidence}/${key}`;
      const result = JSON.parse((await call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) }, 16384)).toString('utf8'));
      return { url: signedUrl(result.signedURL, path), sha256: hash, bytes, mime, expiresIn: 60 };
    },
  };
}

export async function signPrivateUpload(env: MediaEnv, key: string,signal?:AbortSignal): Promise<string> {
  keyFor('uploads', key);
  const { config, call, signedUrl } = createStorageTransport(env);
  const path = `/object/upload/sign/${config.uploads}/${key}`;
  const result = JSON.parse((await call(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-upsert': 'false' }, body: '{}',signal }, 16384)).toString('utf8'));
  return signedUrl(result.url, path);
}
export async function readPrivateUpload(env: MediaEnv, key: string, bytes: number, mime: string,signal?:AbortSignal): Promise<Buffer> {
  keyFor('uploads', key); byteCount.parse(bytes); mimeType.parse(mime);
  const { config, call } = createStorageTransport(env);
  const result = await call(`/object/authenticated/${config.uploads}/${key}`, { method: 'GET',signal }, bytes, mime);
  if (result.length !== bytes) throw Error('Upload integrity mismatch');
  return result;
}
