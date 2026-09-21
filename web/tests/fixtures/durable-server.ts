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
const compare=createDemoHandler({transport:async(url)=>{
 if(url.endsWith('/models'))return Response.json({data:[{id:'anthropic/claude-haiku-4.5',context_length:200000,pricing:{prompt:'0.000001',completion:'0.000005'}}]});
 console.log('SYNTHETIC_PROVIDER_CALL');
 return Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(fixtures.evidence)}}]});
}});
const server=createServer(async(req,res)=>{
 if(req.url!=='/api/comparisons')return handle(req,res);
 try{
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(typeof value==='string')headers.set(key,value);
  const response=await compare(new Request(process.env.TTB_DEMO_ORIGIN+req.url,{method:req.method,headers,body:Readable.toWeb(req),duplex:'half'} as RequestInit));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500,{'Cache-Control':'no-store'});res.end();}
});
await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));console.log(`READY pid=${process.pid}`);
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
