import { demoAccess } from './demo-security';
import { validateRuntimeEnv } from './runtime-env';

type Route = 'comparisons' | 'reviews' | 'uploads';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const error = (status: number, code: string) => Response.json({ code }, { status, headers });

/** Request-time composition. Importing a route during Next build neither needs
 * private env nor opens a store. No SQLite module is evaluated on hosted paths;
 * Next may still statically trace the local dynamic-import compatibility branch.
 * Never cache an env-derived handler across config changes or retry a request. */
export function createAppRoute(route: Route) {
  return async (request: Request): Promise<Response> => {
    const env = { ...process.env,
      // Direct property reads deliberately bind the same build-time public values
      // as the browser bundle; a runtime-only origin change must fail closed.
      NEXT_PUBLIC_TTB_MEDIA_TRANSPORT: process.env.NEXT_PUBLIC_TTB_MEDIA_TRANSPORT,
      NEXT_PUBLIC_TTB_SUPABASE_ORIGIN: process.env.NEXT_PUBLIC_TTB_SUPABASE_ORIGIN,
    };
    if (!demoAccess(request, env)) return error(403, 'access-denied');
    if (request.method !== 'POST') return error(405, 'method-not-allowed');
    try {
      const mode = validateRuntimeEnv(env);
      if (mode === 'supabase') {
        const { createHostedStores, createHostedUploadQuota } = await import('./persistence/hosted-demo-rpc');
        const { createSupabaseObjects } = await import('./persistence/supabase-storage');
        if (route === 'uploads') {
          const { createUploadHandler } = await import('./upload-route');
          return await createUploadHandler({ env, quota: createHostedUploadQuota(env) })(request);
        }
        const stores = createHostedStores({ env, objects: createSupabaseObjects(env) });
        if (route === 'reviews') {
          const { createReviewHandler } = await import('./review-route');
          return await createReviewHandler(env, stores)(request);
        }
        const { createDemoHandler } = await import('./demo-route');
        const { createHostedInputReader } = await import('./hosted-media');
        return await createDemoHandler({ env, stores, readInput: createHostedInputReader(env) })(request);
      }
      if (route === 'uploads') return error(404, 'not-found');
      if (route === 'reviews') {
        const { createReviewHandler } = await import('./review-route');
        return await createReviewHandler(env)(request);
      }
      const { createDemoHandler } = await import('./demo-route');
      return await createDemoHandler({ env })(request);
    } catch {
      // Neither secrets, provider response bodies nor internal paths escape.
      return error(503, 'configuration-or-service-unavailable');
    }
  };
}
