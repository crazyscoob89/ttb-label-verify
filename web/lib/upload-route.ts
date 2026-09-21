import { randomUUID } from 'node:crypto';
import { mediaSigningSecret } from './runtime-env';
import { demoAccess, InputError } from './demo-security';
import { readMediaJson, signUploadTicket, uploadDeclarationSchema } from './hosted-media';
import { signPrivateUpload, storageConfig, type MediaEnv } from './persistence/supabase-storage';

/** Quota is durable (200 tickets / 128 MiB) and injected by the hosted store.
 * No in-memory fallback or automatic quota refund after uncertain issuance. */
export function createUploadHandler({ env, quota }: {
  env: MediaEnv; quota: { reserve(ticketId: string, bytes: number): Promise<void> };
}): (request: Request) => Promise<Response> {
  return async request => {
    const reply = (status: number, code: string) => Response.json({ code }, { status, headers: { 'Cache-Control': 'no-store' } });
    if (!demoAccess(request, env)) return reply(403, 'access-denied');
    let declaration;
    try { storageConfig(env); mediaSigningSecret(env); } catch { return reply(503, 'media-unavailable'); }
    try { declaration = uploadDeclarationSchema.parse(await readMediaJson(request)); }
    catch (error) { return reply(error instanceof InputError ? error.status : 400, 'invalid-input'); }
    try {
      const id = randomUUID();
      await quota.reserve(id, declaration.bytes);
      const uploadUrl = await signPrivateUpload(env, `uploads/${id}`);
      const ticket = signUploadTicket(id, declaration, env);
      return Response.json({ uploadUrl, ticket }, { headers: { 'Cache-Control': 'no-store' } });
    } catch { return reply(503, 'media-unavailable'); }
  };
}
