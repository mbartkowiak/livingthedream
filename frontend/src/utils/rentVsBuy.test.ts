import { describe, it, expect } from 'vitest'
import { calcBreakEven } from './rentVsBuy'

const base = {
  homePrice: 400_000,
  monthlyRent: 2_000,
  mortgageRate: 7.0,
  downPaymentPct: 20,
  propertyTaxRate: 0.011,
}

describe('calcBreakEven', () => {
  it('produces a full series with both net-worth tracks', () => {
    const r = calcBreakEven(base)
    expect(r.series).toHaveLength(30)
    expect(r.series[0].year).toBe(1)
    expect(r.monthlyMortgage).toBeCloseTo(2_128.97, 0)
  })

  it('buying a cheap home vs high rent breaks even quickly', () => {
    const r = calcBreakEven({ ...base, homePrice: 200_000, monthlyRent: 3_000 })
    expect(r.breakEvenYear).not.toBeNull()
    expect(r.breakEvenYear!).toBeLessThanOrEqual(3)
  })

  it('an overpriced home vs cheap rent takes far longer (or never)', () => {
    const cheap = calcBreakEven({ ...base, homePrice: 250_000 })
    const pricey = calcBreakEven({ ...base, homePrice: 900_000, monthlyRent: 1_500 })
    const cheapYear = cheap.breakEvenYear ?? Infinity
    const priceyYear = pricey.breakEvenYear ?? Infinity
    expect(priceyYear).toBeGreaterThan(cheapYear)
  })

  it('higher appreciation moves break-even earlier (or equal)', () => {
    const slow = calcBreakEven({ ...base, appreciationPct: 1 })
    const fast = calcBreakEven({ ...base, appreciationPct: 6 })
    const slowYear = slow.breakEvenYear ?? Infinity
    const fastYear = fast.breakEvenYear ?? Infinity
    expect(fastYear).toBeLessThanOrEqual(slowYear)
    // and the 30-year buyer outcome is strictly better with faster appreciation
    expect(fast.series[29].buyNetWorth).toBeGreaterThan(slow.series[29].buyNetWorth)
  })

  it('net worths are finite and the loan pays off by year 30', () => {
    const r = calcBreakEven({ ...base, years: 30 })
    for (const y of r.series) {
      expect(Number.isFinite(y.buyNetWorth)).toBe(true)
      expect(Number.isFinite(y.rentNetWorth)).toBe(true)
    }
    // by year 30 equity ≈ full (appreciated) home value less selling costs
    const last = r.series[29]
    const homeValue30 = 400_000 * Math.pow(1.035, 30)
    expect(last.buyNetWorth).toBeGreaterThan(homeValue30 * 0.9)
  })
})
