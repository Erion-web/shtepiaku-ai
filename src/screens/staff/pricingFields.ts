// Plain-language description of every editable price. The editor is generated
// from this list, so adding a field here is all it takes to make it editable.

import type { StoredPricing } from '../../../shared/pricing/stored';
import type { Bilingual } from '../../../shared/types';

export type Path = (string | number)[];

export type FieldKind =
  /** [low, high] pair */
  | 'range'
  /** single number */
  | 'number'
  /** whole number */
  | 'int'
  /** stored as a fraction (0.18), shown as a percentage (18) */
  | 'percent'
  /** stored as a multiplier (1.10), shown as % of the base price (110) */
  | 'factor'
  | 'bool';

export interface Field {
  key: string;
  path: Path;
  kind: FieldKind;
  label: Bilingual;
  unit?: Bilingual;
  hint?: Bilingual;
}

export interface Section {
  id: string;
  title: Bilingual;
  intro: Bilingual;
  fields: Field[];
}

const B = (sq: string, en: string): Bilingual => ({ sq, en });
const EUR = B('€', '€');
const EUR_M2 = B('€ / m²', '€ / m²');
const key = (p: Path) => p.join('.');
const f = (path: Path, kind: FieldKind, label: Bilingual, unit?: Bilingual, hint?: Bilingual): Field => ({ key: key(path), path, kind, label, unit, hint });

export const CITIES = ['Prishtinë', 'Prizren', 'Pejë', 'Gjakovë', 'Ferizaj', 'Gjilan', 'Mitrovicë'];

const HYGIENE_ITEMS: Record<string, Bilingual> = {
  toilet_paper: B('Letër higjienike', 'Toilet paper'),
  hand_towels: B('Peshqirë letre për duar', 'Paper hand towels'),
  hand_soap: B('Sapun i lëngshëm', 'Liquid hand soap'),
  dish_detergent: B('Detergjent enësh', 'Dish detergent'),
  kitchen_rolls: B('Rula letre kuzhine', 'Kitchen paper rolls'),
  toilet_air_freshener: B('Rimbushje freskuesi për tualet', 'Toilet air freshener refills'),
};
const UNITS: Record<string, Bilingual> = {
  rolls: B('rula', 'rolls'),
  packs: B('pako', 'packs'),
  litres: B('litra', 'litres'),
  refills: B('rimbushje', 'refills'),
};
const UNIT_ONE: Record<string, Bilingual> = {
  rolls: B('rul', 'roll'),
  packs: B('pako', 'pack'),
  litres: B('litër', 'litre'),
  refills: B('rimbushje', 'refill'),
};
const BASIS: Record<string, Bilingual> = {
  person_day: B('për person në ditë pune', 'per person per workday'),
  kitchen_day: B('për kuzhinë në ditë pune', 'per kitchen per workday'),
  toilet_month: B('për tualet në muaj', 'per toilet per month'),
};

function bandLabel(tiers: { upTo: number | null }[], i: number): Bilingual {
  const from = i === 0 ? 0 : (tiers[i - 1].upTo ?? 0);
  const to = tiers[i].upTo;
  if (i === 0 && to !== null) return B(`${to} m² të parët`, `First ${to} m²`);
  if (to === null) return B(`Mbi ${from} m²`, `Above ${from} m²`);
  return B(`${from}–${to} m²`, `${from}–${to} m²`);
}

export function buildSections(cfg: StoredPricing): Section[] {
  const tierFields = (base: Path, tiers: { upTo: number | null }[], unit: Bilingual) =>
    tiers.map((_, i) => f([...base, i, 'ratePerM2'], 'range', bandLabel(tiers, i), unit));

  return [
    {
      id: 'general',
      title: B('Të përgjithshme', 'General'),
      intro: B('TVSH-ja, zbritja për paketë dhe rregullimet sipas qytetit vlejnë për të gjitha shërbimet.', 'VAT, the bundle discount and city adjustments apply to every service.'),
      fields: [
        f(['vat', 'rate'], 'percent', B('Norma e TVSH-së', 'VAT rate'), B('%', '%')),
        f(['vat', 'pricesIncludeVat'], 'bool', B('Çmimet më poshtë e përfshijnë TVSH-në', 'Prices below include VAT')),
        f(['bundle', 'discount'], 'percent', B('Zbritje për paketë', 'Bundle discount'), B('%', '%'), B('0 e çaktivizon zbritjen.', '0 turns the discount off.')),
        f(['bundle', 'minRecurringServices'], 'int', B('Shërbime periodike të nevojshme për zbritjen', 'Recurring services needed for the discount'), B('shërbime', 'services')),
        ...CITIES.map((city) =>
          f(['locationLabourAdjustment', city], 'percent', B(`Rregullim i punës: ${city}`, `Labour adjustment: ${city}`), B('%', '%'), B('Shtesë mbi punën; 0 = pa ndryshim.', 'Extra on labour; 0 = no change.')),
        ),
      ],
    },
    {
      id: 'cleaning',
      title: B('Pastrimi i rregullt', 'Regular cleaning'),
      intro: B(
        'Çmimi për vizitë, sipas brezave të sipërfaqes: 100 m² të parët me tarifën e parë, pjesa tjetër me tarifat në vijim.',
        'Price per visit, by area band: the first 100 m² at the first rate, the rest at the following rates.',
      ),
      fields: [
        ...tierFields(['cleaning', 'tiers'], cfg.cleaning.tiers, EUR_M2),
        f(['cleaning', 'kitchenPerVisit'], 'range', B('Çdo kuzhinë, për vizitë', 'Each kitchen, per visit'), EUR),
        f(['cleaning', 'toiletPerVisit'], 'range', B('Çdo tualet, për vizitë', 'Each toilet, per visit'), EUR),
        f(['cleaning', 'minimumVisit'], 'number', B('Çmimi minimal për vizitë', 'Minimum charge per visit'), EUR),
        f(['cleaning', 'outsideHoursSurcharge'], 'percent', B('Shtesë jashtë orarit', 'Outside-hours surcharge'), B('%', '%')),
        f(['cleaning', 'frequencyMultiplier', 'lt1'], 'factor', B('Më rrallë se 1 herë në javë', 'Less than once a week'), B('% e çmimit', '% of price')),
        f(['cleaning', 'frequencyMultiplier', '1'], 'factor', B('1 herë në javë', 'Once a week'), B('% e çmimit', '% of price')),
        f(['cleaning', 'frequencyMultiplier', '2'], 'factor', B('2 herë në javë', '2 times a week'), B('% e çmimit', '% of price')),
        f(['cleaning', 'frequencyMultiplier', '3'], 'factor', B('3 herë në javë', '3 times a week'), B('% e çmimit', '% of price')),
        f(['cleaning', 'frequencyMultiplier', '4'], 'factor', B('4 herë në javë', '4 times a week'), B('% e çmimit', '% of price')),
        f(['cleaning', 'frequencyMultiplier', '5'], 'factor', B('5 ose më shumë herë në javë', '5 or more times a week'), B('% e çmimit', '% of price')),
      ],
    },
    {
      id: 'deep',
      title: B('Pastrimi i thellë', 'Deep clean'),
      intro: B('Pastrim një herë, i veçantë ose para fillimit të pastrimit të rregullt.', 'A one-time clean, on its own or before regular cleaning starts.'),
      fields: [
        ...tierFields(['cleaning', 'deepClean', 'tiers'], cfg.cleaning.deepClean.tiers, EUR_M2),
        f(['cleaning', 'deepClean', 'kitchen'], 'range', B('Çdo kuzhinë', 'Each kitchen'), EUR),
        f(['cleaning', 'deepClean', 'toilet'], 'range', B('Çdo tualet', 'Each toilet'), EUR),
        f(['cleaning', 'deepClean', 'minimum'], 'number', B('Çmimi minimal', 'Minimum charge'), EUR),
      ],
    },
    {
      id: 'hygiene',
      title: B('Furnizime higjienike (ProHygiene)', 'Hygiene supplies (ProHygiene)'),
      intro: B('Konsumi × çmimi për njësi. Muaji ka 21,67 ditë pune.', 'Consumption × unit price. A month has 21.67 workdays.'),
      fields: [
        ...cfg.hygiene.items.flatMap((it, i) => {
          const name = HYGIENE_ITEMS[it.id] ?? B(it.id, it.id);
          const unit = UNITS[it.unit] ?? B(it.unit, it.unit);
          const one = UNIT_ONE[it.unit] ?? unit;
          const basis = BASIS[it.basis];
          return [
            f(['hygiene', 'items', i, 'quantity'], 'range', B(`${name.sq}: konsumi`, `${name.en}: consumption`), B(`${unit.sq} ${basis.sq}`, `${unit.en} ${basis.en}`)),
            f(['hygiene', 'items', i, 'unitCost'], 'number', B(`${name.sq}: çmimi`, `${name.en}: price`), B(`€ për ${one.sq}`, `€ per ${one.en}`)),
          ];
        }),
        f(['hygiene', 'occasionalDeliveryFee'], 'number', B('Dërgesa për porosi të rastit', 'Delivery for occasional orders'), B('€ për porosi', '€ per order')),
      ],
    },
    {
      id: 'scenting',
      title: B('Aromatizimi', 'Scenting'),
      intro: B('Për pajisje: qira dhe rimbushje çdo muaj, instalim një herë.', 'Per device: rental and refill every month, installation once.'),
      fields: [
        f(['scenting', 'deviceRentalMonthly'], 'range', B('Qiraja e pajisjes', 'Device rental'), B('€ për pajisje në muaj', '€ per device per month')),
        f(['scenting', 'refillMonthly'], 'range', B('Rimbushja', 'Refill'), B('€ për pajisje në muaj', '€ per device per month')),
        f(['scenting', 'installationPerDevice'], 'range', B('Instalimi', 'Installation'), B('€ për pajisje, një herë', '€ per device, once')),
        f(['scenting', 'm2PerDevice'], 'number', B('Sipërfaqja që mbulon një pajisje', 'Area one device covers'), B('m²', 'm²')),
        f(['scenting', 'devicesPerZoneUnknown'], 'range', B('Pajisje për zonë kur sipërfaqja nuk dihet', 'Devices per zone when area is unknown'), B('pajisje', 'devices')),
      ],
    },
    {
      id: 'maintenance',
      title: B('Mirëmbajtja teknike', 'Technical maintenance'),
      intro: B('Plani parandalues është tarifë mujore me orë pune të përfshira. Pjesët llogariten gjithmonë veç.', 'The preventive plan is a monthly fee with labour hours included. Parts are always extra.'),
      fields: [
        f(['maintenance', 'preventive', 'baseMonthly'], 'range', B('Plani parandalues, tarifa mujore', 'Preventive plan, monthly fee'), EUR),
        f(['maintenance', 'preventive', 'includedHours'], 'number', B('Orë pune të përfshira në muaj', 'Labour hours included per month'), B('orë', 'hours')),
        f(['maintenance', 'preventive', 'baseArea'], 'number', B('Sipërfaqja e përfshirë në tarifën bazë', 'Area covered by the base fee'), B('m²', 'm²')),
        f(['maintenance', 'preventive', 'extraAreaBlock'], 'number', B('Blloku i sipërfaqes shtesë', 'Extra area block'), B('m²', 'm²')),
        f(['maintenance', 'preventive', 'extraPerBlock'], 'range', B('Shtesë për çdo bllok', 'Extra per block'), B('€ në muaj', '€ per month')),
        f(['maintenance', 'hourlyRate'], 'range', B('Punë shtesë', 'Extra labour'), B('€ për orë', '€ per hour')),
        f(['maintenance', 'callOut'], 'range', B('Thirrje kur nevojitet (me orën e parë)', 'Call-out when needed (first hour included)'), B('€ për thirrje', '€ per call-out')),
      ],
    },
    {
      id: 'drains',
      title: B('Debllokimi', 'Drain unblocking'),
      intro: B('Problemet ekzistuese vlerësohen në vend dhe nuk kanë çmim online.', 'Existing problems are assessed on site and have no online price.'),
      fields: [f(['drains', 'standardIntervention'], 'range', B('Debllokim standard i një pike të qasshme', 'Standard unblocking of an accessible point'), B('€ për thirrje', '€ per call-out'))],
    },
    {
      id: 'ddd',
      title: B('ECO PEST DDD', 'ECO PEST DDD'),
      intro: B('Parandalimi faturohet për trajtim; në vlerësimin mujor hyn si trajtime në vit ÷ 12.', 'Prevention is billed per treatment; the monthly estimate counts treatments per year ÷ 12.'),
      fields: [
        f(['ddd', 'prevention', 'treatmentsPerYear'], 'int', B('Trajtime në vit', 'Treatments per year'), B('trajtime', 'treatments')),
        f(['ddd', 'prevention', 'basePerTreatment'], 'range', B('Çmimi për trajtim (sipërfaqja bazë)', 'Price per treatment (base area)'), EUR),
        f(['ddd', 'prevention', 'baseArea'], 'number', B('Sipërfaqja bazë', 'Base area'), B('m²', 'm²')),
        f(['ddd', 'prevention', 'perM2Beyond'], 'range', B('Shtesë për m² mbi sipërfaqen bazë', 'Extra per m² above the base area'), EUR_M2),
      ],
    },
  ];
}

// ── Path helpers ────────────────────────────────────────────────────────────

export function getAt(obj: unknown, path: Path): unknown {
  return path.reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string | number, unknown>)[k]), obj);
}

/** Returns a copy of `obj` with `value` at `path` (copies only along the path). */
export function setAt<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const src = (obj ?? (typeof head === 'number' ? [] : {})) as Record<string | number, unknown>;
  const copy = (Array.isArray(src) ? [...src] : { ...src }) as Record<string | number, unknown>;
  copy[head] = setAt(src[head], rest, value);
  return copy as T;
}

/** City adjustments are optional keys; 0 means "no adjustment" and is not stored. */
export function normaliseCities(cfg: StoredPricing): StoredPricing {
  const adj = Object.fromEntries(Object.entries(cfg.locationLabourAdjustment).filter(([, v]) => typeof v === 'number' && v !== 0));
  return { ...cfg, locationLabourAdjustment: adj };
}
