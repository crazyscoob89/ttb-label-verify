import { writeFileSync,readFileSync } from 'node:fs';
import { exportCustody } from './demo-custody';
// Node 24: node --import tsx scripts/export-demo-custody.ts SPEND REVIEWS EXPECTED_JSON OUTPUT --writers-stopped
const [spendPath,reviewPath,expectedPath,out,attestation]=process.argv.slice(2);
if(!spendPath||!reviewPath||!expectedPath||!out||attestation!=='--writers-stopped'||process.argv.length!==7)throw Error('Usage: SPEND REVIEWS EXPECTED_JSON OUTPUT --writers-stopped (all writers must be fenced)');
const sealed=exportCustody({spendPath,reviewPath,expected:JSON.parse(readFileSync(expectedPath,'utf8')),writersStopped:true});
writeFileSync(out,JSON.stringify(sealed),{flag:'wx',mode:0o600});
console.log(JSON.stringify({sha256:sealed.sha256,output:out,status:'sealed; destination NOT enabled'}));
