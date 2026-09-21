import { z } from 'zod';
import type { Application } from './contracts';
import { prepareLiveMedia, type LiveMedia } from './live-media-client';
import type { AttemptToken, DispatchCommand } from './batch-state';

const preparationSchema = z.object({ imageSha256: z.string().regex(/^[a-f0-9]{64}$/), binding: z.string().regex(/^[a-f0-9]{64}\.[a-f0-9]{64}$/) }).strict();
type Fetch = typeof fetch;
// Header values must be ASCII even when the exact filename/pair ID is Unicode.
const headerIntent = (token: AttemptToken) => JSON.stringify(token).replace(/[^\x20-\x7e]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`);
export async function prepareLivePair(file: File, application: Application, code: string, transport: Fetch = fetch) {
  const media = await prepareLiveMedia(file, application, code, AbortSignal.timeout(35000), transport);
  return prepareMediaPair(media, code, transport);
}
async function prepareMediaPair(media: LiveMedia, code: string, transport: Fetch) {
  const response = await transport('/api/comparisons', { method: 'POST', headers: { ...media.headers, 'x-ttb-demo-code': code, 'x-ttb-batch-phase': 'prepare' }, body: media.body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(35000) });
  const payload = await response.json();
  if (!response.ok) throw Error(payload.code === 'invalid-input' ? 'invalid-input' : 'unconfigured');
  return preparationSchema.parse(payload.prepared);
}
/** One preparation + at most one execution fetch. No network retries or regenerated
 * intent IDs. A timeout/duplicate is not evidence that the paid attempt did not run.
 * File objects are retained by the workspace; only active slots upload them.
 */
export async function executeLivePair(command: DispatchCommand, file: File, code: string,
  acceptPreparation: (token: AttemptToken, imageSha256: string) => boolean, transport: Fetch = fetch,
  onSnapshot?: (comparisonId:string) => void): Promise<unknown> {
  try {
    if (file.name !== command.image.filename) throw Error('invalid-input');
    const media = await prepareLiveMedia(file, command.application, code, AbortSignal.timeout(35000), transport);
    const prepared = await prepareMediaPair(media, code, transport);
    if (!acceptPreparation(command.token, prepared.imageSha256)) return { processing: 'failed', code: 'cancelled' };
    const response = await transport('/api/comparisons', { method: 'POST', headers: {
      ...media.headers, 'x-ttb-demo-code': code, 'x-ttb-batch-phase': 'execute', 'x-ttb-batch-intent': headerIntent(command.token), 'x-ttb-batch-binding': prepared.binding,
    }, body: media.body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(35000) });
    const payload = await response.json();
    if(response.ok&&payload.result?.processing==='complete'&&z.uuid().safeParse(payload.comparisonId).success)onSnapshot?.(payload.comparisonId);
    return payload.result ?? { processing: 'failed', code: 'provider-failed' };
  } catch (error) {
    return { processing: 'failed', code: error instanceof Error && error.message === 'invalid-input' ? 'invalid-input' : 'provider-failed' };
  }
}
