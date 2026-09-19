import { runtimeAccess } from '../../../lib/access';

export async function POST(_request: Request): Promise<Response> {
  // Intentionally before body parsing/upload/decoding or provider selection.
  // Do not turn client fixture selection into an anonymous inference route.
  runtimeAccess();
  return Response.json({ processing: 'failed', code: 'access-denied' }, { status: 403 });
}
