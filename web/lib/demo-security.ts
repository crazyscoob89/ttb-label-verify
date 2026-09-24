export class InputError extends Error { constructor(public status:number) { super('Rejected input'); } }
/** Public evaluator fence for comparison, history, save and private images.
 * No reviewer-visible code is required; paid calls remain protected by the
 * server-side spend ledger and daily scan quota. Origin header is required even
 * for reads (UI fetch explicitly supplies it). TTB_DEMO_ACCESS_SECRET remains a
 * server-only signing key for internal batch binding, not a user credential. */
export function demoAccess(request:Request,env:Record<string,string|undefined>):boolean {
 try {
  const secret=env.TTB_DEMO_ACCESS_SECRET,origin=env.TTB_DEMO_ORIGIN;
  if(env.TTB_DEMO_ENABLED!=='true'||!secret||!/^[A-Za-z0-9_-]{32,256}$/.test(secret)||!origin||new URL(origin).origin!==origin)return false;
  return request.headers.get('origin')===origin&&new URL(request.url).origin===origin&&['same-origin',null].includes(request.headers.get('sec-fetch-site'));
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
