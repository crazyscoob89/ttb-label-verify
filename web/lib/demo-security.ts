import { createHash, timingSafeEqual } from 'node:crypto';
export class InputError extends Error { constructor(public status:number) { super('Rejected input'); } }
/** Same shared-code/origin fence for comparison, history, save and private images.
 * Origin header is required even for reads (UI fetch explicitly supplies it). */
export function demoAccess(request:Request,env:Record<string,string|undefined>):boolean {
 try {
  const secret=env.TTB_DEMO_ACCESS_SECRET,origin=env.TTB_DEMO_ORIGIN;
  if(env.TTB_DEMO_ENABLED!=='true'||!secret||!/^[A-Za-z0-9_-]{32,256}$/.test(secret)||!origin||new URL(origin).origin!==origin)return false;
  const supplied=request.headers.get('x-ttb-demo-code')??'';
  const hash=(s:string)=>createHash('sha256').update(s).digest();

  return supplied.length<=256&&timingSafeEqual(hash(supplied),hash(secret))&&request.headers.get('origin')===origin&&new URL(request.url).origin===origin&&['same-origin',null].includes(request.headers.get('sec-fetch-site'));
 }catch{return false;}
}
export async function boundedBody(message:Request|Response,max:number,timeout=5000):Promise<Buffer> {
 const length=message.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))throw new InputError(413);
 const reader=message.body?.getReader();if(!reader)throw new InputError(400);
 let timer:ReturnType<typeof setTimeout>|undefined;
 const work=async()=>{const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new InputError(413);chunks.push(value);}return Buffer.concat(chunks,size);};
 try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new InputError(408)),timeout);})]);}
 finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
