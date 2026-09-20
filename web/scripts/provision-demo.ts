import { join, isAbsolute } from 'node:path';
import { SqliteSpendStore } from '../lib/sqlite-spend';
// Explicit ONE-TIME operator action, never called by the application/start script.
const dir = process.argv[2];
if (!dir || !isAbsolute(dir)) throw Error('Supply existing absolute private persistent directory');
// Store provisioning verifies the directory, platform permissions and sidecars
// BEFORE creating anything. Windows mode bits are not an ACL check.
SqliteSpendStore.provision(join(dir,'spend.sqlite'));
console.log('Fixed $25 ledger provisioned. Preserve this volume for the entire demo.');
