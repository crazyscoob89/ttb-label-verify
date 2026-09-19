import { z } from 'zod';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const MAX_BATCH_PAIRS = 300;

// Do not silently trim identity or rewrite applicant declarations.
const text = z.string().min(1).max(1000).refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value), 'Provide nonblank text without control characters');
const identity = text.refine(value => value === value.trim() && value.length <= 128, 'Use an identifier without surrounding whitespace (128 characters maximum)');
const abv = z.union([
  z.number(),
  z.string().max(32).refine(value => /^\d+(?:\.\d+)?$/.test(value.trim()), 'Use a decimal percentage, without units').transform(value => Number(value.trim())),
]).pipe(z.number().finite().min(0).max(100));

export const applicationSchema = z.object({
  applicationId: identity,
  applicationVersion: identity,
  brand: text,
  classType: text,
  abv,
  netContents: text,
  producerName: text,
  producerAddress: text,
  commodity: z.enum(['wine', 'distilled-spirits', 'malt-beverage']),
  imported: z.boolean(),
  origin: z.object({ kind: z.enum(['domestic', 'imported']), country: text }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.origin.kind !== (value.imported ? 'imported' : 'domestic')) {
    ctx.addIssue({ code: 'custom', path: ['origin'], message: 'Origin context must agree with the explicit import selection' });
  }
  const country = value.origin.country.trim().toLowerCase().replace(/[.]/g, '');
  if (value.imported && ['united states', 'united states of america', 'us', 'usa'].includes(country)) {
    ctx.addIssue({ code: 'custom', path: ['origin', 'country'], message: 'Imported products require a foreign country of origin' });
  }
  if (!value.imported && !['united states', 'united states of america', 'us', 'usa'].includes(country)) {
    ctx.addIssue({ code: 'custom', path: ['origin', 'country'], message: 'Domestic context requires an explicit United States origin' });
  }
});

export type Application = z.output<typeof applicationSchema>;
export function parseApplication(input: unknown): Application { return applicationSchema.parse(input); }

export const filenameSchema = z.string().min(1).max(255).refine(
  name => name === name.trim() && !/[\\/:\u0000-\u001f\u007f]/.test(name) && name !== '.' && name !== '..',
  'Use an exact filename, not a URL or path',
);
export const manifestSchema = z.array(z.object({ filename: filenameSchema, application: applicationSchema }).strict()).min(1).max(MAX_BATCH_PAIRS);

// Browser-only advisory checks, NOT byte validation or decoding.
export function checkFileDeclaration(file: { name: string; type: string; size: number }): string | null {
  if (!filenameSchema.safeParse(file.name).success) return 'Choose a file with an unambiguous filename.';
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) return 'Choose a nonempty file no larger than 10 MiB.';
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (!((extension === 'png' && file.type === 'image/png') || ((extension === 'jpg' || extension === 'jpeg') && file.type === 'image/jpeg'))) return 'Filename and declared type must agree: JPEG or PNG only.';
  return null;
}
