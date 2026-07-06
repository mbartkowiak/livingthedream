/**
 * Per-state data tables for budget accuracy.
 * All values are estimates — update periodically.
 */

// Effective property tax rates on owner-occupied housing (share of home value/yr).
// Source: Tax Foundation, ~2022 effective rates. Fallback for unknown: 1.1% nat. avg.
export const STATE_PROPERTY_TAX_RATES: Record<string, number> = {
  AL: 0.0040, AK: 0.0107, AZ: 0.0063, AR: 0.0064, CA: 0.0075,
  CO: 0.0055, CT: 0.0179, DE: 0.0061, DC: 0.0057, FL: 0.0086,
  GA: 0.0090, HI: 0.0032, ID: 0.0067, IL: 0.0208, IN: 0.0084,
  IA: 0.0152, KS: 0.0134, KY: 0.0083, LA: 0.0056, ME: 0.0124,
  MD: 0.0107, MA: 0.0114, MI: 0.0138, MN: 0.0105, MS: 0.0075,
  MO: 0.0098, MT: 0.0074, NE: 0.0154, NV: 0.0059, NH: 0.0193,
  NJ: 0.0223, NM: 0.0067, NY: 0.0140, NC: 0.0082, ND: 0.0098,
  OH: 0.0153, OK: 0.0089, OR: 0.0093, PA: 0.0141, RI: 0.0140,
  SC: 0.0056, SD: 0.0117, TN: 0.0067, TX: 0.0168, UT: 0.0057,
  VT: 0.0183, VA: 0.0087, WA: 0.0094, WV: 0.0057, WI: 0.0161,
  WY: 0.0056,
}

export const NATIONAL_AVG_PROPERTY_TAX_RATE = 0.011

export function propertyTaxRate(state: string): number {
  return STATE_PROPERTY_TAX_RATES[state.toUpperCase()] ?? NATIONAL_AVG_PROPERTY_TAX_RATE
}

// BEA Regional Price Parities, all items, US = 100 (2022 estimates).
// Used to scale national-average budget line items to local price levels.
export const STATE_RPP: Record<string, number> = {
  AL: 87.8,  AK: 103.6, AZ: 98.5,  AR: 87.0,  CA: 112.6,
  CO: 102.6, CT: 103.5, DE: 97.3,  DC: 111.5, FL: 100.7,
  GA: 95.1,  HI: 113.2, ID: 93.6,  IL: 98.7,  IN: 91.5,
  IA: 89.7,  KS: 90.0,  KY: 89.4,  LA: 91.0,  ME: 94.5,
  MD: 104.4, MA: 107.9, MI: 93.5,  MN: 97.0,  MS: 86.3,
  MO: 90.2,  MT: 94.2,  NE: 91.1,  NV: 97.7,  NH: 100.9,
  NJ: 107.6, NM: 91.7,  NY: 108.9, NC: 94.0,  ND: 90.5,
  OH: 91.8,  OK: 87.9,  OR: 100.5, PA: 96.5,  RI: 99.4,
  SC: 92.3,  SD: 88.8,  TN: 91.2,  TX: 97.0,  UT: 96.0,
  VT: 97.2,  VA: 100.4, WA: 105.9, WV: 86.6,  WI: 92.9,
  WY: 92.2,
}

/**
 * Multiplier for non-housing budget items. The all-items RPP spread is driven
 * mostly by housing (priced locally elsewhere in the budget), so we dampen the
 * deviation by half to approximate BEA's ex-housing price parity.
 */
export function rppMultiplier(state: string): number {
  const rpp = STATE_RPP[state.toUpperCase()]
  if (!rpp) return 1
  return 1 + ((rpp / 100) - 1) * 0.5
}

/** All state codes with budget data — used by the affordability finder. */
export const ALL_STATES: string[] = Object.keys(STATE_RPP)
