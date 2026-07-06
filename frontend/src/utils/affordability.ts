/**
 * Affordability analysis built on the budget engine — the single source of
 * truth for "can this household afford this place?".
 */

import {
  BudgetInputs, BudgetResult, calcBudget, calcMonthlyMortgage,
  HOME_INSURANCE_ANNUAL, MAINTENANCE_RATE,
  FURNITURE_MONTHLY_BUY, FURNITURE_MONTHLY_RENT, RENTERS_INSURANCE_MONTHLY,
} from './budgetCalc'
import { propertyTaxRate } from './stateData'

export interface AffordabilityResult {
  budget: BudgetResult
  housingCost: number
  nonHousing: number
  availableForHousing: number
  canAfford: boolean
  gap: number
  grossMonthly: number
  takeHome: number
  taxMonthly: number
  salaryNeeded: number
}

function housingSplit(budget: BudgetResult) {
  const housingCost = budget.categories.find(c => c.id === 'housing')?.total ?? 0
  const nonHousing = budget.categories
    .filter(c => c.id !== 'housing')
    .reduce((s, c) => s + c.total, 0)
  return { housingCost, nonHousing }
}

/** Full-budget affordability verdict for a specific ZIP + income. */
export function budgetAffordability(inputs: BudgetInputs): AffordabilityResult {
  const budget = calcBudget(inputs)
  const { housingCost, nonHousing } = housingSplit(budget)
  const availableForHousing = budget.takeHomeMonthly - nonHousing
  const canAfford = availableForHousing >= housingCost
  const gap = Math.abs(availableForHousing - housingCost)

  // Salary that would make availableForHousing === housingCost (binary search)
  let salaryNeeded = inputs.annualIncome
  if (!canAfford) {
    const clears = (income: number) => {
      const b = calcBudget({ ...inputs, annualIncome: income })
      const { housingCost: hc, nonHousing: nh } = housingSplit(b)
      return b.takeHomeMonthly - nh >= hc
    }
    let lo = inputs.annualIncome
    let hi = Math.max(inputs.annualIncome, 10_000) * 10
    // Expand the ceiling until it clears — a $20k probe income must still find
    // the requirement for a $3.5M ZIP (cap guards against unaffordable-at-any-income)
    while (!clears(hi) && hi < 1e9) {
      lo = hi
      hi *= 4
    }
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      const b2 = calcBudget({ ...inputs, annualIncome: mid })
      const { housingCost: hc2, nonHousing: nh2 } = housingSplit(b2)
      if (b2.takeHomeMonthly - nh2 >= hc2) hi = mid; else lo = mid
    }
    salaryNeeded = Math.ceil((lo + hi) / 2)
    // $-rounding inside budget line items creates small plateaus around the
    // threshold — nudge upward so the returned salary actually clears
    for (let i = 0; i < 100 && !clears(salaryNeeded); i++) salaryNeeded += 100
  }

  return {
    budget, housingCost, nonHousing,
    availableForHousing, canAfford, gap,
    grossMonthly: budget.grossMonthly,
    takeHome:     budget.takeHomeMonthly,
    taxMonthly:   budget.taxes.total,
    salaryNeeded,
  }
}

export interface MaxAffordableResult {
  availableForHousing: number
  maxPrice: number   // max home price where full budget still clears (buy mode)
  maxRent: number    // max monthly rent where full budget still clears
}

/**
 * Invert the budget: given an income and a state, what's the most expensive
 * home / highest rent the full budget can absorb? Non-housing expenses don't
 * depend on the home price, so no iteration is needed. Used by the
 * "Where can I afford?" finder — the backend just filters ZIPs by these caps.
 */
export function maxAffordable(
  inputs: Omit<BudgetInputs, 'medianHomePrice' | 'avgRent' | 'housingMode'>,
): MaxAffordableResult {
  const budget = calcBudget({
    ...inputs, medianHomePrice: 0, avgRent: 0, housingMode: 'buy',
  })
  const { nonHousing } = housingSplit(budget)
  const availableForHousing = budget.takeHomeMonthly - nonHousing

  // buy: cost(price) = price × coef + fixed  →  maxPrice = (available − fixed) / coef
  const mortgagePerDollar = calcMonthlyMortgage(1, inputs.mortgageRate, inputs.downPaymentPct)
  const coef = mortgagePerDollar + (propertyTaxRate(inputs.state) + MAINTENANCE_RATE) / 12
  const fixedBuy = HOME_INSURANCE_ANNUAL / 12 + FURNITURE_MONTHLY_BUY
  const maxPrice = Math.max(0, (availableForHousing - fixedBuy) / coef)

  const maxRent = Math.max(
    0, availableForHousing - RENTERS_INSURANCE_MONTHLY - FURNITURE_MONTHLY_RENT,
  )

  return { availableForHousing, maxPrice, maxRent }
}
