// Local lead storage on Node's built-in SQLite. Used for development and tests,
// and whenever Supabase is not configured.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DUPLICATE_WINDOW_MS, TABLE, fromRow, sanitizeSearch, toRow, type LeadRow, type LeadStore } from './store';

export type { Dataset, LeadRecord, LeadStore, NewLead, LeadFilter } from './store';

const COLUMNS = `
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  request_type TEXT NOT NULL,
  company_name TEXT NOT NULL,
  city TEXT NOT NULL,
  workspace_type TEXT NOT NULL,
  contact TEXT NOT NULL,
  answers TEXT NOT NULL,
  plan TEXT NOT NULL,
  plan_tier TEXT NOT NULL,
  plan_customized INTEGER NOT NULL,
  services TEXT NOT NULL,
  pricing_id TEXT,
  pricing_status TEXT,
  estimate TEXT,
  monthly_min REAL,
  monthly_max REAL,
  lang TEXT NOT NULL,
  booth INTEGER NOT NULL,
  staff_notes TEXT NOT NULL DEFAULT ''
`;

const JSON_COLS = ['contact', 'answers', 'plan', 'services', 'estimate'] as const;
type SqlRow = Record<string, string | number | null>;

function decode(r: SqlRow): LeadRow {
  const out: Record<string, unknown> = { ...r };
  for (const c of JSON_COLS) out[c] = r[c] === null ? null : JSON.parse(r[c] as string);
  out.plan_customized = r.plan_customized === 1;
  out.booth = r.booth === 1;
  return out as unknown as LeadRow;
}

export function openLeadStore(file: string): LeadStore {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  for (const t of Object.values(TABLE)) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${t} (${COLUMNS});`);
    db.exec(`CREATE INDEX IF NOT EXISTS ${t}_created ON ${t}(created_at);`);
    db.exec(`CREATE INDEX IF NOT EXISTS ${t}_fp ON ${t}(fingerprint, created_at);`);
  }

  return {
    async insert(lead, now = new Date()) {
      const t = TABLE[lead.dataset];
      // Idempotent retry: the same submission key always maps to the same lead.
      for (const other of Object.values(TABLE)) {
        const existing = db.prepare(`SELECT id FROM ${other} WHERE idempotency_key = ?`).get(lead.idempotencyKey) as SqlRow | undefined;
        if (existing) return { id: existing.id as string, duplicate: true };
      }
      const since = new Date(now.getTime() - DUPLICATE_WINDOW_MS).toISOString();
      const dup = db.prepare(`SELECT id FROM ${t} WHERE fingerprint = ? AND created_at >= ?`).get(lead.fingerprint, since) as SqlRow | undefined;
      if (dup) return { id: dup.id as string, duplicate: true };

      const row = toRow(lead, randomUUID(), now.toISOString());
      const cols = Object.keys(row) as (keyof LeadRow)[];
      const values = cols.map((c) => {
        const v = row[c];
        if ((JSON_COLS as readonly string[]).includes(c)) return v === null ? null : JSON.stringify(v);
        if (typeof v === 'boolean') return v ? 1 : 0;
        return v as string | number | null;
      });
      db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...values);
      return { id: row.id, duplicate: false };
    },

    async list(dataset, filter = {}) {
      const where: string[] = [];
      const params: string[] = [];
      if (filter.status) (where.push('status = ?'), params.push(filter.status));
      if (filter.requestType) (where.push('request_type = ?'), params.push(filter.requestType));
      if (filter.from) (where.push('created_at >= ?'), params.push(filter.from));
      if (filter.to) (where.push('created_at < ?'), params.push(filter.to));
      const q = filter.q ? sanitizeSearch(filter.q) : '';
      if (q) {
        where.push('(company_name LIKE ? OR contact LIKE ? OR city LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like);
      }
      const sql = `SELECT * FROM ${TABLE[dataset]} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 2000`;
      return (db.prepare(sql).all(...params) as SqlRow[]).map((r) => fromRow(dataset, decode(r)));
    },

    async update(dataset, id, patch) {
      const t = TABLE[dataset];
      const sets: string[] = [];
      const params: string[] = [];
      if (patch.status) (sets.push('status = ?'), params.push(patch.status));
      if (patch.staffNotes !== undefined) (sets.push('staff_notes = ?'), params.push(patch.staffNotes));
      if (sets.length) {
        sets.push('updated_at = ?');
        params.push(new Date().toISOString());
        db.prepare(`UPDATE ${t} SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
      }
      const row = db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(id) as SqlRow | undefined;
      return row ? fromRow(dataset, decode(row)) : null;
    },

    async close() {
      db.close();
    },
  };
}
