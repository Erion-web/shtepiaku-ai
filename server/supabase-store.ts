// Hosted lead storage on Supabase Postgres (see supabase/migrations).
// Uses the service-role key, which must only ever live on the server. The tables
// have row-level security enabled with no policies, so the public anon key can
// neither read nor write leads.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { DUPLICATE_WINDOW_MS, TABLE, fromRow, sanitizeSearch, toRow, withVersionIdentity, type LeadRow, type LeadStore, type PricingStore, type PricingVersion } from './store';

const UNIQUE_VIOLATION = '23505';

export function openSupabaseStore(url: string, serviceRoleKey: string, client?: SupabaseClient): LeadStore {
  const sb =
    client ??
    createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application': 'shtepiaku-ai' } },
    });

  const findByKey = async (key: string) => {
    for (const t of Object.values(TABLE)) {
      const { data, error } = await sb.from(t).select('id').eq('idempotency_key', key).maybeSingle();
      if (error) throw error;
      if (data) return data.id as string;
    }
    return null;
  };

  type VersionRow = { version: number; created_at: string; status: PricingVersion['status']; note: string; author: string; config: PricingVersion['config'] };
  const toVersion = (r: VersionRow) =>
    withVersionIdentity({ version: Number(r.version), createdAt: new Date(r.created_at).toISOString(), status: r.status, note: r.note, author: r.author, config: r.config });

  const pricing: PricingStore = {
    async latest() {
      const { data, error } = await sb.from('pricing_versions').select('*').order('version', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data ? toVersion(data as VersionRow) : null;
    },
    async get(version) {
      const { data, error } = await sb.from('pricing_versions').select('*').eq('version', version).maybeSingle();
      if (error) throw error;
      return data ? toVersion(data as VersionRow) : null;
    },
    async list(limit = 50) {
      const { data, error } = await sb.from('pricing_versions').select('version, created_at, status, note, author').order('version', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data as Omit<VersionRow, 'config'>[]).map((r) => ({ version: Number(r.version), createdAt: new Date(r.created_at).toISOString(), status: r.status, note: r.note, author: r.author }));
    },
    async save(v) {
      const { data, error } = await sb
        .from('pricing_versions')
        .insert({ status: v.status, note: v.note, author: v.author, config: v.config })
        .select('*')
        .single();
      if (error) throw error;
      return toVersion(data as VersionRow);
    },
  };

  return {
    pricing,
    async insert(lead, now = new Date()) {
      const t = TABLE[lead.dataset];
      const existing = await findByKey(lead.idempotencyKey);
      if (existing) return { id: existing, duplicate: true };

      const since = new Date(now.getTime() - DUPLICATE_WINDOW_MS).toISOString();
      const dup = await sb.from(t).select('id').eq('fingerprint', lead.fingerprint).gte('created_at', since).limit(1);
      if (dup.error) throw dup.error;
      if (dup.data.length) return { id: dup.data[0].id as string, duplicate: true };

      const row = toRow(lead, randomUUID(), now.toISOString());
      const { error } = await sb.from(t).insert(row);
      if (error) {
        // Two concurrent retries of the same submission: the unique key wins, return the stored lead.
        if (error.code === UNIQUE_VIOLATION) {
          const id = await findByKey(lead.idempotencyKey);
          if (id) return { id, duplicate: true };
        }
        throw error;
      }
      return { id: row.id, duplicate: false };
    },

    async list(dataset, filter = {}) {
      let q = sb.from(TABLE[dataset]).select('*').order('created_at', { ascending: false }).limit(2000);
      if (filter.status) q = q.eq('status', filter.status);
      if (filter.requestType) q = q.eq('request_type', filter.requestType);
      if (filter.from) q = q.gte('created_at', filter.from);
      if (filter.to) q = q.lt('created_at', filter.to);
      const term = filter.q ? sanitizeSearch(filter.q) : '';
      if (term) q = q.or(`company_name.ilike.%${term}%,city.ilike.%${term}%,contact_search.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data as LeadRow[]).map((r) => fromRow(dataset, r));
    },

    async update(dataset, id, patch) {
      const change: Record<string, string> = {};
      if (patch.status) change.status = patch.status;
      if (patch.staffNotes !== undefined) change.staff_notes = patch.staffNotes;
      const t = TABLE[dataset];
      if (Object.keys(change).length) {
        change.updated_at = new Date().toISOString();
        const { error } = await sb.from(t).update(change).eq('id', id);
        if (error) throw error;
      }
      const { data, error } = await sb.from(t).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? fromRow(dataset, data as LeadRow) : null;
    },

    async close() {
      /* HTTP client: nothing to close */
    },
  };
}
