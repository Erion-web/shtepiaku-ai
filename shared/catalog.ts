// Approved service descriptions. These are the only service facts the AI may use.

import type { Bilingual, ServiceId } from './types';

export interface ServiceInfo {
  id: ServiceId;
  name: Bilingual;
  /** One plain-language line for selection cards. */
  short: Bilingual;
  /** Factual description passed to the AI explanation. */
  approved: Bilingual;
}

export const SERVICES: Record<ServiceId, ServiceInfo> = {
  cleaning: {
    id: 'cleaning',
    name: { sq: 'Pastrim', en: 'Cleaning' },
    short: {
      sq: 'Pastrim i rregullt i zyrës ose një pastrim i thellë.',
      en: 'Regular office cleaning or a one-time deep clean.',
    },
    approved: {
      sq: 'Pastrim i rregullt i hapësirave të punës, sallave, kuzhinës dhe tualeteve me frekuencën e zgjedhur, ose pastrim i thellë një herë. Mjetet dhe kimikatet e pastrimit i siguron Shtepiaku dhe përfshihen në çmim, ose klienti mund t’i sigurojë vetë.',
      en: 'Regular cleaning of work areas, meeting rooms, kitchen and toilets at the chosen frequency, or a one-time deep clean. Cleaning tools and chemicals are supplied by Shtepiaku and included in the price, or the client can supply their own.',
    },
  },
  maintenance: {
    id: 'maintenance',
    name: { sq: 'Mirëmbajtje teknike', en: 'Technical maintenance' },
    short: {
      sq: 'Riparime të vogla elektrike, hidraulike dhe të inventarit.',
      en: 'Small electrical, plumbing and fixture repairs.',
    },
    approved: {
      sq: 'Ndërhyrje teknike për instalime elektrike e hidraulike dhe inventar, me vizita parandaluese mujore me orë pune të përfshira, ose thirrje sipas nevojës. Pjesët e ndërrimit llogariten veçmas.',
      en: 'Technical work on electrical and plumbing installations and fixtures, either as monthly preventive visits with included labour hours or on-demand call-outs. Replacement parts are charged separately.',
    },
  },
  drains: {
    id: 'drains',
    name: { sq: 'Debllokim', en: 'Drain unblocking' },
    short: {
      sq: 'Zgjidhje për lavamanë, tualete dhe kanale të bllokuara.',
      en: 'Blocked sinks, toilets and drains, sorted.',
    },
    approved: {
      sq: 'Debllokim mekanik i lavamanëve, tualeteve dhe kanaleve të qasshme. Problemet ekzistuese vlerësohen në vend para se të jepet çmimi.',
      en: 'Mechanical unblocking of accessible sinks, toilets and drains. Existing problems are assessed on site before a price is given.',
    },
  },
  hygiene: {
    id: 'hygiene',
    name: { sq: 'Furnizime higjienike', en: 'Hygiene supplies' },
    short: {
      sq: 'Letër, sapun dhe detergjentë përmes ProHygiene.',
      en: 'Paper, soap and detergents through ProHygiene.',
    },
    approved: {
      sq: 'Furnizim me produkte letre, sapun, detergjentë dhe materiale të ngjashme përmes ProHygiene, si furnizim i rregullt mujor ose porosi sipas nevojës.',
      en: 'Paper products, soap, detergents and related supplies through ProHygiene, as a regular monthly supply or occasional orders.',
    },
  },
  scenting: {
    id: 'scenting',
    name: { sq: 'Aromatizim', en: 'Scenting' },
    short: {
      sq: 'Aromë e qëndrueshme për recepsionin, tualetet dhe sallat.',
      en: 'Consistent scent for reception, toilets and meeting rooms.',
    },
    approved: {
      sq: 'Aromatizim profesional me pajisje, rimbushje mujore dhe instalim, për zonat e zgjedhura të hapësirës.',
      en: 'Professional scenting with devices, monthly refills and installation for the selected zones.',
    },
  },
  ddd: {
    id: 'ddd',
    name: { sq: 'ECO PEST DDD', en: 'ECO PEST DDD' },
    short: {
      sq: 'Dezinfektim, deratizim dhe dezinsektim nga ekipi ynë.',
      en: 'Disinfection, rodent and insect control by our own team.',
    },
    approved: {
      sq: 'Dezinfektim, deratizim dhe dezinsektim përmes ECO PEST DDD, nga ekipi i brendshëm i Shtepiaku: trajtime parandaluese periodike ose ndërhyrje për një problem ekzistues pas vlerësimit.',
      en: "Disinfection, rodent control and insect control through ECO PEST DDD, delivered by Shtepiaku's in-house team: periodic preventive treatments or intervention for an existing problem after assessment.",
    },
  },
};

export const SERVICE_ORDER: ServiceId[] = ['cleaning', 'maintenance', 'drains', 'hygiene', 'scenting', 'ddd'];
