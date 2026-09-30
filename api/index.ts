// Vercel serverless entry. vercel.json rewrites every /api/* request here; the
// original path is preserved, so the Hono routes match as they do locally.

import { handle } from 'hono/vercel';
import { bootstrap } from '../server/bootstrap';

const ready = bootstrap({ allowLocalDb: false, dev: false }).then((b) => b.app);

const handler = async (req: Request) => {
  try {
    return await handle(await ready)(req);
  } catch (err) {
    console.error('[vercel] startup failed:', (err as Error).message);
    return Response.json({ error: 'server_not_configured' }, { status: 503 });
  }
};

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
