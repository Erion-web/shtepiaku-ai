// Request schemas. The server validates every request with these; the client
// reuses the contact schema for inline form validation.

import { z } from 'zod';

const serviceId = z.enum(['cleaning', 'maintenance', 'drains', 'hygiene', 'scenting', 'ddd']);
const facilityId = z.enum(['work', 'meeting', 'kitchen', 'toilets', 'reception', 'storage', 'outdoor']);
const scentZone = z.enum(['reception', 'toilets', 'meeting', 'work', 'kitchen']);
const dddIssue = z.enum(['crawling', 'flying', 'rodents', 'disinfection']);
const workspaceType = z.enum(['office', 'coworking', 'retail', 'warehouse', 'other']);
const areaRange = z.enum(['lt100', '100_250', '250_500', '500_1000', '1000_2000', '2000_4000']);
const cleaningFrequency = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal('custom'), z.literal('one_time')]);
const text = (max: number) => z.string().trim().max(max);

export const answersSchema = z.object({
  company: z.object({
    name: text(120).min(1),
    city: text(80),
    workspaceType: workspaceType,
  }),
  space: z.object({
    areaKnown: z.boolean(),
    area: z.number().positive().max(100_000).nullable(),
    areaRange: areaRange.nullable(),
    peopleKnown: z.boolean(),
    people: z.number().int().min(0).max(10_000).nullable(),
  }),
  facilities: z.object({
    selected: z.array(facilityId).max(7),
    kitchens: z.number().int().min(0).max(50),
    toilets: z.number().int().min(0).max(200),
  }),
  priorities: z.object({
    mode: z.enum(['choose', 'recommend']),
    selected: z.array(serviceId).max(6),
    recommendationReviewed: z.boolean(),
  }),
  details: z.object({
    cleaning: z.object({
      frequency: cleaningFrequency.nullable(),
      customVisitsPerMonth: z.number().int().min(1).max(31).nullable(),
      timing: z.enum(['during', 'outside', 'mixed']).nullable(),
      materials: z.enum(['provider', 'client']).nullable().default(null),
    }),
    hygiene: z.object({ mode: z.enum(['recurring', 'occasional']).nullable() }),
    scenting: z.object({ zones: z.array(scentZone).max(5), coverageKnown: z.boolean(), coverageM2: z.number().positive().max(100_000).nullable() }),
    maintenance: z.object({ mode: z.enum(['preventive', 'on_demand']).nullable() }),
    drains: z.object({ mode: z.enum(['existing', 'on_demand']).nullable() }),
    ddd: z.object({ mode: z.enum(['prevention', 'existing']).nullable(), issues: z.array(dddIssue).max(4) }),
  }),
  current: z.object({
    arrangement: z.enum(['internal', 'one_provider', 'several_providers', 'as_needed', 'none']).nullable(),
    whoGetsCalled: z.enum(['manager', 'director', 'anyone', 'undecided']).nullable(),
  }),
  budget: z.number().min(0).max(1_000_000).nullable().optional(),
});

export const planSchema = z.object({
  cleaning: z
    .object({ frequency: cleaningFrequency, customVisitsPerMonth: z.number().int().min(1).max(31).optional(), timing: z.enum(['during', 'outside', 'mixed']), materials: z.enum(['provider', 'client']).optional() })
    .optional(),
  initialDeepClean: z.boolean().optional(),
  hygiene: z.object({ mode: z.enum(['recurring', 'occasional']) }).optional(),
  scenting: z.object({ zones: z.array(scentZone).min(1).max(5), coverageM2: z.number().positive().max(100_000).nullable() }).optional(),
  maintenance: z.object({ mode: z.enum(['preventive', 'on_demand']) }).optional(),
  drains: z.object({ mode: z.enum(['existing', 'on_demand']) }).optional(),
  ddd: z.object({ mode: z.enum(['prevention', 'existing']), issues: z.array(dddIssue).max(4) }).optional(),
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()\-]{6,20}$/;

export const contactSchema = z
  .object({
    fullName: text(120).min(2, 'name'),
    role: text(120).default(''),
    email: text(200).default(''),
    phone: text(40).default(''),
    preferredContact: z.enum(['email', 'phone', 'whatsapp']),
    note: text(1000).default(''),
    marketingOptIn: z.boolean().default(false),
  })
  .superRefine((c, ctx) => {
    if (!c.email && !c.phone) ctx.addIssue({ code: 'custom', path: ['email'], message: 'email_or_phone' });
    if (c.email && !EMAIL.test(c.email)) ctx.addIssue({ code: 'custom', path: ['email'], message: 'email_invalid' });
    if (c.phone && !PHONE.test(c.phone)) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'phone_invalid' });
    if (c.preferredContact === 'email' && !c.email) ctx.addIssue({ code: 'custom', path: ['preferredContact'], message: 'method_needs_email' });
    if (c.preferredContact !== 'email' && !c.phone) ctx.addIssue({ code: 'custom', path: ['preferredContact'], message: 'method_needs_phone' });
  });

export type ContactInput = z.input<typeof contactSchema>;

export const leadSubmissionSchema = z.object({
  idempotencyKey: z.uuid(),
  requestType: z.enum(['offer', 'visit']),
  lang: z.enum(['sq', 'en']),
  answers: answersSchema,
  planTier: z.enum(['basic', 'recommended', 'full']),
  planCustomized: z.boolean(),
  plan: planSchema,
  contact: contactSchema,
  /** Honeypot: real visitors never see or fill this field. */
  website: z.string().max(0).optional().default(''),
  /** Milliseconds between opening the form and submitting it. */
  elapsedMs: z.number().int().min(0),
  booth: z.boolean().default(false),
});

export type LeadSubmission = z.input<typeof leadSubmissionSchema>;

/** Only what the explanation needs: no company name, no contact details. */
export const explainRequestSchema = z.object({
  lang: z.enum(['sq', 'en']),
  workspace: z.object({
    type: workspaceType,
    city: text(0),
    area: z.object({ min: z.number().positive().max(100_000), max: z.number().positive().max(100_000), exact: z.boolean() }),
    people: z.object({ known: z.boolean(), min: z.number().int().min(0).max(10_000), max: z.number().int().min(0).max(10_000) }),
    facilities: z.array(facilityId).max(7),
    kitchens: z.number().int().min(0).max(50),
    toilets: z.number().int().min(0).max(200),
  }),
  plan: planSchema,
  arrangement: z.enum(['internal', 'one_provider', 'several_providers', 'as_needed', 'none']).nullable(),
});

export const leadStatusSchema = z.enum(['new', 'contacted', 'visit_planned', 'offer_sent', 'won', 'lost']);
