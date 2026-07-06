import { describe, it, expect } from 'vitest'
import { budgetAffordability, maxAffordable } from './affordability'
import { calcBudget, BudgetInputs } from './budgetCalc'

const inputs = (income: number, price = 400_000, rent: number | null = 2_000): BudgetInputs => ({
  annualIncome: income,
  state: 'TX',
  medianHomePrice: price,
  avgRent: rent,
  mortgageRate: 7.0,
  downPaymentPct: 20,
  housingMode: 'buy',
})

describe('budgetAffordability', () => {
  it('high income affords a modest home; low income does not', () => {
    expect(budgetAffordability(inputs(500_000)).canAfford).toBe(true)
    expect(budgetAffordability(inputs(40_000)).canAfford).toBe(false)
  })

  it('salaryNeeded grows past the initial search ceiling for very expensive ZIPs', () => {
    // Regression: a $20k probe income vs a $3.5M home once pegged at 10× probe = $200k
    const aff = budgetAffordability(inputs(20_000, 3_500_000, 5_800))
    expect(aff.canAfford).toBe(false)
    expect(aff.salaryNeeded).toBeGreaterThan(200_000)
    expect(budgetAffordability(inputs(aff.salaryNeeded, 3_500_000, 5_800)).canAfford).toBe(true)
  })

  it('salaryNeeded actually clears the budget (binary search converges)', () => {
    const aff = budgetAffordability(inputs(40_000))
    expect(aff.canAfford).toBe(false)
    expect(aff.salaryNeeded).toBeGreaterThan(40_000)
    const check = budgetAffordability(inputs(aff.salaryNeeded))
    expect(check.canAfford).toBe(true)
    // and it's tight — 2% less should fail
    expect(budgetAffordability(inputs(aff.salaryNeeded * 0.98)).canAfford).toBe(false)
  })

  it('available-for-housing + non-housing = take-home', () => {
    const aff = budgetAffordability(inputs(100_000))
    expect(aff.availableForHousing + aff.nonHousing).toBeCloseTo(aff.takeHome, 6)
  })
})

describe('maxAffordable', () => {
  const base = {
    annualIncome: 150_000, state: 'TX', mortgageRate: 7.0, downPaymentPct: 20,
  }

  it('a home at exactly maxPrice is affordable; 5% above is not', () => {
    const { maxPrice } = maxAffordable(base)
    expect(maxPrice).toBeGreaterThan(0)
    const at = budgetAffordability({
      ...inputs(150_000, maxPrice), housingMode: 'buy',
    })
    expect(at.canAfford).toBe(true)
    const above = budgetAffordability({
      ...inputs(150_000, maxPrice * 1.05), housingMode: 'buy',
    })
    expect(above.canAfford).toBe(false)
  })

  it('rent at exactly maxRent is affordable; above is not', () => {
    const { maxRent } = maxAffordable(base)
    const at = budgetAffordability({
      ...inputs(150_000, 400_000, maxRent), housingMode: 'rent',
    })
    expect(at.canAfford).toBe(true)
    const above = budgetAffordability({
      ...inputs(150_000, 400_000, maxRent + 50), housingMode: 'rent',
    })
    expect(above.canAfford).toBe(false)
  })

  it('higher property-tax states lower the max price at equal income', () => {
    const tx = maxAffordable(base)                 // 1.68% property tax
    const nj = maxAffordable({ ...base, state: 'NJ' })  // 2.23% + state income tax
    expect(nj.maxPrice).toBeLessThan(tx.maxPrice)
  })
})

describe('engine consistency', () => {
  it('maxAffordable matches the forward budget within rounding', () => {
    // available-for-housing derived with a dummy price must equal the real one
    const { availableForHousing } = maxAffordable({
      annualIncome: 100_000, state: 'CA', mortgageRate: 6.5, downPaymentPct: 10,
    })
    const b = calcBudget({
      annualIncome: 100_000, state: 'CA', medianHomePrice: 500_000, avgRent: 2_500,
      mortgageRate: 6.5, downPaymentPct: 10, housingMode: 'rent',
    })
    const nonHousing = b.categories.filter(c => c.id !== 'housing')
      .reduce((s, c) => s + c.total, 0)
    expect(availableForHousing).toBeCloseTo(b.takeHomeMonthly - nonHousing, 6)
  })
})
