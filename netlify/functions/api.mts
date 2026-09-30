// Netlify function serving the whole API. netlify.toml rewrites /api/* here.
// Netlify may hand us either the public path (/api/leads) or the function path
// (/.netlify/functions/api/leads); both are normalised to /api/... for Hono.

import { bootstrap } from '../../server/bootstrap';

const ready = bootstrap({ allowLocalDb: false, dev: false }).then((b) => b.app);
const FUNCTION_PREFIX = '/.netlify/functions/api';

export function toApiRequest(req: Request): Request {
  const url = new URL(req.url);
  if (url.pathname.startsWith(FUNCTION_PREFIX)) {
    url.pathname = '/api' + url.pathname.slice(FUNCTION_PREFIX.length);
    return new Request(url, req);
  }
  return req;
}

export default async (req: Request): Promise<Response> => {
  let app;
  try {
    app = await ready;
  } catch (err) {
    console.error('[netlify] startup failed:', (err as Error).message);
    return Response.json({ error: 'server_not_configured' }, { status: 503 });
  }
  return app.fetch(toApiRequest(req));
};
