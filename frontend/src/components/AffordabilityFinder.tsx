import { useRef, useState, FormEvent } from 'react'
import { fetchAffordableZips, AffordableZipsResponse } from '../api'
import { maxAffordable } from '../utils/affordability'
import { ALL_STATES } from '../utils/stateData'
import { HousingMode } from '../utils/budgetCalc'
import { formatCurrency as fmt } from '../utils/format'
import { useMortgageRate } from '../hooks/useMortgageRate'
import { useBudgetPrefs } from '../hooks/useBudgetPrefs'
import { DEFAULT_DOWN_PAYMENT_PCT } from '../utils/constants'

interface Props {
  onViewZip: (zip: string) => void
}

export default function AffordabilityFinder({ onViewZip }: Props) {
  const [salary, setSalary] = useState('')
  const [housingMode, setHousingMode] = useState<HousingMode>('buy')
  const [stateFilter, setStateFilter] = useState('')
  const [data, setData] = useState<AffordableZipsResponse | null>(null)
  const [searchedSalary, setSearchedSalary] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)
  const liveRate = useMortgageRate()
  const { prefs } = useBudgetPrefs()

  async function search(e: FormEvent) {
    e.preventDefault()
    const income = parseFloat(salary.replace(/,/g, ''))
    if (!income || income <= 0) {
      setError('Enter your annual salary')
      return
    }

    // Budget math stays client-side: compute the max affordable price/rent per
    // state (taxes, property tax, and price levels differ), then the backend
    // just filters ZIPs against those caps.
    const thresholds: Record<string, number> = {}
    for (const st of ALL_STATES) {
      const { maxPrice, maxRent } = maxAffordable({
        annualIncome: income,
        state: st,
        mortgageRate: liveRate.rate,
        downPaymentPct: DEFAULT_DOWN_PAYMENT_PCT,
        filingStatus: prefs.filingStatus,
        household: prefs.household,
        overrides: prefs.overrides,
      })
      const cap = housingMode === 'buy' ? maxPrice : maxRent
      if (cap > 0) thresholds[st] = Math.round(cap)
    }

    if (Object.keys(thresholds).length === 0) {
      setData({ total: 0, by_state: [], results: [] })
      setSearchedSalary(income)
      return
    }

    ctrlRef.current?.abort()
    const controller = new AbortController()
    ctrlRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const resp = await fetchAffordableZips({
        mode: housingMode,
        thresholds,
        state: stateFilter || undefined,
        limit: 100,
      }, controller.signal)
      setData(resp)
      setSearchedSalary(income)
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Search failed')
      }
    } finally {
      if (ctrlRef.current === controller) setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-4">
        <h2 className="text-lg font-bold text-gray-900">Where Can I Afford to Live?</h2>
        <p className="text-sm text-gray-500 mt-1">
          Enter your salary and see every ZIP code your full budget can handle —
          taxes, cost of living, and housing costs are computed per state.
        </p>

        <form onSubmit={search} className="mt-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Annual gross salary</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
              <input
                type="text" inputMode="numeric"
                value={salary}
                onChange={e => setSalary(e.target.value.replace(/[^\d,]/g, ''))}
                placeholder="75,000"
                className="w-40 pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">I want to</p>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(['buy', 'rent'] as const).map(mode => (
                <button key={mode} type="button"
                  onClick={() => setHousingMode(mode)}
                  className={`px-4 py-2 text-sm font-medium transition-colors
                    ${housingMode === mode ? 'bg-blue-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {mode === 'buy' ? 'Buy' : 'Rent'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              className="px-2 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All states</option>
              {[...ALL_STATES].sort().map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50"
          >
            {loading ? 'Searching…' : 'Find ZIPs'}
          </button>
        </form>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="text-xs text-gray-400 mt-3">
          Uses your saved budget settings ({prefs.household} household,{' '}
          {prefs.filingStatus === 'married' ? 'married filing jointly' : 'single filer'}),{' '}
          {liveRate.rate.toFixed(2)}% mortgage rate, {DEFAULT_DOWN_PAYMENT_PCT}% down.
        </p>
      </div>

      {data && searchedSalary !== null && (
        <>
          {/* Headline + state distribution */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-4">
            <p className="text-gray-900">
              <span className="text-2xl font-bold">{data.total.toLocaleString()}</span>
              <span className="text-gray-500 text-sm ml-2">
                ZIP codes fit a {fmt(searchedSalary)}/yr budget
                ({housingMode === 'buy' ? 'buying' : 'renting'})
                {stateFilter && ` in ${stateFilter}`}
              </span>
            </p>
            {!stateFilter && data.by_state.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {data.by_state.slice(0, 12).map(s => (
                  <button
                    key={s.state}
                    onClick={() => setStateFilter(s.state)}
                    className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-medium hover:bg-blue-100"
                    title={`Filter to ${s.state}`}
                  >
                    {s.state} · {s.count.toLocaleString()}
                  </button>
                ))}
                {data.by_state.length > 12 && (
                  <span className="px-2 py-1 text-xs text-gray-400">
                    +{data.by_state.length - 12} more states
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Results table */}
          {data.results.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Top {data.results.length} — the most expensive areas still inside your budget
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-5 py-2 font-semibold">Location</th>
                    <th className="px-5 py-2 font-semibold">Metro</th>
                    <th className="px-5 py-2 font-semibold text-right">Home value</th>
                    <th className="px-5 py-2 font-semibold text-right">Rent</th>
                    <th className="px-5 py-2 font-semibold text-right">Area income</th>
                    <th className="px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.results.map(r => (
                    <tr key={r.zip_code} className="hover:bg-blue-50/40">
                      <td className="px-5 py-2.5">
                        <span className="font-semibold text-gray-900">
                          {[r.city, r.state].filter(Boolean).join(', ')}
                        </span>
                        <span className="text-gray-400 ml-1.5 text-xs">{r.zip_code}</span>
                      </td>
                      <td className="px-5 py-2.5 text-gray-500 text-xs">{r.metro || '—'}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{fmt(r.median_value)}</td>
                      <td className="px-5 py-2.5 text-right text-gray-700">{r.avg_rent ? fmt(r.avg_rent) : '—'}</td>
                      <td className="px-5 py-2.5 text-right text-gray-700">{r.avg_agi ? fmt(r.avg_agi) : '—'}</td>
                      <td className="px-5 py-2.5 text-right">
                        <button
                          onClick={() => onViewZip(r.zip_code)}
                          className="text-blue-600 hover:underline text-xs font-semibold"
                        >
                          view →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
              No ZIP codes fit this budget{stateFilter && ` in ${stateFilter}`}.
              Try renting, a different state, or adjusting your budget on the Budget Analysis tab.
            </div>
          )}
        </>
      )}
    </div>
  )
}
