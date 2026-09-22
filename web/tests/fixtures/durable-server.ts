// Test-only loopback service. Production has no synthetic-provider switch.
import next from 'next';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { createDemoHandler } from '../../lib/demo-route';
const port=Number(process.env.TTB_TEST_PORT);
if(!port||process.env.TTB_TEST_DISPOSABLE!=='yes')throw Error('Test-only disposable harness');
const fixtures=JSON.parse(readFileSync(new URL('./comparisons.json',import.meta.url),'utf8'));
const app=next({dev:false,hostname:'127.0.0.1',port});await app.prepare();
const handle=app.getRequestHandler();
const compare=createDemoHandler({transport:async(url,init)=>{
 if(url.endsWith('/models'))return Response.json({data:[{id:'anthropic/claude-haiku-4.5',context_length:200000,pricing:{prompt:'0.000001',completion:'0.000005'}}]});
 if(url!=='https://openrouter.ai/api/v1/chat/completions')throw Error('Unexpected synthetic transport destination');
 const body=JSON.parse(String(init.body)),content=body.messages[1].content;
 const ids=content.filter((p:{type:string})=>p.type==='text').map((p:{text:string})=>JSON.parse(p.text));
 const missing={status:'missing',text:null,reason:'Not visible in this synthetic photo.'};
 const observations=ids.map((p:{photoId:string;role:string})=>{
  const evidence=structuredClone(fixtures.evidence);
  if(p.role==='front'||p.role==='back'||p.role==='closeup'){
   evidence.classType.text='Cabernet Sauvignon';evidence.origin.text='Lodi, CA';
   if(p.role==='front')evidence.warning={heading:missing,body:missing,headingBold:null,bodyBold:null};
   else {for(const k of ['brand','classType','netContents','origin'])evidence[k]=missing;evidence.producer={name:missing,address:missing};evidence.abv=p.role==='closeup'?{status:'readable',text:'45%',reason:'Synthetic conflict only.'}:missing;}
  }
  return {photoId:p.photoId,evidence};
 });
 console.log('SYNTHETIC_PROVIDER_CALL photos='+ids.length);
 return Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(ids.length?{schemaVersion:2,photos:observations}:fixtures.evidence)}}]});
}});
const server=createServer(async(req,res)=>{
 if(req.url!=='/api/comparisons'){
  const started=Date.now();res.once('finish',()=>{if(req.url?.startsWith('/api/'))console.log(JSON.stringify({path:req.url.split('?')[0],status:res.statusCode,elapsedMs:Date.now()-started}));});
  return handle(req,res);
 }
 try{
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(typeof value==='string')headers.set(key,value);
  const response=await compare(new Request(process.env.TTB_DEMO_ORIGIN+req.url,{method:req.method,headers,body:Readable.toWeb(req),duplex:'half'} as RequestInit));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error('SYNTHETIC_ROUTE_FAILURE',error instanceof Error?error.name:'unknown');res.writeHead(500,{'Cache-Control':'no-store'});res.end();}
});
await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));console.log(`READY pid=${process.pid}`);
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
