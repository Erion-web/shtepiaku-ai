import type { LeadSubmission } from '../../shared/schema';
import type { Arrangement, Lang, LeadStatus, PlanConfig, WorkspaceProfile } from '../../shared/types';
import type { PricingMode } from '../../shared/pricing/registry';
import { toStored, type StoredPricing, type PricingIssue } from '../../shared/pricing/stored';
import { DEMO_PRICING } from '../../shared/pricing/demo';

export interface AppConfig {
  pricingMode: PricingMode;
  pricingId: string | null;
  pricingStatus: 'demo' | 'approved' | null;
  estimatesEnabled: boolean;
  /** The prices the public site uses, or null when none may be shown. */
  pricing: StoredPricing | null;
  aiEnabled: boolean;
  staffConfigured: boolean;
  dev: boolean;
  /** false when /api/config could not be reached. */
  online: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public issues?: PricingIssue[],
  ) {
    super(code);
  }
}

export interface PricingVersionInfo {
  version: number;
  createdAt: string;
  status: 'demo' | 'approved';
  note: string;
  author: string;
}

export interface StaffPricing {
  active: StoredPricing;
  /** null while the bundled demo prices are still in use. */
  version: number | null;
  history: PricingVersionInfo[];
  pricingMode: PricingMode;
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 15000);
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      signal: ctrl.signal,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'network');
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; issues?: PricingIssue[] };
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'server', body.issues);
  return body;
}

export const api = {
  config: async (): Promise<AppConfig> => {
    try {
      return { ...(await request<Omit<AppConfig, 'online'>>('/api/config', { timeoutMs: 5000 })), online: true };
    } catch {
      return {
        pricingMode: 'demo',
        pricingId: null,
        pricingStatus: 'demo',
        estimatesEnabled: true,
        // Offline: estimates keep working on the bundled demo prices (always labelled as demo).
        pricing: toStored(DEMO_PRICING),
        aiEnabled: false,
        staffConfigured: false,
        dev: import.meta.env.DEV,
        online: false,
      };
    }
  },

  explain: (body: { lang: Lang; workspace: WorkspaceProfile; plan: PlanConfig; arrangement: Arrangement | null }, signal?: AbortSignal) =>
    request<{ text: string }>('/api/explain', { method: 'POST', body: JSON.stringify(body), signal, timeoutMs: 10000 }),

  submitLead: (body: LeadSubmission) => request<{ id: string; duplicate: boolean; dataset: string }>('/api/leads', { method: 'POST', body: JSON.stringify(body) }),

  staff: {
    session: () => request<{ authenticated: boolean; configured: boolean }>('/api/staff/session'),
    login: (password: string) => request<{ ok: true }>('/api/staff/login', { method: 'POST', body: JSON.stringify({ password }) }),
    logout: () => request<{ ok: true }>('/api/staff/logout', { method: 'POST' }),
    leads: (qs: string) => request<{ dataset: string; leads: StaffLead[] }>(`/api/staff/leads?${qs}`),
    pricing: () => request<StaffPricing>('/api/staff/pricing'),
    pricingVersion: (version: number) => request<{ version: PricingVersionInfo & { config: StoredPricing } }>(`/api/staff/pricing/${version}`),
    savePricing: (body: { status: 'demo' | 'approved'; note: string; author: string; config?: StoredPricing; restoreOf?: number }) =>
      request<{ version: number; active: StoredPricing }>('/api/staff/pricing', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, dataset: string, patch: { status?: LeadStatus; staffNotes?: string }) =>
      request<{ lead: StaffLead }>(`/api/staff/leads/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ dataset, ...patch }) }),
  },
};

export interface StaffLead {
  id: string;
  dataset: 'live' | 'demo';
  createdAt: string;
  updatedAt: string;
  status: LeadStatus;
  requestType: 'offer' | 'visit';
  companyName: string;
  city: string;
  workspaceType: string;
  contact: { fullName: string; role: string; email: string; phone: string; preferredContact: string; note: string; marketingOptIn: boolean };
  answers: import('../../shared/types').Answers;
  plan: PlanConfig;
  planTier: string;
  planCustomized: boolean;
  services: string[];
  pricingId: string | null;
  pricingStatus: string | null;
  estimate: import('../../shared/pricing/engine').Estimate | null;
  monthlyMin: number | null;
  monthlyMax: number | null;
  lang: string;
  booth: boolean;
  staffNotes: string;
}
