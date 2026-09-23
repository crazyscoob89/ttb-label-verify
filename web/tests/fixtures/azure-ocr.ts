import { AZURE_OCR_MODEL } from '../../lib/photo-contracts';
import { AZURE_OCR_ENDPOINT, type AzureOcrPricing } from '../../lib/extraction/azure-ocr-pricing';
import archived from './azure-ocr-archived-envelope.json';
import { evidence } from './photo-groups';

/** Deliberately synthetic retail estimate for mocked transport only. NEVER live pricing authority. */
export function offlineAzurePricing(): AzureOcrPricing {
  return { approved: true, model: AZURE_OCR_MODEL, endpoint: AZURE_OCR_ENDPOINT, operation: 'single-image-ocr-document-annotation',
    evidenceReference: 'offline-test-only-not-a-tariff', evidenceSha256: 'a'.repeat(64), verifiedAt: new Date().toISOString(),
    reviewBy: new Date(Date.now()+3600000).toISOString(), pricingBasis: 'published-retail-estimate',
    pageAssumption: 'one-page-per-single-frame-image', annotationBilling: 'additive-published-meter-estimate',
    ocrMicrousd: 2500, annotationMicrousd: 3750, fixedRequestMicrousd: 0, approvedMaxMicrousd: 50000 };
}
/** Real archived transport envelope, replaced annotation ONLY for new-schema
 * offline tests. The original JSON beside this file remains unchanged and fails
 * the new evidence contract. This is not live evidence of new prompt accuracy. */
export function azureEnvelope(annotation: unknown = evidence()) {
  return {...structuredClone(archived), document_annotation:JSON.stringify(annotation)};
}
