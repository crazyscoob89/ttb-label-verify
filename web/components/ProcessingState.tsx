import type { ComparisonRecord } from '../lib/comparison-record';
const errors = { 'access-denied':'Authorized comparison is not available.', 'invalid-input':'Corrupt, mismatched or invalid input. Choose the exact sample or check the application.', 'invalid-extraction':'Extraction evidence was invalid or belonged to another image.', 'provider-failed':'The offline processing-failure scenario returned no usable evidence.', timeout:'Comparison timed out. Retry explicitly; no result was accepted.', cancelled:'Comparison cancelled.', unconfigured:'Provider is not configured. No analysis performed.' };
export default function ProcessingState({ running, result }: { running: boolean; result: ComparisonRecord | null }) {
  if (running) return <p role="status" className="notice">Checking known fixture bytes and comparing declarations… No AI request.</p>;
  if (result?.processing === 'failed') return <div role="alert" className="notice error"><strong>Processing failed</strong><p>{errors[result.code]}</p><p>No field results or review outcome are available. Nothing saved.</p></div>;
  return null;
}
