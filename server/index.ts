import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { bootstrap } from './bootstrap';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 8787);
const { app, storage, pricingMode } = await bootstrap({ allowLocalDb: true, dev });

if (!dev && existsSync('./dist/index.html')) {
  const indexHtml = readFileSync('./dist/index.html', 'utf8');
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', (c) => c.html(indexHtml));
}

serve({ fetch: app.fetch, port }, () => {
  console.log(`[api] listening on http://localhost:${port} (pricing: ${pricingMode}, storage: ${storage})`);
});
