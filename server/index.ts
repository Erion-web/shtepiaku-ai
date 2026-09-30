import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app';
import { openLeadStore } from './db';
import { createGroqExplainer } from './ai';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 8787);
const pricingMode = process.env.PRICING_MODE === 'live' ? 'live' : 'demo';
const dataDir = process.env.DATA_DIR ?? './data';

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (!dev) throw new Error('SESSION_SECRET is required in production.');
  sessionSecret = randomBytes(32).toString('hex');
  console.warn('[dev] SESSION_SECRET not set — using a random secret; staff sessions end on restart.');
}
if (!process.env.STAFF_PASSWORD) console.warn('[setup] STAFF_PASSWORD not set — the staff dashboard is disabled.');

const apiKey = process.env.GROQ_API_KEY;
const explainer = apiKey ? createGroqExplainer(apiKey, process.env.GROQ_MODEL || 'openai/gpt-oss-120b') : null;
if (!explainer) console.warn('[setup] GROQ_API_KEY not set — plan explanations use the deterministic text.');

const store = openLeadStore(join(dataDir, 'leads.sqlite'));
const app = createApp({ store, pricingMode, staffPassword: process.env.STAFF_PASSWORD, sessionSecret, explainer, dev });

if (!dev && existsSync('./dist/index.html')) {
  const indexHtml = readFileSync('./dist/index.html', 'utf8');
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', (c) => c.html(indexHtml));
}

serve({ fetch: app.fetch, port }, () => {
  console.log(`[api] listening on http://localhost:${port} (pricing: ${pricingMode})`);
});
