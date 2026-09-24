import { readFileSync,writeFileSync,statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importSql,stageCustody,verifyCustody } from './demo-custody';
// Explicit operator only. Module must export createSupabaseObjects(env).
// Uploads/reads private objects then writes owner SQL, never executes/activates it.
async function main(){
 const args=process.argv.slice(2),[manifest,out,modulePath,mode,flag,footprintPath]=args;
 if(!manifest||!out||!modulePath||!['--stage-authorized','--verify-existing'].includes(mode)||!(args.length===4||(args.length===6&&flag==='--expected-uploads'&&footprintPath)))throw Error('Usage: SEALED_JSON OUTPUT_SQL OBJECTS_MODULE --stage-authorized|--verify-existing [--expected-uploads UPLOADS_JSON]');
 if(statSync(manifest).size>200*1024*1024)throw Error('Manifest too large');
 const sealed=JSON.parse(readFileSync(manifest,'utf8'));verifyCustody(sealed);
 if(footprintPath&&statSync(footprintPath).size>64*1024)throw Error('Upload footprint too large');
 const expectedUploads=footprintPath?JSON.parse(readFileSync(footprintPath,'utf8')):[];
 // Validate all local input before loading the object module or doing Storage IO.
 const sql=importSql(sealed,{expectedUploads});
 const {createSupabaseObjects}=await import(pathToFileURL(resolve(modulePath)).href);
 await stageCustody(sealed,createSupabaseObjects(process.env),mode==='--verify-existing');
 writeFileSync(out,sql,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({sha256:sealed.sha256,sql:out,status:'objects verified; owner SQL prepared; database NOT modified/enabled'}));
}
void main().catch(()=>{console.error('Custody preparation failed; no automatic retries, overwrites or activation.');process.exitCode=1;});
