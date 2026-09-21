import { randomUUID } from 'node:crypto';
import { preparePair, type ImageInput } from './intake';
import { MAX_IMAGE_BYTES, parseApplication } from './contracts';
import { runtimeAccess } from './access';
import type { ExtractionProvider } from './extraction/provider';
import { finalizeComparison, type ComparisonRecord, type CompleteComparison } from './comparison-record';

export type ComparisonInput = { file: ImageInput; binding: { filename: string; application: unknown } };
/** Node-only direct/offline composition. authorize is a trusted dependency, NEVER
 * supplied from a client request. No real provider is imported or configured here. */
export function createComparisonService(options: {
  provider: ExtractionProvider; authorize?: () => boolean | Promise<boolean>; timeoutMs?: number;
  /** Trusted synchronous server snapshot sink; never browser input. Failure must
   * not discard a completed paid response. Called only before the deadline. */
  completed?: (record:CompleteComparison,pair:Awaited<ReturnType<typeof preparePair>>) => void;
  /** Trusted server seam, after sanitation and before any reservation. Not an
   * input parameter clients may supply. Throw to reject a preparation binding. */
  preparedAttempt?: (pair: Awaited<ReturnType<typeof preparePair>>) => { reservationId: string; attemptId: string };
}) {
  return async (input: ComparisonInput, signal?: AbortSignal): Promise<ComparisonRecord> => {
    const fail = (code: Extract<ComparisonRecord, { processing: 'failed' }>['code']): ComparisonRecord => ({ processing: 'failed', code });
    if (signal?.aborted) return fail('cancelled');
    let authorization: boolean | Promise<boolean>;
    try { authorization = (options.authorize ?? runtimeAccess)(); } catch { return fail('access-denied'); }
    if (authorization === false) return fail('access-denied');
    // Bound before copy/decode, snapshot before any asynchronous trust boundary.
    let snapshot: ComparisonInput;
    try {
      if (!Buffer.isBuffer(input.file.bytes) || input.file.bytes.buffer instanceof SharedArrayBuffer || input.file.bytes.length > MAX_IMAGE_BYTES) return fail('invalid-input');
      snapshot = { file: { ...input.file, bytes: Buffer.from(input.file.bytes) }, binding: { filename: input.binding.filename, application: parseApplication(input.binding.application) } };
    } catch { return fail('invalid-input'); }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => {};
    const deadline = new Promise<ComparisonRecord>(resolve => {
      timer = setTimeout(() => { stopped = true; resolve(fail('timeout')); }, Math.min(Math.max(options.timeoutMs ?? 20000, 1), 20000));
      onAbort = () => { stopped = true; resolve(fail('cancelled')); };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    const work = async (): Promise<ComparisonRecord> => {
      try { if (await authorization !== true) return fail('access-denied'); } catch { return fail('access-denied'); }
      if (stopped) return fail('cancelled');
      let pair;
      try { pair = await preparePair(snapshot.file, snapshot.binding); } catch { return fail('invalid-input'); }
      if (stopped) return fail('cancelled');
      let identity;
      try { identity = options.preparedAttempt?.(pair) ?? { reservationId: randomUUID(), attemptId: randomUUID() }; }
      catch { return fail('invalid-input'); }
      try {
        const result = await options.provider.extract({ image: pair.image.bytes, mimeType: pair.image.mime, ...identity });
        if (result.processing === 'failed') return fail(result.code === 'unconfigured' ? 'unconfigured' : 'provider-failed');
        const record=finalizeComparison(pair.application, result, pair.image.sanitizedSha256);
        if(!stopped && record.processing==='complete') {try{options.completed?.(record,pair);}catch{/* Comparison remains available, UNSAVED. */}}
        return record;
      } catch { return fail('provider-failed'); }
    };
    try { return await Promise.race([work(), deadline]); }
    finally { stopped = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  };
}
