import { z } from 'zod';
import { checkFileDeclaration, MAX_IMAGE_BYTES, parseApplication, type Application } from './contracts';

export type LiveMedia = { body: BodyInit; headers: Record<string, string> };
type Fetch = typeof fetch;
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const mimeSchema = z.enum(['image/png', 'image/jpeg']);
const evidenceLinkSchema = z.object({ url: z.string().max(8192), sha256: hashSchema, bytes: z.number().int().min(1).max(MAX_IMAGE_BYTES),
  mime: mimeSchema, expiresIn: z.literal(60) }).strict();
export function hostedMode() {
  const mode = process.env.NEXT_PUBLIC_TTB_MEDIA_TRANSPORT;
  if (!mode) return false;
  if (mode !== 'supabase-v1') throw Error('media-unavailable');
  return true;
}
function storageOrigin() {
  const origin = process.env.NEXT_PUBLIC_TTB_SUPABASE_ORIGIN;
  if (!origin || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin)) throw Error('media-unavailable');
  return origin;
}
export function capability(value: string, kind: 'upload' | 'evidence') {
  const url = new URL(value);
  const prefix = kind === 'upload' ? '/storage/v1/object/upload/sign/' : '/storage/v1/object/sign/';
  if (url.origin !== storageOrigin() || url.username || url.password || url.hash || !url.pathname.startsWith(prefix)
    || !/^[a-z0-9][a-z0-9-]{0,62}\/(uploads|snapshots)\/[0-9a-f-]{36}$/.test(url.pathname.slice(prefix.length))
    || !url.searchParams.get('token') || url.searchParams.getAll('token').length !== 1
    || [...url.searchParams.keys()].some(key => key !== 'token')) throw Error('media-unavailable');
  return url.href;
}
export async function boundedBytes(response: Response, max: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const length = response.headers.get('content-length');
  if (!response.ok || response.redirected || (length !== null && (!/^\d+$/.test(length) || Number(length) > max))) {
    void response.body?.cancel().catch(() => {}); throw Error('media-unavailable');
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('media-unavailable');
  let onAbort: () => void = () => {};
  try {
    signal.throwIfAborted();
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () => reject(Error('media-timeout'));
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const work = async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) throw Error('media-too-large');
        chunks.push(value);
      }
      const result = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      return result;
    };
    return await Promise.race([work(), stopped]);
  } finally { signal.removeEventListener('abort', onAbort); void reader.cancel().catch(() => {}); }
}
async function json(response: Response, signal: AbortSignal) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(response, 65536, signal)));
}
/** Credentials never accompany a Storage capability. No image bytes transit the
 * Vercel request envelope in hosted mode; only small declarations/HMAC tickets do.
 * No retries here or at the comparisons endpoint, including ambiguous failures. */
export async function prepareLiveMedia(file: File, application: Application, code: string,
  signal: AbortSignal, transport: Fetch = fetch): Promise<LiveMedia> {
  if (checkFileDeclaration(file) || !code) throw Error('invalid-input');
  const parsed = parseApplication(application);
  if (!hostedMode()) {
    const body = new FormData(); body.set('image', file); body.set('application', JSON.stringify(parsed));
    return { body, headers: {} };
  }
  storageOrigin();
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(35000)]);
  const response = await transport('/api/uploads', { method: 'POST', body: JSON.stringify({ filename: file.name, mime: file.type, bytes: file.size, application: parsed }),
    headers: { 'content-type': 'application/json', 'x-ttb-demo-code': code }, signal: deadline, cache: 'no-store', redirect: 'error' });
  const data = z.object({ uploadUrl: z.string().max(8192), ticket: z.string().min(1).max(60000) }).strict().parse(await json(response, deadline));
  const uploadUrl = capability(data.uploadUrl, 'upload');
  // Storage REST accepts the raw File body with explicit MIME (PUT), as well as
  // multipart. x-upsert=false is also signed into the server-issued capability.
  const upload = await transport(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type, 'x-upsert': 'false', 'cache-control': 'no-store' },
    signal: deadline, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  await boundedBytes(upload, 16384, deadline);
  return { body: JSON.stringify({ ticket: data.ticket }), headers: { 'content-type': 'application/json' } };
}

export async function loadReviewEvidence(id: string, expectedHash: string, code: string, signal: AbortSignal, transport: Fetch = fetch,
  selector?: {photoId:string;variant:'original'|'normalized';bytes:number;mime:'image/png'|'image/jpeg'}): Promise<Blob> {
  z.uuid().parse(id); hashSchema.parse(expectedHash);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  const isHosted = hostedMode();
  if (selector) { z.uuid().parse(selector.photoId); z.enum(['original','normalized']).parse(selector.variant); z.number().int().positive().max(MAX_IMAGE_BYTES).parse(selector.bytes); mimeSchema.parse(selector.mime); }
  const path = selector ? `${id}/photos/${selector.photoId}/${selector.variant}` : id;
  const response = await transport(`/api/reviews/${path}/${isHosted ? 'evidence-link' : 'evidence'}`, {
    method: 'POST', headers: { 'x-ttb-demo-code': code }, signal: deadline, cache: 'no-store', redirect: 'error',
  });
  let evidence = response, declared: z.output<typeof evidenceLinkSchema> | undefined;
  if (isHosted) {
    declared = evidenceLinkSchema.parse(await json(response, deadline));
    if (declared.sha256 !== expectedHash || (selector && (declared.bytes !== selector.bytes || declared.mime !== selector.mime))) throw Error('evidence-integrity-mismatch');
    const url = capability(declared.url, 'evidence');
    evidence = await transport(url, { method: 'GET', signal: deadline, cache: 'no-store', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' });
  }
  const mime = evidence.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!mimeSchema.safeParse(mime).success || (declared && mime !== declared.mime) || (selector && mime !== selector.mime)) {
    void evidence.body?.cancel().catch(() => {}); throw Error('evidence-integrity-mismatch');
  }
  const bytes = await boundedBytes(evidence, selector?.bytes ?? declared?.bytes ?? MAX_IMAGE_BYTES, deadline);
  if (!bytes.length || (declared && bytes.length !== declared.bytes) || (selector && bytes.length !== selector.bytes)) throw Error('evidence-integrity-mismatch');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedHash) throw Error('evidence-integrity-mismatch');
  return new Blob([bytes], { type: mime });
}
