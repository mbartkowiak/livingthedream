import { describe, it, expect } from 'vitest'
import { calcTaxes, monthlyTakeHome, STATE_TAX_RATES } from './taxCalc'

describe('calcTaxes', () => {
  it('computes 2024 federal tax for $100k single filer', () => {
    // taxable = 100,000 - 14,600 = 85,400
    // 11,600×10% + (47,150−11,600)×12% + (85,400−47,150)×22% = 13,841
    const t = calcTaxes(100_000, 'TX')
    expect(t.federal).toBe(13_841)
  })

  it('charges no state tax in no-income-tax states', () => {
    expect(calcTaxes(100_000, 'TX').state).toBe(0)
    expect(calcTaxes(100_000, 'FL').state).toBe(0)
    expect(calcTaxes(100_000, 'WA').state).toBe(0)
  })

  it('applies the state effective rate', () => {
    const t = calcTaxes(100_000, 'CA')
    expect(t.state).toBe(Math.round(100_000 * STATE_TAX_RATES.CA))
  })

  it('is case-insensitive for state and falls back to 5% for unknown states', () => {
    expect(calcTaxes(100_000, 'ca').state).toBe(calcTaxes(100_000, 'CA').state)
    expect(calcTaxes(100_000, 'ZZ').state).toBe(5_000)
  })

  it('caps Social Security at the wage base', () => {
    // 2024 wage base $168,600 × 6.2% = $10,453.20
    expect(calcTaxes(500_000, 'TX').socialSecurity).toBe(10_453)
  })

  it('owes no federal tax below the standard deduction', () => {
    expect(calcTaxes(14_000, 'TX').federal).toBe(0)
  })

  it('returns 0 effective rate (not NaN) for zero income', () => {
    const t = calcTaxes(0, 'TX')
    expect(t.total).toBe(0)
    expect(t.effectiveRate).toBe(0)
  })

  it('married filing jointly doubles the brackets and deduction', () => {
    // MFJ at $200k should equal 2× single at $100k for federal tax
    const single = calcTaxes(100_000, 'TX', 'single')
    const married = calcTaxes(200_000, 'TX', 'married')
    expect(married.federal).toBe(single.federal * 2)
  })

  it('married SS wage base applies per earner (income split evenly)', () => {
    // $400k married → 2 earners × $200k each, both capped at $168,600
    const t = calcTaxes(400_000, 'TX', 'married')
    expect(t.socialSecurity).toBe(Math.round(2 * 168_600 * 0.062))
    // below the cap, married and single FICA match
    expect(calcTaxes(100_000, 'TX', 'married').socialSecurity)
      .toBe(calcTaxes(100_000, 'TX', 'single').socialSecurity)
  })
})

describe('monthlyTakeHome', () => {
  it('equals (gross − total taxes) / 12', () => {
    const t = calcTaxes(80_000, 'CO')
    expect(monthlyTakeHome(80_000, 'CO')).toBeCloseTo((80_000 - t.total) / 12, 6)
  })
})
