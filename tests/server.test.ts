import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';
import { openLeadStore, type LeadStore } from '../server/db';
import { createGroqExplainer, validateExplanation, type Explainer } from '../server/ai';
import { completeAnswers, office } from './fixtures';

const SECRET = 'test-secret';

function submission(over: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    requestType: 'offer',
    lang: 'sq',
    answers: completeAnswers(),
    planTier: 'recommended',
    planCustomized: false,
    plan: { cleaning: { frequency: 3, timing: 'during' }, hygiene: { mode: 'recurring' } },
    contact: { fullName: 'Arta Krasniqi', role: '', email: 'arta@example.com', phone: '', preferredContact: 'email', note: '', marketingOptIn: false },
    website: '',
    elapsedMs: 10_000,
    booth: false,
    ...over,
  };
}

function setup(opts: { explainer?: Explainer | null; pricingMode?: 'demo' | 'live'; staffPassword?: string } = {}) {
  const store = openLeadStore(':memory:');
  const app = createApp({
    store,
    pricingMode: opts.pricingMode ?? 'demo',
    staffPassword: 'staffPassword' in opts ? opts.staffPassword : 'correct horse',
    sessionSecret: SECRET,
    explainer: opts.explainer ?? null,
    dev: true,
  });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { app, store, post };
}

async function login(post: ReturnType<typeof setup>['post']) {
  const res = await post('/api/staff/login', { password: 'correct horse' });
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')!.split(';')[0];
}

describe('lead submission', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => (s = setup()));

  it('persists a valid request with a server-calculated estimate in the demo table', async () => {
    const res = await s.post('/api/leads', submission());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.dataset).toBe('demo');
    const [lead] = (s.store as LeadStore).list('demo');
    expect(lead.companyName).toBe('Dardania Tech');
    expect(lead.pricingId).toBe('demo-2026.09');
    expect(lead.monthlyMin).toBeGreaterThan(0);
    expect(s.store.list('live')).toHaveLength(0);
  });

  it('ignores any price sent by the client', async () => {
    await s.post('/api/leads', { ...submission(), estimate: { monthly: { min: 1, max: 2 } } });
    expect(s.store.list('demo')[0].monthlyMin).toBeGreaterThan(2);
  });

  it('retrying with the same idempotency key does not create a duplicate', async () => {
    const sub = submission();
    const a = await (await s.post('/api/leads', sub)).json();
    const second = await s.post('/api/leads', sub);
    expect(second.status).toBe(200);
    const b = await second.json();
    expect(b.id).toBe(a.id);
    expect(b.duplicate).toBe(true);
    expect(s.store.list('demo')).toHaveLength(1);
  });

  it('treats an identical request with a new key as a duplicate within the window', async () => {
    await s.post('/api/leads', submission());
    const res = await s.post('/api/leads', submission());
    expect((await res.json()).duplicate).toBe(true);
    expect(s.store.list('demo')).toHaveLength(1);
  });

  it('requires an email or phone', async () => {
    const res = await s.post('/api/leads', submission({ contact: { fullName: 'Arta', preferredContact: 'email', email: '', phone: '' } }));
    expect(res.status).toBe(400);
    expect(s.store.list('demo')).toHaveLength(0);
  });

  it('rejects honeypot and too-fast submissions', async () => {
    expect((await s.post('/api/leads', submission({ website: 'http://spam' }))).status).toBe(400);
    expect((await s.post('/api/leads', submission({ elapsedMs: 300 }))).status).toBe(400);
    expect(s.store.list('demo')).toHaveLength(0);
  });

  it('reports a storage failure instead of success', async () => {
    const broken = setup();
    broken.store.insert = () => {
      throw new Error('disk full');
    };
    const res = await broken.post('/api/leads', submission());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('storage_failed');
  });

  it('stores live leads without prices when live tariffs are not approved', async () => {
    const live = setup({ pricingMode: 'live' });
    const cfg = await (await live.app.request('/api/config')).json();
    expect(cfg.estimatesEnabled).toBe(false);
    await live.post('/api/leads', submission());
    const [lead] = live.store.list('live');
    expect(lead.monthlyMin).toBeNull();
    expect(lead.pricingId).toBeNull();
  });
});

describe('staff access', () => {
  it('refuses lead reads, CSV export and updates without a session', async () => {
    const { app, post } = setup();
    await post('/api/leads', submission());
    expect((await app.request('/api/staff/leads?dataset=demo')).status).toBe(401);
    expect((await app.request('/api/staff/leads.csv?dataset=demo')).status).toBe(401);
    expect((await app.request('/api/staff/leads/x', { method: 'PATCH', body: '{}' })).status).toBe(401);
  });

  it('rejects wrong passwords and forged cookies', async () => {
    const { app, post } = setup();
    expect((await post('/api/staff/login', { password: 'nope' })).status).toBe(401);
    const forged = await app.request('/api/staff/leads', { headers: { Cookie: 'sh_staff=eyJyb2xlIjoic3RhZmYiLCJleHAiOjk5OTk5OTk5OTk5OTl9.bad' } });
    expect(forged.status).toBe(401);
  });

  it('disables staff login when no password is configured', async () => {
    const { post } = setup({ staffPassword: undefined });
    expect((await post('/api/staff/login', { password: '' })).status).toBe(503);
  });

  it('lets staff list, update status and export CSV', async () => {
    const { app, post } = setup();
    await post('/api/leads', submission());
    const cookie = await login(post);
    const list = await (await app.request('/api/staff/leads?dataset=demo', { headers: { Cookie: cookie } })).json();
    expect(list.leads).toHaveLength(1);
    const id = list.leads[0].id;
    const upd = await app.request(`/api/staff/leads/${id}`, { method: 'PATCH', headers: { Cookie: cookie }, body: JSON.stringify({ dataset: 'demo', status: 'contacted', staffNotes: 'Called' }) });
    expect((await upd.json()).lead.status).toBe('contacted');
    const filtered = await (await app.request('/api/staff/leads?dataset=demo&status=won', { headers: { Cookie: cookie } })).json();
    expect(filtered.leads).toHaveLength(0);
    const csv = await (await app.request('/api/staff/leads.csv?dataset=demo', { headers: { Cookie: cookie } })).text();
    expect(csv).toContain('Dardania Tech');
    expect(csv).toContain('contacted');
  });

  it('escapes spreadsheet formulas in CSV', async () => {
    const { app, post } = setup();
    await post('/api/leads', submission({ answers: completeAnswers((a) => (a.company.name = '=HYPERLINK("x")')) }));
    const cookie = await login(post);
    const csv = await (await app.request('/api/staff/leads.csv?dataset=demo', { headers: { Cookie: cookie } })).text();
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('AI explanation', () => {
  const facts = { lang: 'sq' as const, workspace: office({ city: '' }), plan: { cleaning: { frequency: 3 as const, timing: 'during' as const } }, arrangement: null };
  const req = { lang: 'sq', workspace: office({ city: '' }), plan: facts.plan, arrangement: null };

  it('returns 503 when AI is not configured so the client falls back', async () => {
    const { post } = setup();
    expect((await post('/api/explain', req)).status).toBe(503);
  });

  it('returns 503 when the model fails', async () => {
    const { post } = setup({ explainer: { explain: async () => null } });
    expect((await post('/api/explain', req)).status).toBe(503);
  });

  it('returns validated AI text', async () => {
    const text = 'Me 18 persona në zyrë çdo ditë, pastrimi 3 herë në javë e mban hapësirën të rregullt dhe të gatshme për punë.';
    const { post } = setup({ explainer: { explain: async () => text } });
    const res = await post('/api/explain', req);
    expect(await res.json()).toEqual({ text, source: 'ai' });
  });

  it('does not accept contact data in the request', async () => {
    const { post } = setup({ explainer: { explain: async () => 'x' } });
    expect((await post('/api/explain', { ...req, workspace: { ...req.workspace, city: 'Prishtinë' } })).status).toBe(400);
  });

  it('rejects model output with prices, guarantees or invented numbers', () => {
    const ok = 'Me 18 persona në zyrë çdo ditë, pastrimi 3 herë në javë e mban hapësirën të rregullt dhe të gatshme.';
    expect(validateExplanation(ok, facts)).toBe(ok);
    expect(validateExplanation(ok + ' Kostoja është €500.', facts)).toBeNull();
    expect(validateExplanation(ok + ' Kursoni 20% në muaj.', facts)).toBeNull();
    expect(validateExplanation(ok + ' Ne garantojmë reagim.', facts)).toBeNull();
    expect(validateExplanation(ok + ' Kemi 45 klientë.', facts)).toBeNull();
    expect(validateExplanation(ok + ' Kjo ju kursen kohë.', facts)).toBeNull();
    expect(validateExplanation(ok.replace('Me', 'We guarantee that with'), facts)).toBeNull();
  });
});

describe('Groq explainer', () => {
  const facts = { lang: 'sq' as const, workspace: office({ city: '' }), plan: { cleaning: { frequency: 3 as const, timing: 'during' as const } }, arrangement: null };
  const good = 'Me 18 persona në zyrë çdo ditë, pastrimi 3 herë në javë e mban hapësirën të rregullt dhe të gatshme.';
  const reply = (content: string, status = 200) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers: { 'Content-Type': 'application/json' } });

  it('calls the Groq chat endpoint with a bearer key and no prices or contact data', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const ex = createGroqExplainer('gsk_test', 'llama-3.3-70b-versatile', 1000, (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return reply(good);
    }) as typeof fetch);
    expect(await ex.explain(facts)).toBe(good);
    expect(seen!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer gsk_test');
    const body = String(seen!.init.body);
    expect(JSON.parse(body).model).toBe('llama-3.3-70b-versatile');
    expect(body).not.toMatch(/€|Dardania|@/);
  });

  it('returns null on HTTP errors, network errors and invalid output', async () => {
    const make = (impl: () => Promise<Response>) => createGroqExplainer('k', 'm', 1000, impl as unknown as typeof fetch);
    expect(await make(async () => reply('', 429)).explain(facts)).toBeNull();
    expect(await make(async () => Promise.reject(new Error('offline'))).explain(facts)).toBeNull();
    expect(await make(async () => reply(good + ' Kostoja €400.')).explain(facts)).toBeNull();
  });
});
