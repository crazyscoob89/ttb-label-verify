import { z } from 'zod';

export const MAX_OBSERVATION_TEXT = 2000;
export const MAX_OBSERVATION_REASON = 500;
// JSON evidence only: no executable instructions, judgments, defaults or coercion.
// Permit layout whitespace, but reject other ASCII control characters.
const boundedText = (max: number) => z.string().max(max).refine(
  value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  'Control characters are not supported',
);
export const observationSchema = z.object({
  status: z.enum(['readable', 'uncertain', 'unreadable', 'missing']),
  text: boundedText(MAX_OBSERVATION_TEXT).nullable(),
  reason: boundedText(MAX_OBSERVATION_REASON).refine(value => value.trim().length > 0, 'A reason is required'),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'readable' && (value.text === null || value.text.trim().length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['text'], message: 'Readable evidence requires nonblank text' });
  }
  if (value.status === 'missing' && value.text !== null) {
    ctx.addIssue({ code: 'custom', path: ['text'], message: 'Missing evidence must use null text' });
  }
});

export const extractionEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  brand: observationSchema,
  classType: observationSchema,
  abv: observationSchema,
  netContents: observationSchema,
  producer: z.object({ name: observationSchema, address: observationSchema }).strict(),
  origin: observationSchema,
  warning: z.object({
    heading: observationSchema,
    body: observationSchema,
    headingBold: z.boolean().nullable(),
    bodyBold: z.boolean().nullable(),
  }).strict(),
}).strict();

export type Observation = z.output<typeof observationSchema>;
export type ExtractionEvidence = z.output<typeof extractionEvidenceSchema>;
// Sprint 2 must bound transport bytes BEFORE JSON decoding; this parser accepts
// an already-decoded unknown value, never a provider-supplied match judgment.
export function parseExtractionEvidence(input: unknown): ExtractionEvidence {
  return extractionEvidenceSchema.parse(input);
}
