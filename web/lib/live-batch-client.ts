import { z } from 'zod';
import { checkFileDeclaration, parseApplication, type Application } from './contracts';
import type { AttemptToken, DispatchCommand } from './batch-state';

const preparationSchema = z.object({ imageSha256: z.string().regex(/^[a-f0-9]{64}$/), binding: z.string().regex(/^[a-f0-9]{64}\.[a-f0-9]{64}$/) }).strict();
type Fetch = typeof fetch;
// Header values must be ASCII even when the exact filename/pair ID is Unicode.
const headerIntent = (token: AttemptToken) => JSON.stringify(token).replace(/[^\x20-\x7e]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`);
export async function prepareLivePair(file: File, application: Application, code: string, transport: Fetch = fetch) {
  if (checkFileDeclaration(file) || !code) throw Error('invalid-input');
  const body = new FormData(); body.set('image', file); body.set('application', JSON.stringify(parseApplication(application)));
  const response = await transport('/api/comparisons', { method: 'POST', headers: { 'x-ttb-demo-code': code, 'x-ttb-batch-phase': 'prepare' }, body, cache: 'no-store', signal: AbortSignal.timeout(35000) });
  const payload = await response.json();
  if (!response.ok) throw Error(payload.code === 'invalid-input' ? 'invalid-input' : 'unconfigured');
  return preparationSchema.parse(payload.prepared);
}
/** One preparation + at most one execution fetch. No network retries or regenerated
 * intent IDs. A timeout/duplicate is not evidence that the paid attempt did not run.
 * File objects are retained by the workspace; only active slots upload them.
 */
export async function executeLivePair(command: DispatchCommand, file: File, code: string,
  acceptPreparation: (token: AttemptToken, imageSha256: string) => boolean, transport: Fetch = fetch): Promise<unknown> {
  try {
    if (file.name !== command.image.filename) throw Error('invalid-input');
    const prepared = await prepareLivePair(file, command.application, code, transport);
    if (!acceptPreparation(command.token, prepared.imageSha256)) return { processing: 'failed', code: 'cancelled' };
    const body = new FormData(); body.set('image', file); body.set('application', JSON.stringify(command.application));
    const response = await transport('/api/comparisons', { method: 'POST', headers: {
      'x-ttb-demo-code': code, 'x-ttb-batch-phase': 'execute', 'x-ttb-batch-intent': headerIntent(command.token), 'x-ttb-batch-binding': prepared.binding,
    }, body, cache: 'no-store', signal: AbortSignal.timeout(35000) });
    const payload = await response.json();
    return payload.result ?? { processing: 'failed', code: 'provider-failed' };
  } catch (error) {
    return { processing: 'failed', code: error instanceof Error && error.message === 'invalid-input' ? 'invalid-input' : 'provider-failed' };
  }
}
