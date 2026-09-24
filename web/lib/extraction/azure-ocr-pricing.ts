import { z } from 'zod';
import { AZURE_OCR_MODEL } from '../photo-contracts';

export const AZURE_OCR_ENDPOINT = 'https://ttb-foundry-trial-resource.services.ai.azure.com/providers/mistral/azure/ocr';
export const AZURE_OCR_ORIGIN = 'https://ttb-foundry-trial-resource.services.ai.azure.com';
export const AZURE_OCR_TIMEOUT_MS = 20_000;
const MAX_PRICE_AGE_MS = 24 * 60 * 60 * 1000;
const micros = z.number().int().nonnegative().max(1_000_000);
/** Operator-approved published-retail operational estimate for ONE decoded
 * single-frame image with annotation. Sum all relevant published page meters
 * conservatively; neither account-specific/all-fees guarantee nor settlement.
 * One image = one page is an explicit estimate assumption, not a billing fact.
 * reviewBy is an operator policy deadline, not a promised tariff-validity date.
 * No historical retail default, token approximation, or automatic price lookup. */
const pricingSchema = z.object({
  approved: z.literal(true), endpoint: z.literal(AZURE_OCR_ENDPOINT), model: z.literal(AZURE_OCR_MODEL),
  operation: z.literal('single-image-ocr-document-annotation'),
  evidenceReference: z.string().trim().min(1).max(2048), evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  verifiedAt: z.iso.datetime(), reviewBy: z.iso.datetime(),
  pricingBasis: z.literal('published-retail-estimate'),
  pageAssumption: z.literal('one-page-per-single-frame-image'),
  annotationBilling: z.enum(['additive-published-meter-estimate']),
  ocrMicrousd: micros.positive(), annotationMicrousd: micros.positive(), fixedRequestMicrousd: micros,
  approvedMaxMicrousd: micros.positive(),
}).strict();
export type AzureOcrPricing = z.infer<typeof pricingSchema>;
export function validateAzureOcrPricing(input: unknown, now = Date.now()): AzureOcrPricing {
  const p = pricingSchema.parse(input);
  const verified = Date.parse(p.verifiedAt), reviewBy = Date.parse(p.reviewBy);
  const estimate = p.ocrMicrousd + p.annotationMicrousd + p.fixedRequestMicrousd;
  if (!Number.isSafeInteger(now) || verified > now || now - verified > MAX_PRICE_AGE_MS ||
      reviewBy < now + AZURE_OCR_TIMEOUT_MS || reviewBy - verified > MAX_PRICE_AGE_MS || reviewBy <= verified ||
      estimate <= 0 || estimate > p.approvedMaxMicrousd || estimate > 1_000_000) throw Error('Azure OCR price unavailable');
  return p;
}
/** The archived environment uses the origin; accept it or the exact full route,
 * never resolve caller paths, queries, fragments, userinfo or alternate origins. */
export function approvedAzureOcrEndpoint(endpoint: unknown): typeof AZURE_OCR_ENDPOINT {
  if (endpoint !== AZURE_OCR_ENDPOINT && endpoint !== AZURE_OCR_ORIGIN && endpoint !== `${AZURE_OCR_ORIGIN}/`) throw Error('Azure OCR endpoint unavailable');
  return AZURE_OCR_ENDPOINT;
}
export function azureOcrPricingFromEnv(env: Record<string, string | undefined>): AzureOcrPricing {
  const text = env.TTB_AZURE_OCR_PRICING_JSON;
  if (!text || Buffer.byteLength(text) > 8192) throw Error('Azure OCR price unavailable');
  return validateAzureOcrPricing(JSON.parse(text));
}
/** Rechecked against the exact private request immediately before every POST. */
export function checkAzureOcrPayload(body: string, expectedSchema: unknown, pricing: unknown, now = Date.now()) {
  validateAzureOcrPricing(pricing, now);
  const p = z.object({
    model: z.literal(AZURE_OCR_MODEL),
    document: z.object({ type: z.literal('image_url'), image_url: z.string().regex(/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/) }).strict(),
    include_image_base64: z.literal(false),
    document_annotation_format: z.object({ type: z.literal('json_schema'), json_schema: z.object({name:z.literal('ttb_photo_observations_v1'),schema:z.unknown()}).strict() }).strict(),
  }).strict().parse(JSON.parse(body));
  if (JSON.stringify(p.document_annotation_format.json_schema.schema) !== JSON.stringify(expectedSchema)) throw Error('Azure OCR annotation drift');
}
