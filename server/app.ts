// HTTP API. Created by a factory so tests can inject storage, AI and settings.

import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createHash } from 'node:crypto';
import { leadSubmissionSchema, explainRequestSchema, leadStatusSchema } from '../shared/schema';
import { buildProfile } from '../shared/profile';
import { estimate } from '../shared/pricing/engine';
import { resolvePricing, type PricingMode } from '../shared/pricing/registry';
import { DEMO_PRICING } from '../shared/pricing/demo';
import { servicesIn, planKey } from '../shared/plans';
import { isEligible } from '../shared/rules';
import type { Answers, PlanConfig } from '../shared/types';
import type { Dataset, LeadStore } from './store';
import type { Explainer } from './ai';
import { createRateLimiter, passwordMatches, signSession, verifySession } from './security';
import { toCsv } from './csv';

export interface AppOptions {
  store: LeadStore;
  pricingMode: PricingMode;
  staffPassword: string | undefined;
  sessionSecret: string;
  explainer: Explainer | null;
  dev: boolean;
  /** Reject submissions faster than this (ms since the form opened). */
  minFillMs?: number;
}

const SESSION_COOKIE = 'sh_staff';
const SESSION_TTL = 8 * 60 * 60 * 1000;

function clientKey(c: Context): string {
  // Netlify sets x-nf-client-connection-ip itself; locally there is no proxy and the socket address is used.
  const real = c.req.header('x-nf-client-connection-ip') ?? c.req.header('x-real-ip');
  if (real) return real;
  const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (fwd) return fwd;
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? 'local';
}

export function createApp(opts: AppOptions) {
  const app = new Hono();
  const pricing = resolvePricing(opts.pricingMode);
  const dataset: Dataset = opts.pricingMode === 'demo' ? 'demo' : 'live';
  const minFillMs = opts.minFillMs ?? 2500;
  const leadLimiter = createRateLimiter(8, 10 * 60 * 1000);
  const explainLimiter = createRateLimiter(40, 10 * 60 * 1000);
  const loginLimiter = createRateLimiter(6, 15 * 60 * 1000);

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });

  app.get('/api/config', (c) =>
    c.json({
      pricingMode: opts.pricingMode,
      pricingId: pricing?.id ?? null,
      pricingStatus: pricing?.status ?? null,
      estimatesEnabled: pricing !== null,
      aiEnabled: opts.explainer !== null,
      staffConfigured: Boolean(opts.staffPassword),
      dev: opts.dev,
    }),
  );

  // ── AI explanation ─────────────────────────────────────────────────────
  app.post('/api/explain', async (c) => {
    if (!opts.explainer) return c.json({ error: 'ai_unavailable' }, 503);
    if (!explainLimiter.take(clientKey(c))) return c.json({ error: 'rate_limited' }, 429);
    const parsed = explainRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const text = await opts.explainer.explain(parsed.data as never);
    if (!text) return c.json({ error: 'ai_unavailable' }, 503);
    return c.json({ text, source: 'ai' });
  });

  // ── Lead submission ────────────────────────────────────────────────────
  app.post('/api/leads', async (c) => {
    if (!leadLimiter.take(clientKey(c))) return c.json({ error: 'rate_limited' }, 429);
    const body = await c.req.json().catch(() => null);
    const parsed = leadSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      const honeypot = body && typeof body === 'object' && 'website' in body && (body as { website: unknown }).website;
      return c.json({ error: honeypot ? 'rejected' : 'invalid_request', issues: opts.dev && !honeypot ? parsed.error.issues : undefined }, 400);
    }
    const s = parsed.data;
    if (s.elapsedMs < minFillMs) return c.json({ error: 'rejected' }, 400);

    const answers = s.answers as Answers;
    const ws = buildProfile(answers, pricing ?? DEMO_PRICING);
    if (!ws) return c.json({ error: 'invalid_request' }, 400);
    const plan = s.plan as PlanConfig;
    const services = servicesIn(plan).filter((sv) => isEligible(sv, ws));

    // Prices are recalculated on the server; client-sent figures are never trusted.
    const est = pricing ? estimate(ws, plan, pricing) : null;
    const contact = s.contact;
    const fingerprint = createHash('sha256')
      .update([answers.company.name.toLowerCase(), contact.email.toLowerCase(), contact.phone.replace(/\D/g, ''), s.requestType, planKey(plan)].join('|'))
      .digest('hex');

    try {
      const result = await opts.store.insert({
        dataset,
        idempotencyKey: s.idempotencyKey,
        fingerprint,
        requestType: s.requestType,
        companyName: answers.company.name,
        city: answers.company.city,
        workspaceType: answers.company.workspaceType ?? 'other',
        contact,
        answers,
        plan,
        planTier: s.planTier,
        planCustomized: s.planCustomized,
        services,
        pricingId: pricing?.id ?? null,
        pricingStatus: pricing?.status ?? null,
        estimate: est,
        monthlyMin: est?.monthly?.min ?? null,
        monthlyMax: est?.monthly?.max ?? null,
        lang: s.lang,
        booth: s.booth,
      });
      return c.json({ id: result.id, duplicate: result.duplicate, dataset }, result.duplicate ? 200 : 201);
    } catch (err) {
      console.error('[leads] insert failed', err);
      return c.json({ error: 'storage_failed' }, 500);
    }
  });

  // ── Staff ──────────────────────────────────────────────────────────────
  const isStaff = (c: Context) => verifySession(opts.sessionSecret, getCookie(c, SESSION_COOKIE));

  app.post('/api/staff/login', async (c) => {
    if (!opts.staffPassword) return c.json({ error: 'staff_not_configured' }, 503);
    if (!loginLimiter.take(clientKey(c))) return c.json({ error: 'rate_limited' }, 429);
    const body = (await c.req.json().catch(() => ({}))) as { password?: unknown };
    if (typeof body.password !== 'string' || !passwordMatches(body.password, opts.staffPassword)) return c.json({ error: 'invalid_credentials' }, 401);
    setCookie(c, SESSION_COOKIE, signSession(opts.sessionSecret, SESSION_TTL), {
      httpOnly: true,
      sameSite: 'Strict',
      secure: !opts.dev,
      path: '/api/staff',
      maxAge: SESSION_TTL / 1000,
    });
    return c.json({ ok: true });
  });

  app.post('/api/staff/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/api/staff' });
    return c.json({ ok: true });
  });

  app.get('/api/staff/session', (c) => c.json({ authenticated: isStaff(c), configured: Boolean(opts.staffPassword) }));

  app.use('/api/staff/leads*', async (c, next) => {
    if (!isStaff(c)) return c.json({ error: 'unauthorized' }, 401);
    await next();
  });

  const readFilter = (c: Context) => {
    const ds = c.req.query('dataset') === 'live' ? 'live' : 'demo';
    const status = leadStatusSchema.safeParse(c.req.query('status'));
    const type = c.req.query('type');
    return {
      dataset: ds as Dataset,
      filter: {
        status: status.success ? status.data : undefined,
        requestType: type === 'offer' || type === 'visit' ? (type as 'offer' | 'visit') : undefined,
        q: c.req.query('q')?.slice(0, 100) || undefined,
        from: c.req.query('from') || undefined,
        to: c.req.query('to') || undefined,
      },
    };
  };

  app.get('/api/staff/leads', async (c) => {
    const { dataset: ds, filter } = readFilter(c);
    try {
      return c.json({ dataset: ds, leads: await opts.store.list(ds, filter) });
    } catch (err) {
      console.error('[leads] list failed', err);
      return c.json({ error: 'storage_failed' }, 500);
    }
  });

  app.get('/api/staff/leads.csv', async (c) => {
    const { dataset: ds, filter } = readFilter(c);
    const csv = toCsv(await opts.store.list(ds, filter));
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="shtepiaku-leads-${ds}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return c.body(csv);
  });

  app.patch('/api/staff/leads/:id', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { dataset?: unknown; status?: unknown; staffNotes?: unknown };
    const ds: Dataset = body.dataset === 'live' ? 'live' : 'demo';
    const status = body.status === undefined ? undefined : leadStatusSchema.safeParse(body.status);
    if (status && !status.success) return c.json({ error: 'invalid_status' }, 400);
    if (body.staffNotes !== undefined && (typeof body.staffNotes !== 'string' || body.staffNotes.length > 4000)) return c.json({ error: 'invalid_notes' }, 400);
    const updated = await opts.store.update(ds, c.req.param('id'), { status: status?.data, staffNotes: body.staffNotes as string | undefined });
    if (!updated) return c.json({ error: 'not_found' }, 404);
    return c.json({ lead: updated });
  });

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  return app;
}
