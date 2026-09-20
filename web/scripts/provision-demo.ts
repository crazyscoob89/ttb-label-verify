import { join, isAbsolute } from 'node:path';
import { lstatSync, realpathSync } from 'node:fs';
import { SqliteSpendStore } from '../lib/sqlite-spend';
// Explicit ONE-TIME operator action, never called by the application/start script.
const dir = process.argv[2];
if (!dir || !isAbsolute(dir) || realpathSync(dir)!==dir || !lstatSync(dir).isDirectory() || (lstatSync(dir).mode & 0o077)!==0) throw Error('Supply existing private persistent directory (0700)');
SqliteSpendStore.provision(join(dir,'spend.sqlite'));
console.log('Fixed $25 ledger provisioned. Preserve this volume for the entire demo.');
