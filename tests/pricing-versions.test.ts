import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';
import { openLeadStore } from '../server/db';
import { DEMO_PRICING } from '../shared/pricing/demo';
import { fromStored, toStored, validateStoredPricing, type StoredPricing } from '../shared/pricing/stored';
import { completeAnswers } from './fixtures';

function setup(pricingMode: 'demo' | 'live' = 'demo') {
  const store = openLeadStore(':memory:');
  const app = createApp({ store, pricingMode, staffPassword: 'pw', sessionSecret: 's'.repeat(32), explainer: null, dev: true });
  const req = (path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) =>
    app.request(path, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(init.cookie ? { Cookie: init.cookie } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const login = async () => (await req('/api/staff/login', { method: 'POST', body: { password: 'pw' } })).headers.get('set-cookie')!.split(';')[0];
  return { app, store, req, login };
}

const lead = () => ({
  idempotencyKey: randomUUID(),
  requestType: 'offer',
  lang: 'sq',
  answers: completeAnswers(),
  planTier: 'recommended',
  planCustomized: false,
  plan: { cleaning: { frequency: 3, timing: 'during' } },
  contact: { fullName: 'Arta Krasniqi', role: '', email: `a${Math.random()}@example.com`, phone: '', preferredContact: 'email', note: '', marketingOptIn: false },
  website: '',
  elapsedMs: 10_000,
  booth: false,
});

const edited = (mut: (c: StoredPricing) => void) => {
  const c = toStored(DEMO_PRICING);
  mut(c);
  return c;
};

describe('stored pricing format', () => {
  it('round-trips the open-ended area band through JSON', () => {
    const json = JSON.parse(JSON.stringify(toStored(DEMO_PRICING)));
    expect(json.cleaning.tiers.at(-1).upTo).toBeNull();
    const back = fromStored(json);
    expect(back.cleaning.tiers.at(-1)!.upTo).toBe(Infinity);
    expect(back).toEqual(DEMO_PRICING);
  });

  it('accepts the demo prices and rejects impossible values', () => {
    expect(validateStoredPricing(toStored(DEMO_PRICING)).ok).toBe(true);
    const lowAboveHigh = validateStoredPricing(edited((c) => (c.cleaning.kitchenPerVisit = [9, 3])));
    expect(lowAboveHigh.ok).toBe(false);
    if (!lowAboveHigh.ok) expect(lowAboveHigh.issues[0]).toEqual({ path: 'cleaning.kitchenPerVisit', message: 'low_above_high' });
    expect(validateStoredPricing(edited((c) => (c.cleaning.minimumVisit = -5))).ok).toBe(false);
    expect(validateStoredPricing(edited((c) => (c.vat.rate = 18))).ok).toBe(false); // 1800% — percent entered as a whole number
    expect(validateStoredPricing(edited((c) => (c.cleaning.tiers[1].upTo = 50))).ok).toBe(false); // bands must ascend
    expect(validateStoredPricing(edited((c) => (c.cleaning.tiers.at(-1)!.upTo = 5000))).ok).toBe(false); // last band stays open
  });
});

describe('pricing editor API', () => {
  it('requires a staff session for reading and saving', async () => {
    const { req } = setup();
    expect((await req('/api/staff/pricing')).status).toBe(401);
    expect((await req('/api/staff/pricing', { method: 'POST', body: { status: 'demo', config: toStored(DEMO_PRICING) } })).status).toBe(401);
  });

  it('starts from the bundled demo prices with no history', async () => {
    const { req, login } = setup();
    const body = await (await req('/api/staff/pricing', { cookie: await login() })).json();
    expect(body.version).toBeNull();
    expect(body.history).toEqual([]);
    expect(body.active.cleaning.minimumVisit).toBe(DEMO_PRICING.cleaning.minimumVisit);
  });

  it('saves a new version that the public site and new leads use immediately', async () => {
    const { req, login, store } = setup();
    const cookie = await login();
    const before = await (await req('/api/config')).json();

    const config = edited((c) => (c.cleaning.minimumVisit = 999));
    const res = await req('/api/staff/pricing', { method: 'POST', cookie, body: { status: 'demo', note: 'Test', author: 'CEO', config } });
    expect(res.status).toBe(201);
    expect((await res.json()).version).toBe(1);

    const after = await (await req('/api/config')).json();
    expect(after.pricingId).toBe('v1');
    expect(after.pricing.cleaning.minimumVisit).toBe(999);
    expect(after.pricingStatus).toBe('demo');
    expect(before.pricingId).toBe(DEMO_PRICING.id);

    await req('/api/leads', { method: 'POST', body: lead() });
    const [l] = await store.list('demo');
    expect(l.pricingId).toBe('v1');
    // 13 visits at the €999 minimum
    expect(l.monthlyMin).toBeGreaterThanOrEqual(999 * 13 - 5);
  });

  it('rejects invalid prices with field-level issues and saves nothing', async () => {
    const { req, login, store } = setup();
    const cookie = await login();
    const res = await req('/api/staff/pricing', { method: 'POST', cookie, body: { status: 'demo', config: edited((c) => (c.scenting.refillMonthly = [20, 10])) } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_pricing');
    expect(body.issues[0].path).toBe('scenting.refillMonthly');
    expect(await store.pricing.latest()).toBeNull();
  });

  it('approved prices drop the demo label and send new leads to the real table', async () => {
    const { req, login, store } = setup();
    const cookie = await login();
    await req('/api/staff/pricing', { method: 'POST', cookie, body: { status: 'approved', config: toStored(DEMO_PRICING) } });
    const cfg = await (await req('/api/config')).json();
    expect(cfg.pricingStatus).toBe('approved');
    expect(cfg.pricing.status).toBe('approved');
    await req('/api/leads', { method: 'POST', body: lead() });
    expect(await store.list('live')).toHaveLength(1);
    expect(await store.list('demo')).toHaveLength(0);
  });

  it('live mode hides demo prices until an approved version is saved', async () => {
    const { req, login } = setup('live');
    expect((await (await req('/api/config')).json()).estimatesEnabled).toBe(false);
    const cookie = await login();
    await req('/api/staff/pricing', { method: 'POST', cookie, body: { status: 'demo', config: toStored(DEMO_PRICING) } });
    expect((await (await req('/api/config')).json()).estimatesEnabled).toBe(false);
    await req('/api/staff/pricing', { method: 'POST', cookie, body: { status: 'approved', config: toStored(DEMO_PRICING) } });
    expect((await (await req('/api/config')).json()).estimatesEnabled).toBe(true);
  });

  it('restoring an old version saves a copy as the newest version and keeps history', async () => {
    const { req, login } = setup();
    const cookie = await login();
    await req('/api/staff/pricing', { method: 'POST', cookie, body: { status: 'demo', note: 'first', config: edited((c) => (c.cleaning.minimumVisit = 30)) } });
    await req('/api/staff/pricing', { method: 'POST', cookie, body: { status: 'demo', note: 'second', config: edited((c) => (c.cleaning.minimumVisit = 40)) } });
    const r = await req('/api/staff/pricing', { method: 'POST', cookie, body: { status: 'demo', restoreOf: 1 } });
    expect((await r.json()).version).toBe(3);
    const body = await (await req('/api/staff/pricing', { cookie })).json();
    expect(body.version).toBe(3);
    expect(body.active.cleaning.minimumVisit).toBe(30);
    expect(body.history.map((h: { version: number }) => h.version)).toEqual([3, 2, 1]);
    expect(body.history[2].note).toBe('first');
  });
});
