import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { applicationSchema, checkFileDeclaration, filenameSchema, MAX_IMAGE_BYTES } from './contracts';
import { boundedBody, demoAccess, InputError } from './demo-security';
import { readPrivateUpload, storageConfig, type MediaEnv } from './persistence/supabase-storage';
import { mediaSigningSecret } from './runtime-env';
import type { ComparisonInput } from './compare-service';
import {groupCompareRequestSchema} from './photo-contracts';
import {readGroupUploadTicket,type GroupRouteInput} from './group-media';

export const UPLOAD_TICKET_SECONDS = 10 * 60;
export const MEDIA_JSON_LIMIT = 65536;
export const uploadDeclarationSchema = z.object({ filename: filenameSchema, mime: z.enum(['image/png', 'image/jpeg']),
  bytes: z.number().int().min(1).max(MAX_IMAGE_BYTES), application: applicationSchema }).strict().superRefine((value, ctx) => {
  if (checkFileDeclaration({ name: value.filename, type: value.mime, size: value.bytes })) ctx.addIssue({ code: 'custom', message: 'Invalid declaration' });
});
const ticketSchema = z.object({ v: z.literal(1), id: z.uuid(), key: z.string(), issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(), declaration: uploadDeclarationSchema }).strict();
const ticketEnvelope = z.object({ ticket: z.string().min(1).max(60000) }).strict();
// Domain separated and signed only with an independent server secret. The demo
// access secret remains server-side and never grants arbitrary ticket minting.
const mac = (payload: string, env: MediaEnv) => createHmac('sha256', mediaSigningSecret(env)).update('ttb-upload-v1\0').update(payload).digest();
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
export function createHostedInputReader(env: MediaEnv): (request: Request,signal?:AbortSignal) => Promise<ComparisonInput|GroupRouteInput> {
  return async (request,signal) => {
    if (!demoAccess(request, env)) throw new InputError(403);
    storageConfig(env);
    const input=await readMediaJson(request);
    if(input&&typeof input==='object'&&'schemaVersion' in input){
     const parsed=groupCompareRequestSchema.parse(input);
     if(['x-ttb-batch-phase','x-ttb-batch-intent','x-ttb-batch-binding'].some(h=>request.headers.has(h)))throw new InputError(400);
     const operation=parsed.phase==='prepare'?{phase:'prepare' as const}:{phase:'execute' as const,attemptId:parsed.attemptId,reservationId:parsed.reservationId,binding:parsed.binding};
     return readGroupUploadTicket(parsed.ticket,env,operation,signal);
    }
    const { ticket } = ticketEnvelope.parse(input);
    const data = verifyUploadTicket(ticket, env);
    const { filename, mime, bytes, application } = data.declaration;
    const image = await readPrivateUpload(env, data.key, bytes, mime);
    // A ticket that expires during a slow read is not accepted either.
    verifyUploadTicket(ticket, env);
    return { file: { filename, mime, bytes: image }, binding: { filename, application } };
  };
}
