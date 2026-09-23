import {readFileSync} from 'node:fs';
import {test,expect} from 'vitest';

const read=(name:string)=>readFileSync(new URL(`../db/migrations/${name}`,import.meta.url),'utf8');
const oldPair="doc->'comparison'->>'rulesRevision' IS DISTINCT FROM '4' OR doc->>'aggregationVersion' IS DISTINCT FROM 'photo-set-aggregation-v1'";
const newPair="NOT ((doc->'comparison'->>'rulesRevision' IS NOT DISTINCT FROM '4' AND doc->>'aggregationVersion' IS NOT DISTINCT FROM 'photo-set-aggregation-v1') OR (doc->'comparison'->>'rulesRevision' IS NOT DISTINCT FROM '6' AND doc->>'aggregationVersion' IS NOT DISTINCT FROM 'photo-set-aggregation-v2'))";
const functionText=(s:string)=>s.slice(s.indexOf('FUNCTION ttb_demo_private.photo_asset_bytes'),s.indexOf('END $$;')+7);
test('004 changes ONLY null-safe paired semantic admission, preserving every 003 asset/digest/quota guard',()=>{
 const old=read('003_photo_groups.sql'),next=read('004_bottle_semantics.sql');
 expect(functionText(next)).toBe(functionText(old).replace(oldPair,newPair));
 const outside=next.replace(/--[^\n]*/g,'').replace(/CREATE OR REPLACE FUNCTION[\s\S]*?END \$\$;/,'').trim();
 expect(outside).toBe('BEGIN;\n\n\nCOMMIT;');
 expect(next).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|DROP|GRANT|ALTER)\b/);
});
