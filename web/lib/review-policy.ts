import { checkedPhotoRecord } from './photo-record';
import { z } from 'zod';
import { applicationSchema } from './contracts';
import { extractionEvidenceSchema } from './extraction/schema';
import { compareApplication, FIELD_KEYS, RULES_VERSION, RULES_REVISION } from './rules';
import { compareApplication as compareHistoricalApplication } from './rules-v1';
import { compareApplicationV3, RULES_REVISION_V3 } from './wine-rules';
import { compareApplicationV5, RULES_REVISION_V5 } from './semantic-rules';
import { immutable, type CompleteComparison } from './comparison-record';

const note = z.string().max(2000).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const resolutionSchema = z.object({ decision:z.enum(['verified-match','confirmed-mismatch','unresolved']), note, evidence:note }).strict();
const intentSchema = z.object({
  bindingKey:z.string(), outcome:z.enum(['pass','correction','second-review']).nullable(), confirmed:z.boolean(),
  physical:z.object({checked:z.boolean(),note}).strict(), notes:note,
  resolutions:z.partialRecord(z.enum(FIELD_KEYS),resolutionSchema),
}).strict();
export type ReviewIntent = z.infer<typeof intentSchema>;
export type Outcome = NonNullable<ReviewIntent['outcome']>;
export type HumanResolution = z.infer<typeof resolutionSchema>;
export type UnsavedDraft = { state:'UNSAVED'; record:CompleteComparison; intent:ReviewIntent };
const recordSchema = z.object({processing:z.literal('complete'),application:applicationSchema,imageSha256:z.string().regex(/^[a-f0-9]{64}$/),source:z.enum(['fixture','openrouter']),evidence:extractionEvidenceSchema,comparison:z.unknown()}).strict();
export function checkedRecord(value:unknown): CompleteComparison | null {
  if(value && typeof value==='object' && 'recordVersion' in value) return value.recordVersion===2?checkedPhotoRecord(value):null;
  const parsed = recordSchema.safeParse(value);
  if (!parsed.success) return null;
  const stored = parsed.data.comparison;
  if (!stored || typeof stored !== 'object' || !('rulesVersion' in stored) || stored.rulesVersion !== RULES_VERSION) return null;
  // Dispatch by the explicit stored revision, never try both and accept whichever
  // matches. Missing revision is historical v1; new singleton snapshots use v5.
  const revision = 'rulesRevision' in stored ? stored.rulesRevision : 1;
  if (revision !== 1 && revision !== RULES_REVISION && revision !== RULES_REVISION_V3 && revision !== RULES_REVISION_V5) return null;
  const compare = revision === 1 ? compareHistoricalApplication : revision === RULES_REVISION ? compareApplication : revision === RULES_REVISION_V3 ? compareApplicationV3 : compareApplicationV5;
  const comparison = compare(parsed.data.application,parsed.data.evidence);
  if (comparison.processing !== 'complete' || JSON.stringify(comparison) !== JSON.stringify(parsed.data.comparison)) return null;
  return {...parsed.data, comparison};
}
/** Full in-memory snapshot fence, not a server ID, signature or durable receipt. */
export function reviewBinding(record:unknown):string { try { return JSON.stringify(record) ?? ''; } catch { return ''; } }
export function newReviewIntent(record:unknown):ReviewIntent {
  return {bindingKey:reviewBinding(record),outcome:null,confirmed:false,physical:{checked:false,note:''},notes:'',resolutions:{}};
}
export function evaluateReview(value:unknown, input:unknown):{passAllowed:boolean;canSubmit:boolean;passReasons:string[];reasons:string[]} {
  const record=checkedRecord(value); const parsed=intentSchema.safeParse(input);
  const invalid = (reason:string) => ({passAllowed:false,canSubmit:false,passReasons:[reason],reasons:[reason]});
  if (!record) return invalid('Complete, mapped comparison evidence is required. Failed or missing records cannot be reviewed.');
  if (!parsed.success) return invalid('Review details are invalid. Use bounded notes and explicit choices.');
  const intent=parsed.data;
  if (intent.bindingKey !== reviewBinding(value)) return invalid('Evidence or application changed. Start a new review and confirmation.');
  const passReasons:string[]=[];
  for (const field of FIELD_KEYS) {
    const finding=record.comparison.fields[field]; const resolution=intent.resolutions[field];
    if (resolution?.decision === 'confirmed-mismatch') passReasons.push(`${field}: human-confirmed mismatch blocks Pass.`);
    else if (resolution?.decision === 'unresolved' || finding.status === 'mismatch' || finding.status === 'needs-review') {
      if (!(resolution?.decision === 'verified-match' && resolution.note.trim().length >= 10 && resolution.evidence.trim().length >= 10)) {
        passReasons.push(`${field}: ${finding.status}; explicit verified-match resolution with supporting evidence and reason required. Confirmed defects cannot pass.`);
      }
    }
  }
  if (!intent.physical.checked || intent.physical.note.trim().length < 10) passReasons.push('Physical print/type size is unverified: explicitly assess outside this image and document the assessment before Pass.');
  const reasons:string[]=[];
  if (!intent.outcome) reasons.push('Choose an internal review outcome.');
  if (intent.outcome === 'pass') reasons.push(...passReasons);
  if ((intent.outcome === 'correction' || intent.outcome === 'second-review') && intent.notes.trim().length < 10) reasons.push('Add relevant correction or escalation notes (at least 10 characters).');
  if (!intent.confirmed) reasons.push('Check the human confirmation beside Submit review.');
  return {passAllowed:passReasons.length===0,canSubmit:reasons.length===0,passReasons,reasons};
}
/** Records only a cloned, frozen page-memory draft. NO identity/time/history claim. */
export function buildUnsavedDraft(record:unknown, intent:unknown):UnsavedDraft|null {
  if (!evaluateReview(record,intent).canSubmit) return null;
  const checked=checkedRecord(record);
  if (!checked) return null;
  return immutable({state:'UNSAVED',record:structuredClone(checked),intent:intentSchema.parse(intent)});
}
