import { describe, it, expect } from 'vitest'
import {
  calcBudget, calcMonthlyMortgage, itemKey, BudgetInputs, HousingMode,
} from './budgetCalc'
import { rppMultiplier } from './stateData'

describe('calcMonthlyMortgage', () => {
  it('matches the standard amortization formula', () => {
    // $300k home, 20% down, 7% / 30yr → ~$1,596.73/mo on a $240k loan
    expect(calcMonthlyMortgage(300_000, 7.0, 20)).toBeCloseTo(1_596.73, 0)
  })

  it('handles a 0% rate without dividing by zero', () => {
    // $240k loan over 360 months
    expect(calcMonthlyMortgage(300_000, 0, 20)).toBeCloseTo(240_000 / 360, 2)
  })

  it('scales the loan by the down payment', () => {
    const full = calcMonthlyMortgage(300_000, 7.0, 0)
    const half = calcMonthlyMortgage(300_000, 7.0, 50)
    expect(half).toBeCloseTo(full / 2, 6)
  })
})

const baseInputs = (mode: HousingMode): BudgetInputs => ({
  annualIncome: 100_000,
  state: 'TX',
  medianHomePrice: 400_000,
  avgRent: 2_000,
  mortgageRate: 7.0,
  downPaymentPct: 20,
  housingMode: mode,
})

describe('calcBudget', () => {
  const budget = (mode: HousingMode) => calcBudget(baseInputs(mode))

  it('category totals equal the sum of their line items', () => {
    const b = budget('buy')
    for (const cat of [b.taxes, ...b.categories]) {
      const itemSum = cat.items.reduce((s, i) => s + i.monthly, 0)
      expect(cat.total).toBeCloseTo(itemSum, 6)
    }
  })

  it('surplus equals take-home minus all non-tax expenses', () => {
    const b = budget('rent')
    const nonTax = b.categories.reduce((s, c) => s + c.total, 0)
    expect(b.surplus).toBeCloseTo(b.takeHomeMonthly - nonTax, 6)
  })

  it('does not double-count expenses in the sinking-funds category', () => {
    // Regression: car registration, medical OOP, holiday gifts, and home repairs
    // were once listed both in their own category and under sinking funds
    for (const mode of ['rent', 'buy'] as const) {
      const sinking = budget(mode).categories.find(c => c.id === 'sinking')!
      const names = sinking.items.map(i => i.name.toLowerCase()).join(' | ')
      expect(names).not.toMatch(/registration|medical|holiday|home repair/)
    }
  })

  it('counts home maintenance exactly once in buy mode', () => {
    const b = budget('buy')
    // Home repairs live in Housing only — Sinking Funds must not repeat them
    const homeRepairItems = b.categories
      .filter(c => c.id === 'housing' || c.id === 'sinking')
      .flatMap(c => c.items)
      .filter(i => /repair|maintenance/i.test(i.name) && i.monthly > 0)
    expect(homeRepairItems).toHaveLength(1)
    // 1% of home value per year
    expect(homeRepairItems[0].monthly).toBeCloseTo((400_000 * 0.01) / 12, 2)
  })

  it('uses ZORI rent when renting and mortgage when buying', () => {
    const rent = budget('rent').categories.find(c => c.id === 'housing')!
    const buy  = budget('buy').categories.find(c => c.id === 'housing')!
    expect(rent.items.some(i => i.name === 'Rent' && i.monthly === 2_000)).toBe(true)
    expect(buy.items.some(i => i.name === 'Mortgage payment')).toBe(true)
  })

  it('falls back to 30% of gross when rent data is missing', () => {
    const b = calcBudget({ ...baseInputs('rent'), annualIncome: 120_000, avgRent: null })
    const housing = b.categories.find(c => c.id === 'housing')!
    const rentItem = housing.items.find(i => i.name === 'Rent')!
    expect(rentItem.monthly).toBeCloseTo((120_000 / 12) * 0.3, 6)
  })

  it('uses the per-state effective property tax rate', () => {
    const nj = calcBudget({ ...baseInputs('buy'), state: 'NJ' })
    const hi = calcBudget({ ...baseInputs('buy'), state: 'HI' })
    const propTax = (b: typeof nj) =>
      b.categories.find(c => c.id === 'housing')!.items
        .find(i => i.name === 'Property taxes')!.monthly
    expect(propTax(nj)).toBeCloseTo((400_000 * 0.0223) / 12, 2)
    expect(propTax(hi)).toBeCloseTo((400_000 * 0.0032) / 12, 2)
  })

  it('scales regional categories by the RPP multiplier', () => {
    const tx = budget('rent')
    const ca = calcBudget({ ...baseInputs('rent'), state: 'CA' })
    const groceries = (b: typeof tx) =>
      b.categories.find(c => c.id === 'food')!.items
        .find(i => i.name === 'Groceries')!.monthly
    expect(groceries(ca) / groceries(tx)).toBeCloseTo(
      rppMultiplier('CA') / rppMultiplier('TX'), 6,
    )
    // but transport (car payment) is not regionally scaled
    const carPayment = (b: typeof tx) =>
      b.categories.find(c => c.id === 'transport')!.items
        .find(i => i.name === 'Car payment (used)')!.monthly
    expect(carPayment(ca)).toBe(carPayment(tx))
  })

  it('household presets scale shared categories and add childcare for families', () => {
    const single = budget('rent')
    const family = calcBudget({ ...baseInputs('rent'), household: 'family' })
    const food = (b: typeof single) => b.categories.find(c => c.id === 'food')!.total
    expect(food(family)).toBeCloseTo(food(single) * 2.4, 4)

    const daycare = family.categories.find(c => c.id === 'childcare')!.items
      .find(i => i.name === 'Daycare / childcare')!
    expect(daycare.monthly).toBe(1_300)
    // single household has no childcare costs
    expect(single.categories.find(c => c.id === 'childcare')!.total).toBe(0)
  })

  it('applies user overrides last, exactly as given', () => {
    const b = calcBudget({
      ...baseInputs('rent'),
      household: 'family',
      overrides: {
        [itemKey('debt', 'Student loans')]: 0,
        [itemKey('food', 'Groceries')]: 999,
      },
    })
    const loans = b.categories.find(c => c.id === 'debt')!.items
      .find(i => i.name === 'Student loans')!
    expect(loans.monthly).toBe(0)
    const groceries = b.categories.find(c => c.id === 'food')!.items
      .find(i => i.name === 'Groceries')!
    expect(groceries.monthly).toBe(999)  // not multiplied by preset or RPP
  })

  it('married filing status lowers taxes vs single at the same income', () => {
    const single = calcBudget(baseInputs('rent'))
    const married = calcBudget({ ...baseInputs('rent'), filingStatus: 'married' })
    expect(married.taxes.total).toBeLessThan(single.taxes.total)
    expect(married.takeHomeMonthly).toBeGreaterThan(single.takeHomeMonthly)
  })
})
