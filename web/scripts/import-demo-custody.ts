import { readFileSync,writeFileSync,statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importSql,stageCustody,verifyCustody } from './demo-custody';
// Explicit operator only. Module must export createSupabaseObjects(env).
// Uploads/reads private objects then writes owner SQL, never executes/activates it.
async function main(){
 const [manifest,out,modulePath,mode]=process.argv.slice(2);
 if(!manifest||!out||!modulePath||!['--stage-authorized','--verify-existing'].includes(mode)||process.argv.length!==6)throw Error('Usage: SEALED_JSON OUTPUT_SQL OBJECTS_MODULE --stage-authorized|--verify-existing');
 if(statSync(manifest).size>200*1024*1024)throw Error('Manifest too large');
 const sealed=JSON.parse(readFileSync(manifest,'utf8'));verifyCustody(sealed);
 const {createSupabaseObjects}=await import(pathToFileURL(resolve(modulePath)).href);
 await stageCustody(sealed,createSupabaseObjects(process.env),mode==='--verify-existing');
 writeFileSync(out,importSql(sealed),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({sha256:sealed.sha256,sql:out,status:'objects verified; owner SQL prepared; database NOT modified/enabled'}));
}
void main().catch(()=>{console.error('Custody preparation failed; no automatic retries, overwrites or activation.');process.exitCode=1;});
