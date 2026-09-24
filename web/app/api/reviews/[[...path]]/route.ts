import { createAppRoute } from '../../../../lib/app-runtime';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
// Includes POST /api/reviews/<uuid>/evidence-link and local binary compatibility.
export const POST = createAppRoute('reviews');
export const GET = POST;
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
