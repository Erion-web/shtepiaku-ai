import type { LeadRecord } from './store';

const HEADERS = [
  'created_at',
  'status',
  'request_type',
  'company',
  'city',
  'workspace_type',
  'contact_name',
  'role',
  'email',
  'phone',
  'preferred_contact',
  'marketing_opt_in',
  'services',
  'plan_tier',
  'plan_customized',
  'monthly_min_eur',
  'monthly_max_eur',
  'pricing_version',
  'pricing_status',
  'visitor_note',
  'staff_notes',
  'id',
];

function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // Prevent spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(leads: LeadRecord[]): string {
  const rows = leads.map((l) =>
    [
      l.createdAt,
      l.status,
      l.requestType,
      l.companyName,
      l.city,
      l.workspaceType,
      l.contact.fullName,
      l.contact.role,
      l.contact.email,
      l.contact.phone,
      l.contact.preferredContact,
      l.contact.marketingOptIn ? 'yes' : 'no',
      l.services.join(' '),
      l.planTier,
      l.planCustomized ? 'yes' : 'no',
      l.monthlyMin,
      l.monthlyMax,
      l.pricingId,
      l.pricingStatus,
      l.contact.note,
      l.staffNotes,
      l.id,
    ]
      .map(cell)
      .join(','),
  );
  // BOM so spreadsheet apps read ë and ç correctly.
  return '﻿' + [HEADERS.join(','), ...rows].join('\r\n') + '\r\n';
}
