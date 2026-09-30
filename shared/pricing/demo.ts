// DEMO pricing configuration — for development and the festival prototype only.
//
// These figures are placeholders chosen to be internally consistent. They are NOT
// Shtepiaku tariffs. Any screen that uses this configuration shows the
// "Çmime demonstruese" label, and leads created with it are stored separately.
// Replace with an approved configuration (status: 'approved') before going live.

import type { PricingConfig } from './config';

export const DEMO_PRICING: PricingConfig = {
  id: 'demo-2026.09',
  status: 'demo',
  label: 'DEMO – jo tarifa të miratuara',
  currency: 'EUR',
  vat: { rate: 0.18, pricesIncludeVat: false },

  weeksPerMonth: 52 / 12,
  workdaysPerMonth: (52 * 5) / 12,

  areaRanges: {
    lt100: { min: 40, max: 100 },
    '100_250': { min: 100, max: 250 },
    '250_500': { min: 250, max: 500 },
    '500_1000': { min: 500, max: 1000 },
    '1000_2000': { min: 1000, max: 2000 },
    '2000_4000': { min: 2000, max: 4000 },
  },
  occupancyDensity: {
    office: { m2PerPersonLow: 8, m2PerPersonHigh: 14 },
    coworking: { m2PerPersonLow: 6, m2PerPersonHigh: 10 },
    retail: { m2PerPersonLow: 20, m2PerPersonHigh: 40 },
    warehouse: { m2PerPersonLow: 40, m2PerPersonHigh: 100 },
    other: { m2PerPersonLow: 10, m2PerPersonHigh: 20 },
  },

  locationLabourAdjustment: {},

  cleaning: {
    tiers: [
      { upTo: 100, ratePerM2: [0.15, 0.2] },
      { upTo: 300, ratePerM2: [0.1, 0.14] },
      { upTo: 700, ratePerM2: [0.08, 0.11] },
      { upTo: Infinity, ratePerM2: [0.06, 0.08] },
    ],
    kitchenPerVisit: [3, 5],
    toiletPerVisit: [2, 3],
    minimumVisit: 20,
    frequencyMultiplier: { lt1: 1.15, 1: 1.1, 2: 1.05, 3: 1, 4: 0.97, 5: 0.95 },
    outsideHoursSurcharge: 0.15,
    deepClean: {
      tiers: [
        { upTo: 100, ratePerM2: [1.2, 1.6] },
        { upTo: 300, ratePerM2: [0.9, 1.2] },
        { upTo: Infinity, ratePerM2: [0.7, 0.95] },
      ],
      kitchen: [25, 40],
      toilet: [15, 25],
      minimum: 90,
    },
  },

  hygiene: {
    items: [
      { id: 'toilet_paper', requires: 'toilets', basis: 'person_day', quantity: [0.08, 0.12], unit: 'rolls', unitCost: 0.45 },
      { id: 'hand_towels', requires: 'toilets', basis: 'person_day', quantity: [0.02, 0.03], unit: 'packs', unitCost: 1.9 },
      { id: 'hand_soap', requires: 'toilets', basis: 'person_day', quantity: [0.004, 0.006], unit: 'litres', unitCost: 2.2 },
      { id: 'dish_detergent', requires: 'kitchen', basis: 'kitchen_day', quantity: [0.03, 0.05], unit: 'litres', unitCost: 1.8 },
      { id: 'kitchen_rolls', requires: 'kitchen', basis: 'kitchen_day', quantity: [0.15, 0.25], unit: 'rolls', unitCost: 0.9 },
      {
        id: 'toilet_air_freshener',
        requires: 'toilets',
        basis: 'toilet_month',
        quantity: [1, 1],
        unit: 'refills',
        unitCost: 4,
        replacedByScentingZone: 'toilets',
      },
    ],
    occasionalDeliveryFee: 5,
  },

  scenting: {
    m2PerDevice: 60,
    devicesPerZoneUnknown: [1, 2],
    deviceRentalMonthly: [6, 9],
    refillMonthly: [8, 12],
    installationPerDevice: [15, 25],
  },

  maintenance: {
    preventive: {
      includedHours: 2,
      baseMonthly: [45, 65],
      baseArea: 300,
      extraAreaBlock: 300,
      extraPerBlock: [10, 15],
    },
    hourlyRate: [15, 20],
    callOut: [25, 35],
  },

  drains: {
    standardIntervention: [35, 55],
  },

  ddd: {
    prevention: {
      treatmentsPerYear: 4,
      basePerTreatment: [40, 55],
      baseArea: 150,
      perM2Beyond: [0.12, 0.18],
    },
  },

  bundle: {
    minRecurringServices: 3,
    discount: 0.05,
  },
};
