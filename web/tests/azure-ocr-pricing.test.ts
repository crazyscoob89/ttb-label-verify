import { expect, test } from 'vitest';
import { validateAzureOcrPricing, checkAzureOcrPayload, approvedAzureOcrEndpoint, AZURE_OCR_ENDPOINT, AZURE_OCR_ORIGIN } from '../lib/extraction/azure-ocr-pricing';
import { AZURE_OCR_MODEL, azureOcrAnnotationSchema } from '../lib/extraction/azure-mistral-ocr';
import { offlineAzurePricing } from './fixtures/azure-ocr';

const payload=()=>({model:AZURE_OCR_MODEL,document:{type:'image_url',image_url:'data:image/png;base64,YQ=='},include_image_base64:false,document_annotation_format:{type:'json_schema',json_schema:{name:'ttb_photo_observations_v1',schema:azureOcrAnnotationSchema}}});
test('published-retail operational estimate needs no account guarantee, retains evidence, review deadline and $1 limit',()=>{
  const now=Date.now();
  // Synthetic estimate only: sum the OCR and Document AI page meters, not invoice settlement.
  const p={approved:true,endpoint:AZURE_OCR_ENDPOINT,model:AZURE_OCR_MODEL,operation:'single-image-ocr-document-annotation',
    evidenceReference:'OFFLINE SYNTHETIC published meters',evidenceSha256:'a'.repeat(64),verifiedAt:new Date(now).toISOString(),
    reviewBy:new Date(now+3600000).toISOString(),pricingBasis:'published-retail-estimate',
    pageAssumption:'one-page-per-single-frame-image',annotationBilling:'additive-published-meter-estimate',
    ocrMicrousd:2500,annotationMicrousd:3750,fixedRequestMicrousd:0,approvedMaxMicrousd:50000};
  expect(validateAzureOcrPricing(p,now)).toEqual(p);
  expect(validateAzureOcrPricing({...p,fixedRequestMicrousd:1000},now)).toMatchObject({fixedRequestMicrousd:1000});
  expect(validateAzureOcrPricing({...p,ocrMicrousd:500000,annotationMicrousd:500000,approvedMaxMicrousd:1_000_000},now)).toBeDefined();
  for(const key of Object.keys(p)){
    const missing:Record<string,unknown>={...p};delete missing[key];
    expect(()=>validateAzureOcrPricing(missing,now),`missing ${key}`).toThrow();
  }
  for(const change of [
    {approved:false},{model:'anthropic/claude-haiku-4.5'},{endpoint:AZURE_OCR_ORIGIN},{operation:'chat'},
    {evidenceReference:''},{evidenceSha256:'invalid'},{pageAssumption:'guaranteed'},{pricingBasis:'account-guarantee'},
    {allFeesBounded:true},{singleImageIsOnePage:true},{effectiveFrom:new Date(now).toISOString()},{validUntil:new Date(now+3600000).toISOString()},
    {annotationBilling:'tokens'},{annotationBilling:'unbounded'},{annotationBilling:'included'},
    {annotationMicrousd:0},{annotationMicrousd:Infinity},{annotationMicrousd:'3750'},{fixedRequestMicrousd:NaN},
    {unknownFee:0},{ocrMicrousd:-1},{ocrMicrousd:0.1},{ocrMicrousd:0},
    {approvedMaxMicrousd:0},{ocrMicrousd:50001},{ocrMicrousd:1_000_001},{approvedMaxMicrousd:1_000_001},
    {ocrMicrousd:600000,annotationMicrousd:500000,approvedMaxMicrousd:1_000_000},
    {verifiedAt:'not-a-date'},{verifiedAt:new Date(now+10000).toISOString()}, {verifiedAt:new Date(now-86400001).toISOString()},
    {reviewBy:new Date(now+19999).toISOString()},{reviewBy:new Date(now-1).toISOString()},
    {reviewBy:new Date(now+86400001).toISOString()},
  ])expect(()=>validateAzureOcrPricing({...p,...change},now),JSON.stringify(change)).toThrow();
});

test('only approved exact origin/full route can become endpoint, no URL resolution ambiguity',()=>{
  for(const endpoint of [AZURE_OCR_ENDPOINT,AZURE_OCR_ORIGIN,AZURE_OCR_ORIGIN+'/'])expect(approvedAzureOcrEndpoint(endpoint)).toBe(AZURE_OCR_ENDPOINT);
  for(const endpoint of [undefined,'',AZURE_OCR_ENDPOINT+'/',AZURE_OCR_ENDPOINT+'?x=1',AZURE_OCR_ENDPOINT+'#fragment',AZURE_OCR_ORIGIN+':443',AZURE_OCR_ORIGIN+'/providers/mistral/azure/../azure/ocr',AZURE_OCR_ORIGIN.replace('https:','http:'),'https://user@ttb-foundry-trial-resource.services.ai.azure.com',AZURE_OCR_ENDPOINT.replace('ttb-foundry-trial-resource','other')])expect(()=>approvedAzureOcrEndpoint(endpoint)).toThrow();
});

test('exact payload gate forbids pricing-relevant operations, unknown flags, remote docs, multiple images and schema drift',()=>{
  const p=offlineAzurePricing();expect(()=>checkAzureOcrPayload(JSON.stringify(payload()),azureOcrAnnotationSchema,p)).not.toThrow();
  for(const change of [
    {model:'mistral-large'},{max_tokens:3000},{messages:[]},{pages:[0]},{include_image_base64:true},
    {document:{type:'document_url',document_url:'https://evil.invalid/pdf'}},
    {document:{type:'image_url',image_url:'https://evil.invalid/image.png'}},
    {document:{type:'image_url',image_url:'data:image/gif;base64,YQ=='}},
    {document:[payload().document,payload().document]},
    {document_annotation_format:{type:'json_schema',json_schema:{name:'ttb_photo_observations_v1',schema:{}}}},
  ])expect(()=>checkAzureOcrPayload(JSON.stringify({...payload(),...change}),azureOcrAnnotationSchema,p)).toThrow();
});
