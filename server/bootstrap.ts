// Builds the API from environment variables. Shared by the local Node server and
// the Vercel function so both run the same configuration rules.

import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createApp } from './app';
import { createGroqExplainer } from './ai';
import { openSupabaseStore } from './supabase-store';
import type { LeadStore } from './store';

export async function bootstrap(opts: { allowLocalDb: boolean; dev: boolean }) {
  const env = process.env;
  const pricingMode = env.PRICING_MODE === 'live' ? 'live' : 'demo';

  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) {
    if (!opts.dev) throw new Error('SESSION_SECRET is required in production.');
    sessionSecret = randomBytes(32).toString('hex');
    console.warn('[dev] SESSION_SECRET not set — using a random secret; staff sessions end on restart.');
  }
  if (!env.STAFF_PASSWORD) console.warn('[setup] STAFF_PASSWORD not set — the staff dashboard is disabled.');

  const explainer = env.GROQ_API_KEY ? createGroqExplainer(env.GROQ_API_KEY, env.GROQ_MODEL || 'openai/gpt-oss-120b') : null;
  if (!explainer) console.warn('[setup] GROQ_API_KEY not set — plan explanations use the deterministic text.');

  let store: LeadStore;
  let storage: 'supabase' | 'sqlite';
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    store = openSupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    storage = 'supabase';
  } else if (opts.allowLocalDb) {
    // Imported lazily so hosted builds never load node:sqlite.
    const { openLeadStore } = await import('./db');
    store = openLeadStore(join(env.DATA_DIR ?? './data', 'leads.sqlite'));
    storage = 'sqlite';
  } else {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for hosted deployments.');
  }

  const app = createApp({ store, pricingMode, staffPassword: env.STAFF_PASSWORD, sessionSecret, explainer, dev: opts.dev });
  return { app, storage, pricingMode };
}
