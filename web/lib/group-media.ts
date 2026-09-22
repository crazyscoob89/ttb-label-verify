import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {photoGroupDeclarationSchema,photoIdSchema,type PhotoGroupDeclaration,type GroupOperation} from './photo-contracts';
import type {GroupComparisonInput} from './intake';
import {mediaSigningSecret} from './runtime-env';
import {readPrivateUpload,type MediaEnv} from './persistence/supabase-storage';
import {InputError} from './demo-security';
export type GroupRouteInput=GroupComparisonInput&{operation:GroupOperation;expiresAt?:number};
const ticketSchema=z.object({v:z.literal(2),id:photoIdSchema,issuedAt:z.number().int().nonnegative(),expiresAt:z.number().int().nonnegative(),declaration:photoGroupDeclarationSchema,objects:z.array(z.object({photoId:photoIdSchema,id:photoIdSchema,key:z.string()}).strict()).min(1).max(4)}).strict();
const mac=(payload:string,env:MediaEnv)=>createHmac('sha256',mediaSigningSecret(env)).update('ttb-upload-group-v2\0').update(payload).digest();
export function signGroupUploadTicket(declaration:PhotoGroupDeclaration,objects:{photoId:string;id:string;key:string}[],env:MediaEnv):string {
 const issuedAt=Math.floor(Date.now()/1000);
 const data=ticketSchema.parse({v:2,id:randomUUID(),issuedAt,expiresAt:issuedAt+600,declaration,objects});
 validateObjects(data);const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return `${payload}.${mac(payload,env).toString('hex')}`;
}
function validateObjects(data:z.infer<typeof ticketSchema>){
 if(data.objects.length!==data.declaration.photos.length||new Set(data.objects.map(o=>o.id)).size!==data.objects.length||data.objects.some((o,i)=>o.photoId!==data.declaration.photos[i].photoId||o.key!==`uploads/${o.id}`))throw new InputError(400);
}
export function verifyGroupUploadTicket(ticket:string,env:MediaEnv){
 if(ticket.length>60000||!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(ticket))throw new InputError(400);
 const [payload,signature]=ticket.split('.');if(!timingSafeEqual(mac(payload,env),Buffer.from(signature,'hex')))throw new InputError(400);
 const decoded=Buffer.from(payload,'base64url');if(decoded.toString('base64url')!==payload)throw new InputError(400);
 const data=ticketSchema.parse(JSON.parse(decoded.toString('utf8')));validateObjects(data);
 const now=Math.floor(Date.now()/1000);if(data.issuedAt>now||data.expiresAt<=now||data.expiresAt-data.issuedAt!==600)throw new InputError(400);
 return data;
}
export async function readGroupUploadTicket(ticket:string,env:MediaEnv,operation:GroupOperation,signal?:AbortSignal):Promise<GroupRouteInput>{
 const data=verifyGroupUploadTicket(ticket,env);const files:GroupComparisonInput['files']=[];
 for(const [i,p] of data.declaration.photos.entries()){
  signal?.throwIfAborted();const bytes=await readPrivateUpload(env,data.objects[i].key,p.bytes,p.mime,signal);
  files.push({photoId:p.photoId,image:{filename:p.filename,mime:p.mime,bytes}});
 }
 signal?.throwIfAborted();verifyGroupUploadTicket(ticket,env);
 return {schemaVersion:2,group:data.declaration,files,operation,expiresAt:data.expiresAt};
}
