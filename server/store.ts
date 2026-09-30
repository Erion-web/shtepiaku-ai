// Lead storage contract, shared by the SQLite (local) and Supabase (hosted) stores.
// Real and demo leads always live in separate tables.

import type { LeadStatus, RequestType } from '../shared/types';

export type Dataset = 'live' | 'demo';
export const TABLE: Record<Dataset, string> = { live: 'leads', demo: 'demo_leads' };

/** Window in which an identical request (same company, contact and plan) counts as a duplicate. */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export interface LeadRecord {
  id: string;
  dataset: Dataset;
  createdAt: string;
  updatedAt: string;
  status: LeadStatus;
  requestType: RequestType;
  companyName: string;
  city: string;
  workspaceType: string;
  contact: {
    fullName: string;
    role: string;
    email: string;
    phone: string;
    preferredContact: string;
    note: string;
    marketingOptIn: boolean;
  };
  answers: unknown;
  plan: unknown;
  planTier: string;
  planCustomized: boolean;
  services: string[];
  pricingId: string | null;
  pricingStatus: string | null;
  estimate: unknown;
  monthlyMin: number | null;
  monthlyMax: number | null;
  lang: string;
  booth: boolean;
  staffNotes: string;
}

export type NewLead = Omit<LeadRecord, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'staffNotes'> & {
  idempotencyKey: string;
  fingerprint: string;
};

export interface LeadFilter {
  status?: LeadStatus;
  requestType?: RequestType;
  q?: string;
  from?: string;
  to?: string;
}

export interface LeadStore {
  insert(lead: NewLead, now?: Date): Promise<{ id: string; duplicate: boolean }>;
  list(dataset: Dataset, filter?: LeadFilter): Promise<LeadRecord[]>;
  update(dataset: Dataset, id: string, patch: { status?: LeadStatus; staffNotes?: string }): Promise<LeadRecord | null>;
  close(): Promise<void>;
}

/** Database row shape (snake_case), identical in SQLite and Postgres apart from JSON/boolean typing. */
export interface LeadRow {
  id: string;
  idempotency_key: string;
  fingerprint: string;
  created_at: string;
  updated_at: string;
  status: string;
  request_type: string;
  company_name: string;
  city: string;
  workspace_type: string;
  contact: LeadRecord['contact'];
  answers: unknown;
  plan: unknown;
  plan_tier: string;
  plan_customized: boolean;
  services: string[];
  pricing_id: string | null;
  pricing_status: string | null;
  estimate: unknown;
  monthly_min: number | null;
  monthly_max: number | null;
  lang: string;
  booth: boolean;
  staff_notes: string;
}

export function toRow(lead: NewLead, id: string, ts: string): LeadRow {
  return {
    id,
    idempotency_key: lead.idempotencyKey,
    fingerprint: lead.fingerprint,
    created_at: ts,
    updated_at: ts,
    status: 'new',
    request_type: lead.requestType,
    company_name: lead.companyName,
    city: lead.city,
    workspace_type: lead.workspaceType,
    contact: lead.contact,
    answers: lead.answers,
    plan: lead.plan,
    plan_tier: lead.planTier,
    plan_customized: lead.planCustomized,
    services: lead.services,
    pricing_id: lead.pricingId,
    pricing_status: lead.pricingStatus,
    estimate: lead.estimate ?? null,
    monthly_min: lead.monthlyMin,
    monthly_max: lead.monthlyMax,
    lang: lead.lang,
    booth: lead.booth,
    staff_notes: '',
  };
}

export function fromRow(dataset: Dataset, r: LeadRow): LeadRecord {
  return {
    id: r.id,
    dataset,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    status: r.status as LeadStatus,
    requestType: r.request_type as RequestType,
    companyName: r.company_name,
    city: r.city,
    workspaceType: r.workspace_type,
    contact: r.contact,
    answers: r.answers,
    plan: r.plan,
    planTier: r.plan_tier,
    planCustomized: Boolean(r.plan_customized),
    services: r.services,
    pricingId: r.pricing_id,
    pricingStatus: r.pricing_status,
    estimate: r.estimate ?? null,
    monthlyMin: r.monthly_min === null ? null : Number(r.monthly_min),
    monthlyMax: r.monthly_max === null ? null : Number(r.monthly_max),
    lang: r.lang,
    booth: Boolean(r.booth),
    staffNotes: r.staff_notes,
  };
}

/** Strips LIKE/ILIKE wildcards and PostgREST filter syntax from free-text search. */
export const sanitizeSearch = (q: string) => q.replace(/[%_,()*\\]/g, ' ').trim().slice(0, 100);
