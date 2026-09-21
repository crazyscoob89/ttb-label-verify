import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { applicationSchema, checkFileDeclaration, filenameSchema, MAX_IMAGE_BYTES } from './contracts';
import { boundedBody, demoAccess, InputError } from './demo-security';
import { readPrivateUpload, storageConfig, type MediaEnv } from './persistence/supabase-storage';
import type { ComparisonInput } from './compare-service';

export const UPLOAD_TICKET_SECONDS = 10 * 60;
export const MEDIA_JSON_LIMIT = 65536;
export const uploadDeclarationSchema = z.object({ filename: filenameSchema, mime: z.enum(['image/png', 'image/jpeg']),
  bytes: z.number().int().min(1).max(MAX_IMAGE_BYTES), application: applicationSchema }).strict().superRefine((value, ctx) => {
  if (checkFileDeclaration({ name: value.filename, type: value.mime, size: value.bytes })) ctx.addIssue({ code: 'custom', message: 'Invalid declaration' });
});
const ticketSchema = z.object({ v: z.literal(1), id: z.uuid(), key: z.string(), issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(), declaration: uploadDeclarationSchema }).strict();
const ticketEnvelope = z.object({ ticket: z.string().min(1).max(60000) }).strict();
function secret(env: MediaEnv) {
  const key = env.TTB_DEMO_ACCESS_SECRET;
  if (!key || !/^[A-Za-z0-9_-]{32,256}$/.test(key)) throw Error('Media unavailable');
  return key;
}
// Domain separated: an upload token cannot act as a batch preparation signature.
const mac = (payload: string, env: MediaEnv) => createHmac('sha256', secret(env)).update('ttb-upload-v1\0').update(payload).digest();
export function signUploadTicket(id: string, declaration: z.output<typeof uploadDeclarationSchema>, env: MediaEnv) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const data = ticketSchema.parse({ v: 1, id, key: `uploads/${id}`, issuedAt, expiresAt: issuedAt + UPLOAD_TICKET_SECONDS, declaration });
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${mac(payload, env).toString('hex')}`;
}
function verifyUploadTicket(ticket: string, env: MediaEnv) {
  if (!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(ticket)) throw new InputError(400);
  const [payload, signature] = ticket.split('.');
  if (!timingSafeEqual(mac(payload, env), Buffer.from(signature, 'hex'))) throw new InputError(400);
  const decoded = Buffer.from(payload, 'base64url');
  if (decoded.toString('base64url') !== payload) throw new InputError(400);
  const data = ticketSchema.parse(JSON.parse(decoded.toString('utf8')));
  const now = Math.floor(Date.now() / 1000);
  if (data.key !== `uploads/${data.id}` || data.issuedAt > now || data.expiresAt <= now || data.expiresAt - data.issuedAt !== UPLOAD_TICKET_SECONDS) throw new InputError(400);
  return data;
}
export async function readMediaJson(request: Request): Promise<unknown> {
  if (request.method !== 'POST' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) throw new InputError(415);
  return JSON.parse((await boundedBody(request, MEDIA_JSON_LIMIT)).toString('utf8'));
}
/** Hosted transport only. Local multipart remains owned by the existing handler.
 * This seam returns RAW bytes; preparePair/sanitizeImage still runs before spend.
 * Repeat reads are needed for batch prepare/execute. This is not a paid intent;
 * durable ledger attempt IDs and batch signatures remain the at-most-once fence. */
export function createHostedInputReader(env: MediaEnv): (request: Request) => Promise<ComparisonInput> {
  return async request => {
    if (!demoAccess(request, env)) throw new InputError(403);
    storageConfig(env);
    const { ticket } = ticketEnvelope.parse(await readMediaJson(request));
    const data = verifyUploadTicket(ticket, env);
    const { filename, mime, bytes, application } = data.declaration;
    const image = await readPrivateUpload(env, data.key, bytes, mime);
    // A ticket that expires during a slow read is not accepted either.
    verifyUploadTicket(ticket, env);
    return { file: { filename, mime, bytes: image }, binding: { filename, application } };
  };
}
