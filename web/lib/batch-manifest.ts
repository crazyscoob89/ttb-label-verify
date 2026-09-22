import { z } from 'zod';
import { applicationSchema, filenameSchema, MAX_BATCH_PAIRS, type Application } from './contracts';
import { immutable } from './comparison-record';
import type {PhotoRole} from './live-photo-client';
export type BatchPhotoReference={photoId:string;filename:string;role:PhotoRole};

/** References sanitized evidence; this is NOT image decoding or hash verification. */
export const batchImageSchema = z.object({ filename: filenameSchema, imageSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
/** Local live declarations are explicitly unprepared, never a fake/raw hash. */
export const unpreparedBatchImageSchema = z.object({ filename: filenameSchema, imageSha256: z.null() }).strict();
export type BatchImage = z.infer<typeof batchImageSchema>;
export type ManifestIssue = 'invalid-filename' | 'invalid-file' | 'invalid-mapping' | 'invalid-application' |
  'duplicate-file' | 'duplicate-mapping' | 'duplicate-application' | 'missing-file' | 'missing-mapping';
type EntryBase = { id: string; filename: string | null; fileIndexes: number[]; mappingIndexes: number[]; issues: ManifestIssue[] };
export type ValidBatchEntry = EntryBase & { status: 'valid'; filename: string; application: Application; imageSha256: string | null;groupId?:string;photos?:BatchPhotoReference[] };
export type BatchEntry = ValidBatchEntry | (EntryBase & { status: 'blocked' });
export type BatchManifest = { entries: BatchEntry[]; counts: { total: number; valid: number; blocked: number } };

const mappingSchema = z.object({ filename: filenameSchema, application: applicationSchema }).strict();
const arraySchema = z.array(z.unknown()).max(MAX_BATCH_PAIRS);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Exact, case-sensitive filename joins. Duplicate occurrences share one blocked
 * logical row, with every input index retained. Bad rows do not poison good rows.
 * A JSON array is intentional: unlike a filename-keyed object, it retains duplicates.
 * No list-order pairing, sample lookup, filesystem, provider, or application defaults.
 */
export function buildBatchManifest(filesInput: unknown, manifestInput: unknown, options: { live?: boolean } = {}): BatchManifest {
  const decoded=typeof manifestInput==='string'?JSON.parse(manifestInput):manifestInput;
  if(object(decoded).schemaVersion===2)return buildGroupedManifest(filesInput,decoded,options);
  const imageSchema = options.live ? unpreparedBatchImageSchema : batchImageSchema;
  const files = arraySchema.parse(filesInput);
  const mappings = arraySchema.parse(typeof manifestInput === 'string' ? JSON.parse(manifestInput) : manifestInput);
  const groups = new Map<string, EntryBase>();
  const add = (input: unknown, index: number, kind: 'file' | 'mapping') => {
    const name = filenameSchema.safeParse(object(input).filename);
    const id = name.success ? `filename:${name.data}` : `invalid-${kind}:${index}`;
    const group = groups.get(id) ?? { id, filename: name.success ? name.data : null, fileIndexes: [], mappingIndexes: [], issues: name.success ? [] : ['invalid-filename'] };
    (kind === 'file' ? group.fileIndexes : group.mappingIndexes).push(index);
    groups.set(id, group);
  };
  files.forEach((f, i) => add(f, i, 'file'));
  mappings.forEach((m, i) => add(m, i, 'mapping'));
  if (groups.size === 0 || groups.size > MAX_BATCH_PAIRS) throw new Error('Batch must contain 1 to 300 logical entries');

  // Identity duplication remains ambiguous even if one duplicate has bad ABV.
  const identities = new Map<string, number[]>();
  mappings.forEach((m, i) => {
    const a = object(object(m).application);
    const id = applicationSchema.shape.applicationId.safeParse(a.applicationId);
    const version = applicationSchema.shape.applicationVersion.safeParse(a.applicationVersion);
    if (id.success && version.success) {
      const key = JSON.stringify([id.data, version.data]);
      identities.set(key, [...(identities.get(key) ?? []), i]);
    }
  });
  const duplicateIdentities = new Set([...identities.values()].filter(indices => indices.length > 1).flat());
  const entries: BatchEntry[] = [...groups.values()].map(group => {
    const issues = new Set(group.issues);
    if (!group.fileIndexes.length) issues.add('missing-file');
    if (!group.mappingIndexes.length) issues.add('missing-mapping');
    if (group.fileIndexes.length > 1) issues.add('duplicate-file');
    if (group.mappingIndexes.length > 1) issues.add('duplicate-mapping');
    for (const i of group.fileIndexes) if (!imageSchema.safeParse(files[i]).success) issues.add('invalid-file');
    for (const i of group.mappingIndexes) {
      if (!mappingSchema.safeParse(mappings[i]).success) issues.add('invalid-mapping');
      if (!applicationSchema.safeParse(object(mappings[i]).application).success) issues.add('invalid-application');
      if (duplicateIdentities.has(i)) issues.add('duplicate-application');
    }
    const base = { ...group, issues: [...issues] };
    if (issues.size) return { ...base, status: 'blocked' };
    const image = imageSchema.parse(files[group.fileIndexes[0]]);
    const mapping = mappingSchema.parse(mappings[group.mappingIndexes[0]]);
    return { ...base, status: 'valid', filename: image.filename, imageSha256: image.imageSha256, application: mapping.application };
  });
  const valid = entries.filter(e => e.status === 'valid').length;
  return immutable({ entries, counts: { total: entries.length, valid, blocked: entries.length - valid } });
}

const groupedMapping=z.object({groupId:z.uuid(),application:applicationSchema,photos:z.array(z.object({photoId:z.uuid(),filename:filenameSchema,role:z.enum(['front','back','neck','closeup','other'])}).strict()).min(1).max(4)}).strict();
function buildGroupedManifest(filesInput:unknown,input:unknown,options:{live?:boolean}):BatchManifest {
 const files=z.array(z.unknown()).max(1200).parse(filesInput),envelope=z.object({schemaVersion:z.literal(2),groups:z.array(z.unknown()).min(1).max(300)}).strict().parse(input);
 const mappings=envelope.groups, fileNames=new Map<string,number[]>(), names=new Map<string,number[]>(),ids=new Map<string,number[]>(),groups=new Map<string,number[]>(),apps=new Map<string,number[]>();
 const add=(map:Map<string,number[]>,key:unknown,i:number)=>{if(typeof key==='string')map.set(key,[...(map.get(key)??[]),i]);};
 files.forEach((f,i)=>add(fileNames,object(f).filename,i));
 mappings.forEach((m,i)=>{const value=object(m),a=object(value.application);add(groups,value.groupId,i);add(apps,JSON.stringify([a.applicationId,a.applicationVersion]),i);if(Array.isArray(value.photos))value.photos.forEach(p=>{add(names,object(p).filename,i);add(ids,object(p).photoId,i);});});
 const entries:BatchEntry[]=mappings.map((m,i)=>{
  const parsed=groupedMapping.safeParse(m),raw=object(m),refs=Array.isArray(raw.photos)?raw.photos:[],issues=new Set<ManifestIssue>();
  if(!parsed.success||!options.live)issues.add('invalid-mapping');
  if(!applicationSchema.safeParse(raw.application).success)issues.add('invalid-application');
  if((groups.get(String(raw.groupId))?.length??0)>1)issues.add('duplicate-mapping');
  const a=object(raw.application);if((apps.get(JSON.stringify([a.applicationId,a.applicationVersion]))?.length??0)>1)issues.add('duplicate-application');
  const fileIndexes:number[]=[];
  refs.forEach(p=>{const ref=object(p),indexes=fileNames.get(String(ref.filename))??[];fileIndexes.push(...indexes);if(!indexes.length)issues.add('missing-file');if(indexes.length>1)issues.add('duplicate-file');if((names.get(String(ref.filename))?.length??0)>1||(ids.get(String(ref.photoId))?.length??0)>1)issues.add('duplicate-mapping');for(const index of indexes)if(!unpreparedBatchImageSchema.safeParse(files[index]).success)issues.add('invalid-file');});
  const base={id:`group:${String(raw.groupId)}:${i}`,filename:parsed.success?parsed.data.application.brand:null,fileIndexes,mappingIndexes:[i],issues:[...issues]};
  return parsed.success&&!issues.size?{...base,status:'valid',filename:parsed.data.photos.map(p=>p.filename).join(' + '),application:parsed.data.application,imageSha256:null,groupId:parsed.data.groupId,photos:parsed.data.photos}:{...base,status:'blocked'};
 });
 files.forEach((f,i)=>{if(!names.has(String(object(f).filename)))entries.push({id:`unmapped:${i}`,filename:typeof object(f).filename==='string'?String(object(f).filename):null,fileIndexes:[i],mappingIndexes:[],issues:['missing-mapping'],status:'blocked'});});
 if(entries.length>300)throw Error('Batch must contain 1 to 300 logical entries');
 const valid=entries.filter(e=>e.status==='valid').length;return immutable({entries,counts:{total:entries.length,valid,blocked:entries.length-valid}});
}
