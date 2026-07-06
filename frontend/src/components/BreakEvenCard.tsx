import { useMemo, useState } from 'react'
import { calcBreakEven } from '../utils/rentVsBuy'
import { propertyTaxRate } from '../utils/stateData'
import { appreciationStats } from '../utils/history'
import { formatCurrency as fmt } from '../utils/format'
import { useMortgageRate } from '../hooks/useMortgageRate'
import { HistoryPoint } from '../api'
import { DEFAULT_DOWN_PAYMENT_PCT } from '../utils/constants'

interface Props {
  homePrice: number
  avgRent: number
  state: string
  history: HistoryPoint[]
}

const DEFAULT_APPRECIATION = 3.5

export default function BreakEvenCard({ homePrice, avgRent, state, history }: Props) {
  const liveRate = useMortgageRate()
  const [horizonOpen, setHorizonOpen] = useState(false)

  const { cagr5 } = useMemo(() => appreciationStats(history), [history])
  const appreciation = cagr5 ?? DEFAULT_APPRECIATION
  // clamp: past 5 years aren't a promise — keep projections sober
  const projected = Math.max(-2, Math.min(8, appreciation))

  const result = useMemo(() => calcBreakEven({
    homePrice,
    monthlyRent: avgRent,
    mortgageRate: liveRate.rate,
    downPaymentPct: DEFAULT_DOWN_PAYMENT_PCT,
    propertyTaxRate: propertyTaxRate(state),
    appreciationPct: projected,
  }), [homePrice, avgRent, liveRate.rate, state, projected])

  const { breakEvenYear, series, monthlyMortgage } = result
  const at = (year: number) => series[year - 1]

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
      <div className="bg-gray-800 px-6 py-3 flex items-baseline justify-between">
        <h3 className="text-white font-semibold">Rent vs. Buy — Break-Even</h3>
        <span className="text-gray-400 text-xs">equity, appreciation & opportunity cost</span>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div className={`rounded-lg px-5 py-4 border ${
          breakEvenYear !== null && breakEvenYear <= 7
            ? 'bg-green-50 border-green-200'
            : breakEvenYear !== null
              ? 'bg-amber-50 border-amber-200'
              : 'bg-rose-50 border-rose-200'
        }`}>
          <p className="text-lg font-bold text-gray-900">
            {breakEvenYear !== null
              ? `Buying beats renting after ~${breakEvenYear} year${breakEvenYear > 1 ? 's' : ''}`
              : 'Renting wins for the entire 30-year horizon'}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {breakEvenYear !== null
              ? `If you'll stay ${breakEvenYear}+ years, buying likely builds more net worth than renting and investing the difference.`
              : 'At these prices and rents, renting and investing the savings comes out ahead.'}
          </p>
        </div>

        <div className="divide-y divide-gray-100 text-sm">
          <Row label="Monthly mortgage payment" value={fmt(monthlyMortgage)}
            sub={`${DEFAULT_DOWN_PAYMENT_PCT}% down · ${liveRate.rate.toFixed(2)}% · 30 yr`} />
          <Row label="Avg. monthly rent" value={fmt(avgRent)} sub="Zillow ZORI" />
          <Row label="Projected home appreciation" value={`${projected.toFixed(1)}%/yr`}
            sub={cagr5 !== null
              ? `Based on this ZIP's 5-yr history (${cagr5.toFixed(1)}%/yr, clamped to ±sane bounds)`
              : 'National long-run default'} />
        </div>

        <button
          onClick={() => setHorizonOpen(v => !v)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          {horizonOpen ? '▲ Hide' : '▼ Show'} net-worth projection
        </button>

        {horizonOpen && (
          <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
            <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span>After</span><span className="text-right">Buyer</span><span className="text-right">Renter</span>
            </div>
            {[5, 10, 20, 30].map(y => {
              const p = at(y)
              const buyerWins = p.buyNetWorth >= p.rentNetWorth
              return (
                <div key={y} className="grid grid-cols-3 px-4 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-gray-600">{y} years</span>
                  <span className={`text-right font-semibold ${buyerWins ? 'text-emerald-700' : 'text-gray-800'}`}>
                    {fmt(p.buyNetWorth)}
                  </span>
                  <span className={`text-right font-semibold ${!buyerWins ? 'text-emerald-700' : 'text-gray-800'}`}>
                    {fmt(p.rentNetWorth)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-xs text-gray-400">
          Buyer: {DEFAULT_DOWN_PAYMENT_PCT}% down + 3% closing, {(propertyTaxRate(state) * 100).toFixed(2)}% property tax,
          1% maintenance, 6% selling costs on exit. Renter: invests the down payment + monthly savings at 5%/yr;
          rent grows 3%/yr. Rough model — not financial advice.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex justify-between items-start py-2.5">
      <div>
        <span className="text-gray-600">{label}</span>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <span className="ml-4 whitespace-nowrap font-semibold text-gray-900">{value}</span>
    </div>
  )
}
