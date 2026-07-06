import { useState, FormEvent } from 'react'
import { fetchHomePrice } from '../api'
import { HomePriceResult } from '../types'
import { budgetAffordability } from '../utils/affordability'
import { propertyTaxRate } from '../utils/stateData'
import { formatCurrency as fmt } from '../utils/format'
import { HousingMode } from '../utils/budgetCalc'
import { useMortgageRate } from '../hooks/useMortgageRate'
import { useBudgetPrefs } from '../hooks/useBudgetPrefs'
import { DEFAULT_DOWN_PAYMENT_PCT } from '../utils/constants'

const MAX_ZIPS = 3
// Probe income for "salary needed": low enough that the binary search finds the
// real requirement in any US market
const PROBE_INCOME = 20_000

interface Props {
  initialZip?: string
  onViewZip: (zip: string) => void
}

export default function ComparePage({ initialZip, onViewZip }: Props) {
  const [results, setResults] = useState<HomePriceResult[]>([])
  const [zipInput, setZipInput] = useState(initialZip ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [housingMode, setHousingMode] = useState<HousingMode>('buy')
  const liveRate = useMortgageRate()
  const { prefs } = useBudgetPrefs()

  async function addZip(e: FormEvent) {
    e.preventDefault()
    const zip = zipInput.trim()
    if (!/^\d{5}$/.test(zip)) {
      setError('Enter a 5-digit ZIP code')
      return
    }
    if (results.some(r => r.zip_code === zip)) {
      setError('Already comparing that ZIP')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await fetchHomePrice(zip)
      setResults(prev => [...prev, r].slice(0, MAX_ZIPS))
      setZipInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  function remove(zip: string) {
    setResults(prev => prev.filter(r => r.zip_code !== zip))
  }

  const salaryNeeded = (r: HomePriceResult): number =>
    budgetAffordability({
      annualIncome: PROBE_INCOME,
      state: r.state || 'TX',
      medianHomePrice: r.median_value,
      avgRent: r.avg_rent,
      mortgageRate: liveRate.rate,
      downPaymentPct: DEFAULT_DOWN_PAYMENT_PCT,
      housingMode,
      filingStatus: prefs.filingStatus,
      household: prefs.household,
      overrides: prefs.overrides,
    }).salaryNeeded

  const rows: { label: string; render: (r: HomePriceResult) => string; highlightMin?: boolean }[] = [
    { label: 'Median home value', render: r => fmt(r.median_value), highlightMin: true },
    { label: 'Avg. monthly rent', render: r => r.avg_rent ? fmt(r.avg_rent) : '—', highlightMin: true },
    { label: 'Avg. household income', render: r => r.avg_agi ? fmt(r.avg_agi) : '—' },
    {
      label: 'Price-to-income ratio',
      render: r => r.avg_agi ? `${(r.median_value / r.avg_agi).toFixed(1)}×` : '—',
    },
    {
      label: 'Property tax rate',
      render: r => `${(propertyTaxRate(r.state || '') * 100).toFixed(2)}%`,
    },
    {
      label: `Salary needed (${housingMode === 'buy' ? 'buying' : 'renting'})`,
      render: r => fmt(salaryNeeded(r)),
      highlightMin: true,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-4">
        <h2 className="text-lg font-bold text-gray-900">Compare ZIP Codes</h2>
        <p className="text-sm text-gray-500 mt-1">
          Compare up to {MAX_ZIPS} areas side by side — prices, incomes, and the salary your
          full budget would need in each.
        </p>

        <div className="mt-4 flex flex-wrap gap-4 items-end">
          <form onSubmit={addZip} className="flex gap-2">
            <input
              type="text" inputMode="numeric" maxLength={5}
              value={zipInput}
              onChange={e => { setZipInput(e.target.value.replace(/\D/g, '').slice(0, 5)); setError(null) }}
              placeholder="Add ZIP…"
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading || results.length >= MAX_ZIPS}
              className="px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {loading ? 'Adding…' : '+ Add'}
            </button>
          </form>

          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {(['buy', 'rent'] as const).map(mode => (
              <button key={mode}
                onClick={() => setHousingMode(mode)}
                className={`px-4 py-2 text-sm font-medium transition-colors
                  ${housingMode === mode ? 'bg-blue-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {mode === 'buy' ? 'Buying' : 'Renting'}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {results.length >= MAX_ZIPS && (
          <p className="mt-2 text-xs text-gray-400">Maximum of {MAX_ZIPS} — remove one to add another.</p>
        )}
      </div>

      {results.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          Add a ZIP code above to start comparing.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 w-48">
                  Metric
                </th>
                {results.map(r => (
                  <th key={r.zip_code} className="px-5 py-3 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-gray-900">
                          {[r.city, r.state].filter(Boolean).join(', ') || r.zip_code}
                        </p>
                        <button
                          onClick={() => onViewZip(r.zip_code)}
                          className="text-xs text-blue-600 hover:underline font-medium"
                        >
                          ZIP {r.zip_code} — view →
                        </button>
                      </div>
                      <button
                        onClick={() => remove(r.zip_code)}
                        title="Remove"
                        className="text-gray-300 hover:text-red-500 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => {
                // Highlight the cheapest / lowest-requirement column
                const values = results.map(r => row.render(r))
                let minIdx = -1
                if (row.highlightMin && results.length > 1) {
                  const nums = values.map(v => parseFloat(v.replace(/[^0-9.]/g, '')))
                  const valid = nums.filter(n => !isNaN(n))
                  if (valid.length > 1) {
                    const min = Math.min(...valid)
                    minIdx = nums.findIndex(n => n === min)
                  }
                }
                return (
                  <tr key={row.label}>
                    <td className="px-5 py-3 text-gray-600">{row.label}</td>
                    {values.map((v, i) => (
                      <td key={i} className={`px-5 py-3 font-semibold ${i === minIdx ? 'text-emerald-700' : 'text-gray-900'}`}>
                        {v}{i === minIdx && <span className="ml-1.5 text-xs font-medium text-emerald-600">lowest</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {results.length > 0 && (
        <p className="text-xs text-gray-400 px-1">
          Salary needed uses the full budget model ({prefs.household} household,{' '}
          {prefs.filingStatus === 'married' ? 'married filing jointly' : 'single filer'},{' '}
          {liveRate.rate.toFixed(2)}% mortgage, {DEFAULT_DOWN_PAYMENT_PCT}% down) — change these on the other tabs.
        </p>
      )}
    </div>
  )
}
