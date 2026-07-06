/**
 * Rent vs. buy net-worth comparison over time.
 *
 * Buyer: pays down payment + closing costs, then mortgage + property tax +
 * insurance + maintenance; builds equity in an appreciating home (less ~6%
 * selling costs). Renter: invests the down payment + closing costs, pays rent
 * (growing yearly), and whichever side pays less each year invests the
 * difference. Break-even = first year the buyer's net position wins.
 */

import { calcMonthlyMortgage, HOME_INSURANCE_ANNUAL, MAINTENANCE_RATE } from './budgetCalc'

export interface BreakEvenInputs {
  homePrice:        number
  monthlyRent:      number
  mortgageRate:     number  // %, e.g. 7.0
  downPaymentPct:   number  // %, e.g. 20
  propertyTaxRate:  number  // annual fraction of value, e.g. 0.0075
  appreciationPct?: number  // annual home appreciation %, default 3.5
  rentGrowthPct?:   number  // annual rent growth %, default 3
  investReturnPct?: number  // annual return on renter's investments %, default 5
  years?:           number  // horizon, default 30
}

export const CLOSING_COST_RATE = 0.03  // buyer's closing costs
export const SELLING_COST_RATE = 0.06  // agent fees etc. when cashing out

export interface BreakEvenYear {
  year:        number
  buyNetWorth: number   // home equity (after selling costs) + buyer's investments
  rentNetWorth: number  // renter's investment portfolio
}

export interface BreakEvenResult {
  breakEvenYear: number | null   // null = renting wins for the whole horizon
  series: BreakEvenYear[]
  monthlyMortgage: number
}

export function calcBreakEven(inputs: BreakEvenInputs): BreakEvenResult {
  const {
    homePrice, monthlyRent, mortgageRate, downPaymentPct, propertyTaxRate,
    appreciationPct = 3.5, rentGrowthPct = 3, investReturnPct = 5, years = 30,
  } = inputs

  const down    = homePrice * downPaymentPct / 100
  const closing = homePrice * CLOSING_COST_RATE
  const loan    = homePrice - down
  const monthlyMortgage = calcMonthlyMortgage(homePrice, mortgageRate, downPaymentPct)

  const i = mortgageRate / 100 / 12
  const n = 360
  const loanBalance = (monthsPaid: number): number => {
    if (monthsPaid >= n) return 0
    if (i === 0) return loan * (1 - monthsPaid / n)
    const f = Math.pow(1 + i, n)
    const fk = Math.pow(1 + i, monthsPaid)
    return loan * (f - fk) / (f - 1)
  }

  const growth  = 1 + appreciationPct / 100
  const rentG   = 1 + rentGrowthPct / 100
  const invG    = 1 + investReturnPct / 100

  // Renter starts with the cash the buyer sank into the purchase
  let renterPortfolio = down + closing
  let buyerPortfolio  = 0
  const series: BreakEvenYear[] = []
  let breakEvenYear: number | null = null

  for (let year = 1; year <= years; year++) {
    const homeValue = homePrice * Math.pow(growth, year)
    const rentThisYear = monthlyRent * 12 * Math.pow(rentG, year - 1)
    const mortgageThisYear = year <= 30 ? monthlyMortgage * 12 : 0
    const carryingThisYear =
      homeValue * (propertyTaxRate + MAINTENANCE_RATE) + HOME_INSURANCE_ANNUAL
    const buyerOutflow = mortgageThisYear + carryingThisYear

    // Grow existing portfolios, then whichever side spent less invests the gap
    renterPortfolio *= invG
    buyerPortfolio  *= invG
    const diff = buyerOutflow - rentThisYear
    if (diff > 0) renterPortfolio += diff
    else buyerPortfolio += -diff

    const equityAfterSale = homeValue * (1 - SELLING_COST_RATE) - loanBalance(year * 12)
    const buyNetWorth  = equityAfterSale + buyerPortfolio
    const rentNetWorth = renterPortfolio

    series.push({ year, buyNetWorth, rentNetWorth })
    if (breakEvenYear === null && buyNetWorth >= rentNetWorth) breakEvenYear = year
  }

  return { breakEvenYear, series, monthlyMortgage }
}
