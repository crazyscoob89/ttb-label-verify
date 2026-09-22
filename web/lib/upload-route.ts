import { randomUUID } from 'node:crypto';
import {photoGroupDeclarationSchema} from './photo-contracts';
import {signGroupUploadTicket} from './group-media';
import { mediaSigningSecret } from './runtime-env';
import { demoAccess, InputError } from './demo-security';
import { readMediaJson, signUploadTicket, uploadDeclarationSchema } from './hosted-media';
import { signPrivateUpload, storageConfig, type MediaEnv } from './persistence/supabase-storage';

/** Quota is durable (200 tickets / 128 MiB) and injected by the hosted store.
 * No in-memory fallback or automatic quota refund after uncertain issuance. */
export function createUploadHandler({ env, quota }: {
  env: MediaEnv; quota: { reserve(ticketId: string, bytes: number): Promise<void>; reserveGroup?(uploads:{id:string;bytes:number}[]):Promise<void> };
}): (request: Request) => Promise<Response> {
  return async request => {
    const reply = (status: number, code: string) => Response.json({ code }, { status, headers: { 'Cache-Control': 'no-store' } });
    if (!demoAccess(request, env)) return reply(403, 'access-denied');
    let declaration;
    try { storageConfig(env); mediaSigningSecret(env); } catch { return reply(503, 'media-unavailable'); }
    try { const input=await readMediaJson(request);declaration=input&&typeof input==='object'&&'schemaVersion' in input?photoGroupDeclarationSchema.parse(input):uploadDeclarationSchema.parse(input); }
    catch (error) { return reply(error instanceof InputError ? error.status : 400, 'invalid-input'); }
    try {
      const id = randomUUID();
      if('schemaVersion' in declaration){
       if(!quota.reserveGroup)throw Error('Group quota unavailable');
       const group=declaration;
       const objects=group.photos.map(p=>{const id=randomUUID();return {photoId:p.photoId,id,key:`uploads/${id}`};});
       const controller=new AbortController(),signal=AbortSignal.any([request.signal,controller.signal]);let timer:ReturnType<typeof setTimeout>|undefined;
       try{return await Promise.race([(async()=>{
        signal.throwIfAborted();await quota.reserveGroup!(objects.map((o,i)=>({id:o.id,bytes:group.photos[i].bytes})));
        const uploads=[];for(const object of objects){signal.throwIfAborted();uploads.push({photoId:object.photoId,uploadUrl:await signPrivateUpload(env,object.key,signal)});}
        signal.throwIfAborted();return Response.json({schemaVersion:2,ticket:signGroupUploadTicket(group,objects,env),uploads},{headers:{'Cache-Control':'no-store'}});
       })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Issuance timeout'));},50000);})]);}
       finally{clearTimeout(timer);controller.abort();}
      }
      await quota.reserve(id, declaration.bytes);
      const uploadUrl = await signPrivateUpload(env, `uploads/${id}`);
      const ticket = signUploadTicket(id, declaration, env);
      return Response.json({ uploadUrl, ticket }, { headers: { 'Cache-Control': 'no-store' } });
    } catch { return reply(503, 'media-unavailable'); }
  };
}
