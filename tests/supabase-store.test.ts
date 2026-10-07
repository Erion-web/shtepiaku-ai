import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { openSupabaseStore } from '../server/supabase-store';
import type { NewLead } from '../server/store';
import { toStored } from '../shared/pricing/stored';
import { DEMO_PRICING } from '../shared/pricing/demo';

/** Minimal in-memory stand-in for the PostgREST query builder used by the store. */
function fakeSupabase(opts: { failInsertOnce?: 'unique' } = {}) {
  const tables: Record<string, Record<string, unknown>[]> = { leads: [], demo_leads: [], pricing_versions: [] };
  let failNext = opts.failInsertOnce;
  const builder = (table: string) => {
    let filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Record<string, unknown> = {};
    let single = false;
    let lim = Infinity;
    let sort: { col: string; asc: boolean } | null = null;
    const q = {
      select: () => q,
      order: (col: string, o?: { ascending?: boolean }) => ((sort = { col, asc: o?.ascending ?? true }), q),
      limit: (n: number) => ((lim = n), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
      lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
      or: (expr: string) => {
        const term = /ilike\.%(.*?)%/.exec(expr)![1].toLowerCase();
        filters.push((r) => ['company_name', 'city', 'contact_search'].some((c) => String(r[c] ?? '').toLowerCase().includes(term)));
        return q;
      },
      maybeSingle: () => ((single = true), q),
      single: () => ((single = true), q),
      insert: (row: Record<string, unknown>) => ((op = 'insert'), (payload = row), q),
      update: (patch: Record<string, unknown>) => ((op = 'update'), (payload = patch), q),
      then: (resolve: (v: unknown) => void) => {
        const rows = tables[table];
        if (op === 'insert') {
          if (failNext === 'unique') {
            failNext = undefined;
            rows.push({ ...payload, id: 'winner-id' }); // a concurrent request stored the same key first
            return resolve({ error: { code: '23505', message: 'duplicate key' } });
          }
          if (table === 'pricing_versions') {
            const row = { ...payload, version: rows.length + 1, created_at: new Date().toISOString() };
            rows.push(row);
            return resolve({ data: single ? row : [row], error: null });
          }
          const c = payload.contact as Record<string, string>;
          rows.push({ ...payload, contact_search: `${c.fullName} ${c.email} ${c.phone}` });
          return resolve({ error: null });
        }
        const match = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'update') {
          match.forEach((r) => Object.assign(r, payload));
          return resolve({ error: null });
        }
        if (sort) {
          const { col, asc } = sort;
          match.sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1));
        }
        const data = match.slice(0, lim);
        return resolve({ data: single ? (data[0] ?? null) : data, error: null });
      },
    };
    filters = [];
    return q;
  };
  return { client: { from: builder } as unknown as SupabaseClient, tables };
}

const lead = (over: Partial<NewLead> = {}): NewLead => ({
  dataset: 'demo',
  idempotencyKey: randomUUID(),
  fingerprint: randomUUID(),
  requestType: 'offer',
  companyName: 'Dardania Tech',
  city: 'Prishtinë',
  workspaceType: 'office',
  contact: { fullName: 'Arta Krasniqi', role: '', email: 'arta@example.com', phone: '', preferredContact: 'email', note: '', marketingOptIn: false },
  answers: {},
  plan: {},
  planTier: 'recommended',
  planCustomized: false,
  services: ['cleaning'],
  pricingId: 'demo-2026.09',
  pricingStatus: 'demo',
  estimate: null,
  monthlyMin: 540,
  monthlyMax: 815,
  lang: 'sq',
  booth: false,
  ...over,
});

describe('Supabase lead store', () => {
  it('stores demo and live leads in separate tables', async () => {
    const { client, tables } = fakeSupabase();
    const store = openSupabaseStore('', '', client);
    await store.insert(lead());
    await store.insert(lead({ dataset: 'live' }));
    expect(tables.demo_leads).toHaveLength(1);
    expect(tables.leads).toHaveLength(1);
    const [d] = await store.list('demo');
    expect(d.companyName).toBe('Dardania Tech');
    expect(d.monthlyMin).toBe(540);
  });

  it('returns the same lead for a retried idempotency key', async () => {
    const { client, tables } = fakeSupabase();
    const store = openSupabaseStore('', '', client);
    const l = lead();
    const a = await store.insert(l);
    const b = await store.insert(l);
    expect(b).toEqual({ id: a.id, duplicate: true });
    expect(tables.demo_leads).toHaveLength(1);
  });

  it('treats an identical request inside the window as a duplicate', async () => {
    const { client } = fakeSupabase();
    const store = openSupabaseStore('', '', client);
    const a = await store.insert(lead({ fingerprint: 'same' }));
    const b = await store.insert(lead({ fingerprint: 'same' }));
    expect(b).toEqual({ id: a.id, duplicate: true });
  });

  it('resolves a concurrent insert race on the unique key without an error', async () => {
    const { client } = fakeSupabase({ failInsertOnce: 'unique' });
    const store = openSupabaseStore('', '', client);
    const l = lead();
    // The fake stores the winner's row under the same key when it reports 23505.
    const res = await store.insert(l);
    expect(res).toEqual({ id: 'winner-id', duplicate: true });
  });

  it('filters, searches contacts and updates status and notes', async () => {
    const { client } = fakeSupabase();
    const store = openSupabaseStore('', '', client);
    const { id } = await store.insert(lead());
    await store.insert(lead({ companyName: 'Other Co', contact: { ...lead().contact, fullName: 'Blerim', email: 'b@x.com' } }));
    expect(await store.list('demo', { q: 'arta@' })).toHaveLength(1);
    expect(await store.list('demo', { q: 'prishtin' })).toHaveLength(2);
    const updated = await store.update('demo', id, { status: 'contacted', staffNotes: 'Called' });
    expect(updated!.status).toBe('contacted');
    expect(updated!.staffNotes).toBe('Called');
    expect(await store.list('demo', { status: 'contacted' })).toHaveLength(1);
    expect(await store.update('demo', 'missing', { status: 'won' })).toBeNull();
  });

  it('strips filter syntax from search input', async () => {
    const { client } = fakeSupabase();
    const store = openSupabaseStore('', '', client);
    await store.insert(lead());
    await expect(store.list('demo', { q: 'x),id.neq.(0' })).resolves.toEqual([]);
  });

  it('saves pricing versions and returns the newest as active', async () => {
    const { client } = fakeSupabase();
    const store = openSupabaseStore('', '', client);
    expect(await store.pricing.latest()).toBeNull();
    const a = await store.pricing.save({ status: 'demo', note: 'one', author: 'CEO', config: toStored(DEMO_PRICING) });
    const b = await store.pricing.save({ status: 'approved', note: 'two', author: 'CEO', config: toStored(DEMO_PRICING) });
    expect([a.version, b.version]).toEqual([1, 2]);
    const latest = await store.pricing.latest();
    expect(latest!.version).toBe(2);
    expect(latest!.config.id).toBe('v2');
    expect(latest!.config.status).toBe('approved');
    expect((await store.pricing.list()).map((v) => v.version)).toEqual([2, 1]);
    expect((await store.pricing.get(1))!.note).toBe('one');
  });
});
