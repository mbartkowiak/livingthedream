/**
 * Budget estimates by category.
 *
 * Data sources:
 *  - BLS Consumer Expenditure Survey 2022 (primary baseline)
 *  - EIA Average Retail Electricity/Gas Prices 2023
 *  - USDA Food Plans (moderate, 2023)
 *  - Edmunds 2023 average auto loan payment
 *  - KFF Employer Health Benefits Survey 2023
 *  - AAA Your Driving Costs 2023
 *  - Tax Foundation effective property tax rates (~2022)
 *  - BEA Regional Price Parities 2022 (regional cost scaling)
 *  - Zillow ZHVI / ZORI (housing — passed in as props)
 */

import { calcTaxes, FilingStatus } from './taxCalc'
import { propertyTaxRate, rppMultiplier } from './stateData'

export type HousingMode = 'rent' | 'buy'
export type HouseholdPreset = 'single' | 'couple' | 'family'

export const HOUSEHOLD_LABELS: Record<HouseholdPreset, string> = {
  single: 'Single adult',
  couple: 'Couple',
  family: 'Family (2 adults + child)',
}

/** Overrides are keyed by `itemKey(categoryId, itemName)` → monthly $ */
export type BudgetOverrides = Record<string, number>

export function itemKey(categoryId: string, itemName: string): string {
  return `${categoryId}:${itemName}`
}

export interface LineItem {
  name:    string
  monthly: number   // estimated monthly cost
  source:  string
  note?:   string
}

export interface BudgetCategory {
  id:     string
  name:   string
  color:  string       // Tailwind bg class for the header
  items:  LineItem[]
  total:  number
}

export interface BudgetResult {
  grossMonthly:    number
  takeHomeMonthly: number
  taxes:           BudgetCategory
  categories:      BudgetCategory[]
  surplus:         number   // takeHome - (all non-tax expenses); negative = deficit
  rppMultiplier:   number   // regional price multiplier applied to variable categories
}

export interface BudgetInputs {
  annualIncome:    number
  state:           string
  medianHomePrice: number
  avgRent:         number | null
  mortgageRate:    number   // e.g. 7.0
  downPaymentPct:  number   // e.g. 20
  housingMode:     HousingMode
  filingStatus?:   FilingStatus     // default 'single'
  household?:      HouseholdPreset  // default 'single'
  overrides?:      BudgetOverrides
}

// Housing cost constants shared with the affordability finder — keep in sync
export const HOME_INSURANCE_ANNUAL   = 1_400  // $/yr national avg (III 2023)
export const MAINTENANCE_RATE        = 0.01   // 1% of home value per year
export const FURNITURE_MONTHLY_BUY   = 150
export const FURNITURE_MONTHLY_RENT  = 100
export const RENTERS_INSURANCE_MONTHLY = 18

export function calcMonthlyMortgage(
  homePrice: number,
  annualRatePct: number,
  downPaymentPct: number,
): number {
  const loan   = homePrice * (1 - downPaymentPct / 100)
  const r      = annualRatePct / 100 / 12
  const n      = 360
  if (r === 0) return loan / n
  const factor = Math.pow(1 + r, n)
  return loan * (r * factor) / (factor - 1)
}

// ── Household preset adjustments ────────────────────────────────────────────
// Category-level multipliers scale every item in the category; item-level
// values then replace specific line items (applied after multipliers).

const PRESET_CATEGORY_MULT: Record<HouseholdPreset, Record<string, number>> = {
  single: {},
  couple: {
    food: 1.8, healthcare: 1.9, personalCare: 1.8, clothing: 1.8,
    entertainment: 1.6, travel: 1.8, gifts: 1.5,
  },
  family: {
    food: 2.4, healthcare: 2.6, personalCare: 2.0, clothing: 2.4,
    entertainment: 1.8, travel: 2.0, gifts: 1.7,
  },
}

const PRESET_ITEM_SET: Record<HouseholdPreset, Record<string, number>> = {
  single: {},
  couple: {
    'utilities:Mobile phone': 140,   // shared plan, 2 lines
  },
  family: {
    'utilities:Mobile phone': 140,
    'childcare:Daycare / childcare': 1_300,  // Care.com 2023 nat. avg
    "childcare:Kids' activities": 100,
    // KFF 2023: employee share of family coverage premium
    'healthcare:Health insurance premium (employee share)': 525,
  },
}

// Categories whose national-average items get scaled by regional price levels
const RPP_CATEGORIES = new Set([
  'utilities', 'food', 'healthcare', 'personalCare', 'clothing', 'entertainment',
])

// ── main export ───────────────────────────────────────────────────────────

export function calcBudget(inputs: BudgetInputs): BudgetResult {
  const {
    annualIncome, state, medianHomePrice, avgRent,
    mortgageRate, downPaymentPct, housingMode,
    filingStatus = 'single',
    household = 'single',
    overrides = {},
  } = inputs

  const grossMonthly = annualIncome / 12
  const taxData      = calcTaxes(annualIncome, state, filingStatus)
  const takeHomeMonthly = (annualIncome - taxData.total) / 12

  // ── TAXES ──────────────────────────────────────────────────────────────
  const taxCategory: BudgetCategory = {
    id:    'taxes',
    name:  'Taxes',
    color: 'bg-slate-700',
    items: [
      { name: 'Federal income tax',       monthly: taxData.federal        / 12, source: `IRS 2024 brackets (${filingStatus === 'married' ? 'married filing jointly' : 'single'})` },
      { name: 'State income tax',         monthly: taxData.state          / 12, source: 'State rate estimate' },
      { name: 'Social Security (FICA)',   monthly: taxData.socialSecurity / 12, source: 'SSA 2024 (6.2%)' },
      { name: 'Medicare (FICA)',          monthly: taxData.medicare       / 12, source: 'IRS 2024 (1.45%)' },
    ],
    total: taxData.total / 12,
  }

  // ── HOUSING ────────────────────────────────────────────────────────────
  const propTaxRate  = propertyTaxRate(state)
  const mortgage     = calcMonthlyMortgage(medianHomePrice, mortgageRate, downPaymentPct)
  const propTax      = (medianHomePrice * propTaxRate) / 12
  const hoInsurance  = HOME_INSURANCE_ANNUAL / 12
  const maintenance  = (medianHomePrice * MAINTENANCE_RATE) / 12
  const rentAmt      = avgRent ?? grossMonthly * 0.30   // fallback to 30% rule

  const housingItems: LineItem[] = housingMode === 'buy'
    ? [
        { name: 'Mortgage payment',         monthly: mortgage,    source: `${mortgageRate}% rate, ${downPaymentPct}% down, 30 yr` },
        { name: 'Property taxes',           monthly: propTax,     source: `${(propTaxRate * 100).toFixed(2)}% effective rate, ${state.toUpperCase()} (Tax Foundation)` },
        { name: "Homeowner's insurance",    monthly: hoInsurance, source: 'Nat. avg $1,400/yr (III 2023)' },
        { name: 'Repairs & maintenance',    monthly: maintenance, source: '1% of home value rule of thumb' },
        { name: 'HOA fees',                 monthly: 0,           source: 'Assumed $0 — varies widely', note: 'Add if applicable' },
        { name: 'Furniture / improvement',  monthly: FURNITURE_MONTHLY_BUY, source: 'BLS CEX 2022 estimate' },
      ]
    : [
        { name: 'Rent',                     monthly: rentAmt,     source: avgRent ? 'Zillow ZORI' : '30% of gross (est.)' },
        { name: "Renter's insurance",       monthly: RENTERS_INSURANCE_MONTHLY, source: 'Nat. avg ~$220/yr (NerdWallet 2023)' },
        { name: 'Furniture / improvement',  monthly: FURNITURE_MONTHLY_RENT, source: 'BLS CEX 2022 estimate' },
      ]

  // ── UTILITIES ──────────────────────────────────────────────────────────
  const utilityItems: LineItem[] = [
    { name: 'Electricity',         monthly: 117,  source: 'EIA avg residential bill 2023' },
    { name: 'Natural gas',         monthly: 80,   source: 'EIA avg 2023' },
    { name: 'Water / sewer / trash', monthly: 75, source: 'AWIA national avg 2023' },
    { name: 'Internet',            monthly: 65,   source: 'Allconnect avg 2023' },
    { name: 'Mobile phone',        monthly: 85,   source: 'JD Power avg plan 2023' },
    { name: 'Streaming services',  monthly: 45,   source: 'Avg 3 services (Netflix/Hulu/Disney+)' },
  ]

  // ── FOOD ───────────────────────────────────────────────────────────────
  const foodItems: LineItem[] = [
    { name: 'Groceries',           monthly: 360,  source: 'USDA Moderate Food Plan, 1 adult 2023' },
    { name: 'Dining out',          monthly: 200,  source: 'BLS CEX 2022' },
    { name: 'Coffee / work lunches', monthly: 80, source: 'Industry estimate' },
    { name: 'Food delivery',       monthly: 45,   source: 'Numerator 2023 avg subscriber spend' },
  ]

  // ── TRANSPORTATION ─────────────────────────────────────────────────────
  const transportItems: LineItem[] = [
    { name: 'Car payment (used)',   monthly: 532,  source: 'Edmunds Q3 2023 avg used auto loan' },
    { name: 'Auto insurance',       monthly: 180,  source: 'Bankrate nat. avg 2023' },
    { name: 'Gas',                  monthly: 150,  source: 'AAA Your Driving Costs 2023' },
    { name: 'Maintenance & repairs', monthly: 80,  source: 'AAA Your Driving Costs 2023' },
    { name: 'Registration / inspection', monthly: 16, source: 'Nat. avg ~$195/yr (DMV surveys)' },
    { name: 'Parking & tolls',      monthly: 30,   source: 'BLS CEX 2022 estimate' },
    { name: 'Rideshare',            monthly: 30,   source: 'Industry estimate' },
    { name: 'Flights (avg monthly)', monthly: 100, source: 'BTS avg domestic airfare / 12' },
  ]

  // ── HEALTHCARE ─────────────────────────────────────────────────────────
  const healthcareItems: LineItem[] = [
    { name: 'Health insurance premium (employee share)', monthly: 125, source: 'KFF Employer Survey 2023, single coverage' },
    { name: 'Copays & deductibles',  monthly: 75,  source: 'KFF / CMS avg OOP 2023' },
    { name: 'Prescriptions',         monthly: 40,  source: 'GoodRx consumer survey 2023' },
    { name: 'Dental',                monthly: 30,  source: 'NADP avg out-of-pocket 2023' },
    { name: 'Vision',                monthly: 12,  source: 'VSP avg 2023' },
    { name: 'OTC medications',       monthly: 25,  source: 'Consumer Healthcare Products Assoc. 2023' },
    { name: 'Therapy / mental health', monthly: 0, source: 'Highly variable — add if applicable', note: 'Approx. $100–$300/mo without insurance' },
  ]

  // ── INSURANCE (NON-HEALTH) ─────────────────────────────────────────────
  const insuranceItems: LineItem[] = [
    { name: 'Term life insurance',   monthly: 30,  source: 'Policygenius avg 30yr term, 30yo 2023' },
    { name: 'Disability insurance',  monthly: 40,  source: 'Council for Disability Awareness avg 2023' },
    { name: 'Pet insurance',         monthly: 0,   source: 'NAPHIA avg $53/mo — add if applicable', note: 'Optional' },
    { name: 'Umbrella policy',       monthly: 0,   source: 'Typically $150–$300/yr — add if applicable', note: 'Optional' },
  ]

  // ── DEBT PAYMENTS ──────────────────────────────────────────────────────
  const debtItems: LineItem[] = [
    { name: 'Student loans',         monthly: 350, source: 'Education Data Initiative avg payment 2023', note: 'Set to $0 if debt-free' },
    { name: 'Credit cards / other',  monthly: 0,   source: 'Highly variable — add balances if applicable' },
  ]

  // ── SAVINGS & INVESTMENTS ──────────────────────────────────────────────
  const savingsItems: LineItem[] = [
    { name: '401(k) / retirement',   monthly: Math.round(grossMonthly * 0.06),  source: '6% of gross (common employer-match target)' },
    { name: 'Emergency fund',        monthly: Math.round(grossMonthly * 0.02),  source: '2% of gross until 3–6 months saved' },
    { name: 'HSA contribution',      monthly: 65,  source: 'IRS 2024 limit $4,150 single / 12' },
    { name: 'Brokerage / other',     monthly: Math.round(grossMonthly * 0.02),  source: '2% of gross — adjust to goals' },
  ]

  // ── CHILDCARE & EDUCATION ──────────────────────────────────────────────
  const childcareItems: LineItem[] = [
    { name: 'Daycare / childcare',   monthly: 0,   source: 'Nat. avg $1,300/mo (Care.com 2023) — add if applicable', note: 'No children assumed' },
    { name: 'Tuition / school fees', monthly: 0,   source: 'Highly variable — add if applicable' },
    { name: "Kids' activities",      monthly: 0,   source: 'Add if applicable' },
  ]

  // ── PERSONAL CARE ──────────────────────────────────────────────────────
  const personalCareItems: LineItem[] = [
    { name: 'Haircuts & grooming',   monthly: 40,  source: 'BLS CEX 2022' },
    { name: 'Toiletries & cosmetics', monthly: 50, source: 'BLS CEX 2022' },
    { name: 'Gym membership',        monthly: 50,  source: 'IHRSA industry avg 2023' },
    { name: 'Supplements',           monthly: 30,  source: 'Consumer survey estimate' },
  ]

  // ── CLOTHING ───────────────────────────────────────────────────────────
  const clothingItems: LineItem[] = [
    { name: 'Clothing & footwear',   monthly: 125, source: 'BLS CEX 2022 ($1,500/yr ÷ 12)' },
    { name: 'Dry cleaning',          monthly: 20,  source: 'Industry estimate' },
  ]

  // ── ENTERTAINMENT ──────────────────────────────────────────────────────
  const entertainmentItems: LineItem[] = [
    { name: 'Movies / concerts / events', monthly: 75, source: 'BLS CEX 2022' },
    { name: 'Hobbies',               monthly: 75,  source: 'BLS CEX 2022' },
    { name: 'Books, games, apps',    monthly: 30,  source: 'BLS CEX 2022' },
  ]

  // ── TRAVEL & VACATION ──────────────────────────────────────────────────
  const travelItems: LineItem[] = [
    { name: 'Lodging & activities',  monthly: 100, source: 'BLS CEX 2022 avg ($1,200/yr ÷ 12)' },
    { name: 'Rental car / transport', monthly: 25, source: 'BLS CEX 2022 estimate' },
    { name: 'Travel insurance',      monthly: 10,  source: 'Industry estimate' },
  ]

  // ── PETS ───────────────────────────────────────────────────────────────
  const petItems: LineItem[] = [
    { name: 'Pet food & supplies',   monthly: 0,   source: 'APPA: ~$700/yr for dog — add if applicable', note: 'No pets assumed' },
    { name: 'Vet & grooming',        monthly: 0,   source: 'APPA: ~$730/yr for dog — add if applicable' },
  ]

  // ── GIFTS & GIVING ─────────────────────────────────────────────────────
  const giftsItems: LineItem[] = [
    { name: 'Gifts (birthdays / holidays)', monthly: 75, source: 'BLS CEX 2022 cash contributions estimate' },
    { name: 'Charitable donations',  monthly: 40,  source: 'Giving USA 2023 avg household' },
  ]

  // ── FAMILY SUPPORT ─────────────────────────────────────────────────────
  const familyItems: LineItem[] = [
    { name: 'Support to relatives',  monthly: 0,   source: 'Highly variable — add if applicable' },
    { name: 'Eldercare costs',       monthly: 0,   source: 'Highly variable — add if applicable' },
  ]

  // ── PROFESSIONAL DEVELOPMENT ───────────────────────────────────────────
  const professionalItems: LineItem[] = [
    { name: 'Courses & certifications', monthly: 30, source: 'Industry estimate' },
    { name: 'Professional memberships', monthly: 15, source: 'Industry estimate' },
    { name: 'Books for skill-building', monthly: 10, source: 'Industry estimate' },
  ]

  // ── FEES & MISCELLANEOUS ───────────────────────────────────────────────
  const feesItems: LineItem[] = [
    { name: 'Bank / ATM fees',       monthly: 10,  source: 'Bankrate avg 2023' },
    { name: 'Subscription services', monthly: 20,  source: 'Estimate' },
    { name: 'Postage / legal / misc', monthly: 20, source: 'BLS CEX 2022 miscellaneous' },
  ]

  // ── ANNUAL / IRREGULAR (SINKING FUNDS) ────────────────────────────────
  // Note: only truly irregular expenses belong here. Car registration, medical
  // out-of-pocket, holiday gifts, and home repairs are already counted in the
  // Transportation, Healthcare, Gifts, and Housing categories.
  const sinkingItems: LineItem[] = [
    { name: 'Warehouse membership (Costco, etc.)', monthly: 10, source: '$120/yr ÷ 12' },
    { name: 'Amazon Prime / annual subs', monthly: 12, source: '$139/yr ÷ 12' },
    { name: 'Future car replacement fund', monthly: 100, source: '~$6,000 saved over 5 yrs for used car' },
  ]

  // ── BUILD CATEGORY OBJECTS ─────────────────────────────────────────────
  const rpp = rppMultiplier(state)
  const catMult = PRESET_CATEGORY_MULT[household]
  const itemSet = PRESET_ITEM_SET[household]

  const buildCat = (
    id: string, name: string, color: string, rawItems: LineItem[]
  ): BudgetCategory => {
    const items = rawItems.map(item => {
      const key = itemKey(id, item.name)
      let monthly = item.monthly
      // 1. household preset: category multiplier, then explicit item values
      monthly *= catMult[id] ?? 1
      if (key in itemSet) monthly = itemSet[key]
      // 2. regional price adjustment for national-average categories
      if (RPP_CATEGORIES.has(id)) monthly *= rpp
      // 3. user overrides always win
      if (key in overrides) monthly = overrides[key]
      return { ...item, monthly }
    })
    return { id, name, color, items, total: items.reduce((s, i) => s + i.monthly, 0) }
  }

  const categories: BudgetCategory[] = [
    buildCat('housing',       'Housing',                         'bg-blue-700',   housingItems),
    buildCat('utilities',     'Utilities',                       'bg-cyan-700',   utilityItems),
    buildCat('food',          'Food',                            'bg-orange-600', foodItems),
    buildCat('transport',     'Transportation',                  'bg-yellow-600', transportItems),
    buildCat('healthcare',    'Healthcare',                      'bg-rose-700',   healthcareItems),
    buildCat('insurance',     'Insurance (non-health)',          'bg-pink-700',   insuranceItems),
    buildCat('debt',          'Debt Payments',                   'bg-red-700',    debtItems),
    buildCat('savings',       'Savings & Investments',           'bg-emerald-700',savingsItems),
    buildCat('childcare',     'Childcare & Education',           'bg-violet-700', childcareItems),
    buildCat('personalCare',  'Personal Care',                   'bg-purple-600', personalCareItems),
    buildCat('clothing',      'Clothing',                        'bg-fuchsia-700',clothingItems),
    buildCat('entertainment', 'Entertainment & Recreation',      'bg-indigo-600', entertainmentItems),
    buildCat('travel',        'Travel & Vacation',               'bg-sky-700',    travelItems),
    buildCat('pets',          'Pets',                            'bg-lime-700',   petItems),
    buildCat('gifts',         'Gifts & Giving',                  'bg-teal-700',   giftsItems),
    buildCat('family',        'Family Support',                  'bg-stone-600',  familyItems),
    buildCat('professional',  'Professional Development',        'bg-slate-600',  professionalItems),
    buildCat('fees',          'Fees & Miscellaneous',            'bg-gray-600',   feesItems),
    buildCat('sinking',       'Annual / Irregular (Sinking Funds)', 'bg-zinc-600', sinkingItems),
  ]

  const nonTaxExpenses = categories.reduce((s, c) => s + c.total, 0)
  const surplus        = takeHomeMonthly - nonTaxExpenses

  return {
    grossMonthly,
    takeHomeMonthly,
    taxes: taxCategory,
    categories,
    surplus,
    rppMultiplier: rpp,
  }
}
