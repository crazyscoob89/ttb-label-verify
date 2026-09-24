import {test as base,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
// Capture sanitized diagnostics throughout the run, including failures before the
// first success assertion. Never retain request bodies, headers or signed URLs.
export const test=base.extend<{diagnostics:void}>({diagnostics:[async({page},use,info)=>{
 const started=Date.now(),api:{path:string;status?:number;failed?:string;elapsedMs:number}[]=[],errors:string[]=[];
 const path=(url:string)=>{try{const p=new URL(url).pathname;return p.startsWith('/api/')?p.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g,':id'):null;}catch{return null;}};
 page.on('response',response=>{const p=path(response.url());if(p)api.push({path:p,status:response.status(),elapsedMs:Date.now()-started});});
 page.on('requestfailed',request=>{const p=path(request.url());if(p)api.push({path:p,failed:request.failure()?.errorText??'request-failed',elapsedMs:Date.now()-started});});
 page.on('pageerror',error=>errors.push(error.name));
 try{await use();}finally{const alerts=await page.locator('[role=alert]:visible').allTextContents().catch(()=>[]),status=await page.locator('[role=status]:visible').allTextContents().catch(()=>[]);const artifact=info.outputPath('sanitized-operation-diagnostics.json');await writeFile(artifact,JSON.stringify({provenance:'LOCAL MOCK API TEST — no provider/storage proof',api,errors,alerts,status,elapsedMs:Date.now()-started},null,2));await info.attach('sanitized-operation-diagnostics',{path:artifact,contentType:'application/json'});}
 },{auto:true}]});
export {expect};
export async function verifyAccess(page:Page,code:string){await page.getByLabel('Demo access code',{exact:true}).fill(code);await page.getByRole('button',{name:'Verify access',exact:true}).click();const region=page.getByRole('region',{name:'Demo session access'});await expect(region.locator('[role=status],[role=alert]')).toContainText(/Access verified|denied|unavailable|failed|could not/i);await expect(region.getByText('✓ Access verified',{exact:true})).toBeVisible();}
