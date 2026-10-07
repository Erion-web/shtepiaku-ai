// Domain types shared by the client, the server and the tests.

export type Lang = 'sq' | 'en';
export type Bilingual = Record<Lang, string>;

export type WorkspaceType = 'office' | 'coworking' | 'retail' | 'warehouse' | 'other';
export type FacilityId = 'work' | 'meeting' | 'kitchen' | 'toilets' | 'reception' | 'storage' | 'outdoor';
export type ServiceId = 'cleaning' | 'maintenance' | 'drains' | 'hygiene' | 'scenting' | 'ddd';
export type AreaRangeId = 'lt100' | '100_250' | '250_500' | '500_1000' | '1000_2000' | '2000_4000';
export type ScentZone = 'reception' | 'toilets' | 'meeting' | 'work' | 'kitchen';
export type DddIssue = 'crawling' | 'flying' | 'rodents' | 'disinfection';
export type Arrangement = 'internal' | 'one_provider' | 'several_providers' | 'as_needed' | 'none';
export type WhoCalled = 'manager' | 'director' | 'anyone' | 'undecided';

/** Weekly visit counts, a custom monthly visit count, or a single deep clean. */
export type CleaningFrequency = 1 | 2 | 3 | 4 | 5 | 'custom' | 'one_time';
/** 'mixed' = some visits during office hours and some outside (both options chosen). */
export type CleaningTiming = 'during' | 'outside' | 'mixed';
/** Who supplies cleaning materials (detergents, tools) — not the toilet/kitchen consumables. */
export type CleaningMaterials = 'provider' | 'client';
export type HygieneMode = 'recurring' | 'occasional';
export type MaintenanceMode = 'preventive' | 'on_demand';
export type DrainsMode = 'existing' | 'on_demand';
export type DddMode = 'prevention' | 'existing';

export interface Answers {
  company: {
    name: string;
    city: string;
    workspaceType: WorkspaceType | null;
  };
  space: {
    areaKnown: boolean;
    area: number | null;
    areaRange: AreaRangeId | null;
    /** false = the visitor said they do not know. */
    peopleKnown: boolean;
    people: number | null;
  };
  facilities: {
    selected: FacilityId[];
    kitchens: number;
    toilets: number;
  };
  priorities: {
    mode: 'choose' | 'recommend';
    selected: ServiceId[];
    /** In "recommend" mode the visitor must confirm the proposed list. */
    recommendationReviewed: boolean;
  };
  details: {
    cleaning: { frequency: CleaningFrequency | null; customVisitsPerMonth: number | null; timing: CleaningTiming | null; materials: CleaningMaterials | null };
    hygiene: { mode: HygieneMode | null };
    scenting: { zones: ScentZone[]; coverageKnown: boolean; coverageM2: number | null };
    maintenance: { mode: MaintenanceMode | null };
    drains: { mode: DrainsMode | null };
    ddd: { mode: DddMode | null; issues: DddIssue[] };
  };
  current: {
    arrangement: Arrangement | null;
    whoGetsCalled: WhoCalled | null;
  };
  /** Monthly budget given in easy mode (€, excl. VAT), shown to staff. */
  budget?: number | null;
}

/** Normalised view of the workspace used by the rules and the pricing engine. */
export interface WorkspaceProfile {
  type: WorkspaceType;
  city: string;
  area: { min: number; max: number; exact: boolean };
  /** known=false means the visitor did not know; min/max are then estimated from area. */
  people: { known: boolean; min: number; max: number };
  facilities: FacilityId[];
  kitchens: number;
  toilets: number;
}

/** The priced scope. A missing key means the service is not part of the plan. */
export interface PlanConfig {
  /** materials defaults to 'provider' (Shtepiaku supplies them, included in the price). */
  cleaning?: { frequency: CleaningFrequency; customVisitsPerMonth?: number; timing: CleaningTiming; materials?: CleaningMaterials };
  initialDeepClean?: boolean;
  hygiene?: { mode: HygieneMode };
  scenting?: { zones: ScentZone[]; coverageM2: number | null };
  maintenance?: { mode: MaintenanceMode };
  drains?: { mode: DrainsMode };
  ddd?: { mode: DddMode; issues: DddIssue[] };
}

export type PlanTier = 'basic' | 'recommended' | 'full';
export type RequestType = 'offer' | 'visit';
export type LeadStatus = 'new' | 'contacted' | 'visit_planned' | 'offer_sent' | 'won' | 'lost';
export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'visit_planned', 'offer_sent', 'won', 'lost'];
