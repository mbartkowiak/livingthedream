/**
 * Tax calculations for budget estimates.
 * Sources: IRS Rev. Proc. 2023-34 (2024 brackets), SSA 2024 wage base.
 * Update annually.
 */

// 2024 federal income tax brackets — single filer
const FEDERAL_BRACKETS = [
  { max: 11_600,  rate: 0.10 },
  { max: 47_150,  rate: 0.12 },
  { max: 100_525, rate: 0.22 },
  { max: 191_950, rate: 0.24 },
  { max: 243_725, rate: 0.32 },
  { max: 609_350, rate: 0.35 },
  { max: Infinity, rate: 0.37 },
]
const STANDARD_DEDUCTION = 14_600   // 2024 single
const SS_RATE            = 0.062
const SS_WAGE_BASE       = 168_600  // 2024
const MEDICARE_RATE      = 0.0145

// Approximate effective state income tax rates for a middle-income single filer.
// No-tax states = 0. Progressive states use a typical effective rate.
// Update periodically — these are estimates, not exact.
export const STATE_TAX_RATES: Record<string, number> = {
  AK: 0,     FL: 0,     NV: 0,     SD: 0,     TX: 0,
  WA: 0,     WY: 0,     NH: 0,     TN: 0,
  CO: 0.044, IL: 0.0495,IN: 0.0315,KY: 0.045, MA: 0.05,
  MI: 0.0425,NC: 0.0475,PA: 0.0307,UT: 0.0485,
  AL: 0.04,  AR: 0.039, AZ: 0.025, CA: 0.093, CT: 0.065,
  DE: 0.066, GA: 0.055, HI: 0.079, IA: 0.057, ID: 0.058,
  KS: 0.057, LA: 0.042, ME: 0.075, MD: 0.0575,MN: 0.0785,
  MO: 0.049, MS: 0.047, MT: 0.069, NE: 0.0664,NJ: 0.0897,
  NM: 0.059, NY: 0.0685,OH: 0.035, OK: 0.045, OR: 0.099,
  RI: 0.0599,SC: 0.07,  VT: 0.0875,VA: 0.0575,WV: 0.065,
  WI: 0.0765,DC: 0.0875,
}

export interface TaxBreakdown {
  federal: number
  state: number
  socialSecurity: number
  medicare: number
  total: number
  effectiveRate: number
}

export function calcTaxes(grossAnnual: number, state: string): TaxBreakdown {
  // Federal income tax
  const taxable = Math.max(0, grossAnnual - STANDARD_DEDUCTION)
  let federal = 0
  let prev = 0
  for (const bracket of FEDERAL_BRACKETS) {
    if (taxable <= prev) break
    federal += (Math.min(taxable, bracket.max) - prev) * bracket.rate
    prev = bracket.max
  }

  // State income tax (flat effective rate approximation)
  const stateRate = STATE_TAX_RATES[state.toUpperCase()] ?? 0.05
  const stateTax = grossAnnual * stateRate

  // FICA
  const ss       = Math.min(grossAnnual, SS_WAGE_BASE) * SS_RATE
  const medicare = grossAnnual * MEDICARE_RATE

  const total = federal + stateTax + ss + medicare
  return {
    federal:         Math.round(federal),
    state:           Math.round(stateTax),
    socialSecurity:  Math.round(ss),
    medicare:        Math.round(medicare),
    total:           Math.round(total),
    effectiveRate:   total / grossAnnual,
  }
}

export function monthlyTakeHome(grossAnnual: number, state: string): number {
  const taxes = calcTaxes(grossAnnual, state)
  return (grossAnnual - taxes.total) / 12
}
