import { useState, useMemo } from 'react'
import { calcBudget } from '../utils/budgetCalc'

interface Props {
  medianHomePrice: number
  areaAvgIncome:   number | null
  incomeYear:      string | null
  avgRent:         number | null
  state:           string          // e.g. "CA" — needed for state income tax
}

// ── National median salary ─────────────────────────────────────────────────
// Source: BLS Current Population Survey, 2023 Annual
// Update annually: https://www.bls.gov/cps/cpsaat37.htm
const NATIONAL_MEDIAN_SALARY = 59_228
const NATIONAL_MEDIAN_YEAR   = '2023'

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)
}

function formatPct(n: number, decimals = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
}

/** Pull the housing category total and compute leftover for housing */
function budgetAffordability(
  annualIncome:    number,
  state:           string,
  medianHomePrice: number,
  avgRent:         number | null,
  rate:            number,
  down:            number,
  housingMode:     'rent' | 'buy',
) {
  const budget = calcBudget(
    annualIncome, state, medianHomePrice, avgRent, rate, down, housingMode,
  )
  const housingCost    = budget.categories.find(c => c.id === 'housing')?.total ?? 0
  const nonHousing     = budget.categories
    .filter(c => c.id !== 'housing')
    .reduce((s, c) => s + c.total, 0)
  const availableForHousing = budget.takeHomeMonthly - nonHousing
  const canAfford      = availableForHousing >= housingCost
  const gap            = Math.abs(availableForHousing - housingCost)
  // Salary that would make availableForHousing === housingCost (binary search)
  let salaryNeeded = annualIncome
  if (!canAfford) {
    let lo = annualIncome, hi = annualIncome * 10
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      const b2  = calcBudget(mid, state, medianHomePrice, avgRent, rate, down, housingMode)
      const nh2 = b2.categories.filter(c => c.id !== 'housing').reduce((s, c) => s + c.total, 0)
      const avail2 = b2.takeHomeMonthly - nh2
      const hc2    = b2.categories.find(c => c.id === 'housing')?.total ?? 0
      if (avail2 >= hc2) hi = mid; else lo = mid
    }
    salaryNeeded = Math.ceil((lo + hi) / 2)
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

// ── Snapshot banner (area / national) ─────────────────────────────────────
function ContextBanner({
  label, income, incomeLabel,
  medianHomePrice, avgRent, state, rate, down, housingMode,
  colorAfford, colorNot,
}: {
  label: string; income: number; incomeLabel: string
  medianHomePrice: number; avgRent: number | null; state: string
  rate: number; down: number; housingMode: 'rent' | 'buy'
  colorAfford: string; colorNot: string
}) {
  const aff = useMemo(
    () => budgetAffordability(income, state, medianHomePrice, avgRent, rate, down, housingMode),
    [income, state, medianHomePrice, avgRent, rate, down, housingMode],
  )
  const color = aff.canAfford ? colorAfford : colorNot
  return (
    <div className={`rounded-lg px-5 py-4 border ${color}`}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-70">{label}</p>
      <p className="font-bold text-base">
        {aff.canAfford
          ? `At ${incomeLabel}, a typical household can realistically afford a home here.`
          : `At ${incomeLabel}, a typical household cannot realistically afford a home here.`
        }
      </p>
      <div className="text-xs mt-2 space-y-0.5 opacity-80">
        <p>Take-home: {fmt(aff.takeHome)}/mo · Non-housing expenses: {fmt(aff.nonHousing)}/mo</p>
        <p>
          Left for housing: <strong>{fmt(aff.availableForHousing)}/mo</strong>
          {' '}vs. actual {housingMode === 'buy' ? 'mortgage + costs' : 'rent'}: <strong>{fmt(aff.housingCost)}/mo</strong>
          {aff.canAfford
            ? ` — ${fmt(aff.gap)} to spare`
            : ` — ${fmt(aff.gap)} short`}
        </p>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function AffordabilityPanel({
  medianHomePrice, areaAvgIncome, incomeYear, avgRent, state,
}: Props) {
  const [salary,      setSalary]      = useState('')
  const [rate,        setRate]        = useState('7.0')
  const [downPayment, setDownPayment] = useState('20')
  const [housingMode, setHousingMode] = useState<'rent' | 'buy'>('buy')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const r = parseFloat(rate)
  const d = parseFloat(downPayment)

  const userAff = useMemo(() => {
    const s = parseFloat(salary.replace(/,/g, ''))
    if (!s || s <= 0 || !r || r <= 0 || isNaN(d) || d < 0 || d >= 100) return null
    return {
      s,
      ...budgetAffordability(s, state, medianHomePrice, avgRent, r, d, housingMode),
    }
  }, [salary, state, medianHomePrice, avgRent, r, d, housingMode])

  const validParams = r > 0 && !isNaN(d) && d >= 0 && d < 100

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-800 px-6 py-3">
        <h3 className="text-white font-semibold">Affordability Calculator</h3>
        <p className="text-gray-400 text-xs mt-0.5">
          Full budget analysis — accounts for taxes, living expenses, and actual take-home pay
        </p>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* Housing mode toggle */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Housing scenario</p>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
            {(['buy', 'rent'] as const).map(mode => (
              <button key={mode}
                onClick={() => setHousingMode(mode)}
                className={`px-5 py-1.5 text-sm font-medium transition-colors
                  ${housingMode === mode ? 'bg-blue-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {mode === 'buy' ? 'Buying' : 'Renting'}
              </button>
            ))}
          </div>
        </div>

        {/* Area income snapshot */}
        {areaAvgIncome && validParams && (
          <ContextBanner
            label={`Area Avg. Income Snapshot · IRS ${incomeYear}`}
            income={areaAvgIncome}
            incomeLabel={`${fmt(areaAvgIncome)}/yr area avg.`}
            medianHomePrice={medianHomePrice}
            avgRent={avgRent}
            state={state}
            rate={r} down={d} housingMode={housingMode}
            colorAfford="bg-green-50 border-green-200 text-green-800"
            colorNot="bg-amber-50 border-amber-200 text-amber-800"
          />
        )}

        {/* National median snapshot */}
        {validParams && (
          <ContextBanner
            label={`National Median Earner · BLS ${NATIONAL_MEDIAN_YEAR}`}
            income={NATIONAL_MEDIAN_SALARY}
            incomeLabel={`${fmt(NATIONAL_MEDIAN_SALARY)}/yr national median`}
            medianHomePrice={medianHomePrice}
            avgRent={avgRent}
            state={state}
            rate={r} down={d} housingMode={housingMode}
            colorAfford="bg-green-50 border-green-200 text-green-800"
            colorNot="bg-rose-50 border-rose-200 text-rose-800"
          />
        )}

        {/* Salary input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your Annual Gross Salary
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
            <input
              type="text" inputMode="numeric"
              value={salary}
              onChange={e => setSalary(e.target.value.replace(/[^\d,]/g, ''))}
              placeholder="75,000"
              className="w-full pl-7 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Advanced toggle */}
        <button type="button" onClick={() => setShowAdvanced(v => !v)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          {showAdvanced ? '▲ Hide' : '▼ Show'} advanced options
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interest Rate (%)</label>
              <input type="number" step="0.1" min="1" max="20" value={rate}
                onChange={e => setRate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Down Payment (%)</label>
              <input type="number" step="0.5" min="0" max="99" value={downPayment}
                onChange={e => setDownPayment(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Your personal results */}
        {userAff && (
          <div className="space-y-4 pt-1">

            {/* Primary verdict — full budget */}
            <div className={`rounded-lg px-5 py-4 border ${userAff.canAfford ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${userAff.canAfford ? 'text-green-600' : 'text-red-600'}`}>
                Your Full Budget Analysis
              </p>
              <p className={`text-lg font-bold ${userAff.canAfford ? 'text-green-800' : 'text-red-800'}`}>
                {userAff.canAfford
                  ? `✓ You can realistically afford a home here`
                  : `✗ This area is out of reach based on your full budget`}
              </p>
              <p className={`text-sm mt-1 ${userAff.canAfford ? 'text-green-700' : 'text-red-700'}`}>
                {userAff.canAfford
                  ? `After all expenses you have ${fmt(userAff.availableForHousing)}/mo for housing — ${fmt(userAff.gap)} more than the ${housingMode === 'buy' ? 'mortgage + costs' : 'rent'} of ${fmt(userAff.housingCost)}/mo.`
                  : `After all expenses you only have ${fmt(userAff.availableForHousing)}/mo for housing but ${housingMode === 'buy' ? 'mortgage + costs run' : 'rent runs'} ${fmt(userAff.housingCost)}/mo — a ${fmt(userAff.gap)} shortfall. You'd need ~${fmt(userAff.salaryNeeded)}/yr.`
                }
              </p>
            </div>

            {/* Budget flow breakdown */}
            <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Where Your Money Goes Each Month
                </p>
              </div>
              <div className="divide-y divide-gray-100 px-4">
                <Row label="Gross monthly income"           value={fmt(userAff.grossMonthly)} />
                <Row label="Taxes (federal + state + FICA)" value={`− ${fmt(userAff.taxMonthly)}`}   highlight />
                <Row label="Take-home pay"                  value={fmt(userAff.takeHome)}    bold />
                <Row label="All non-housing expenses"       value={`− ${fmt(userAff.nonHousing)}`}    highlight sub="See Budget Analysis tab for full breakdown" />
                <Row label="Left for housing"               value={fmt(userAff.availableForHousing)}  bold />
                <Row
                  label={housingMode === 'buy' ? 'Mortgage + taxes + insurance + maintenance' : 'Avg. rent (Zillow ZORI)'}
                  value={fmt(userAff.housingCost)}
                  sub={housingMode === 'buy' ? `${downPayment}% down · ${rate}% rate · 30 yr · 1.1% prop tax · 1% maintenance` : 'Zillow ZORI data'}
                  highlight={!userAff.canAfford}
                />
                <Row
                  label={userAff.canAfford ? 'Monthly surplus after housing' : 'Monthly shortfall'}
                  value={fmt(Math.abs(userAff.availableForHousing - userAff.housingCost))}
                  bold
                  highlight={!userAff.canAfford}
                />
              </div>
            </div>

            {/* Salary comparisons */}
            <div className="divide-y divide-gray-100 text-sm">
              {areaAvgIncome && (
                <Row
                  label="Your salary vs. area average"
                  value={formatPct(((userAff.s - areaAvgIncome) / areaAvgIncome) * 100)}
                  sub={`Area avg: ${fmt(areaAvgIncome)}`}
                  highlight={userAff.s < areaAvgIncome * 0.8}
                />
              )}
              <Row
                label="Your salary vs. national median"
                value={formatPct(((userAff.s - NATIONAL_MEDIAN_SALARY) / NATIONAL_MEDIAN_SALARY) * 100)}
                sub={`National median: ${fmt(NATIONAL_MEDIAN_SALARY)} (BLS ${NATIONAL_MEDIAN_YEAR})`}
                highlight={userAff.s < NATIONAL_MEDIAN_SALARY}
              />
              {!userAff.canAfford && (
                <Row
                  label="Salary needed to afford this ZIP"
                  value={fmt(userAff.salaryNeeded)}
                  sub="Full budget analysis — not just the 30% rule"
                  highlight
                />
              )}
            </div>

            {/* Rent vs buy (if both data points exist) */}
            {avgRent && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Rent vs. Buy — Monthly Housing Cost
                  </p>
                </div>
                {(() => {
                  const rentAff = budgetAffordability(userAff.s, state, medianHomePrice, avgRent, r, d, 'rent')
                  const buyAff  = budgetAffordability(userAff.s, state, medianHomePrice, avgRent, r, d, 'buy')
                  const diff    = buyAff.housingCost - rentAff.housingCost
                  return (
                    <div className="divide-y divide-gray-100 text-sm px-4">
                      <Row label="Avg. monthly rent"               value={fmt(rentAff.housingCost)} sub="Zillow ZORI" />
                      <Row label="Monthly mortgage + costs (buy)"  value={fmt(buyAff.housingCost)}  sub={`${downPayment}% down · ${rate}% · prop tax · insurance · maintenance`} />
                      <Row
                        label={diff > 0 ? 'Renting saves per month' : 'Buying saves per month'}
                        value={fmt(Math.abs(diff))}
                        sub="Payment comparison only — buying builds equity over time"
                        highlight={diff > 0}
                      />
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({
  label, value, sub, highlight, bold,
}: {
  label: string; value: string; sub?: string; highlight?: boolean; bold?: boolean
}) {
  return (
    <div className="flex justify-between items-start py-2.5">
      <div>
        <span className={`${bold ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>{label}</span>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <span className={`ml-4 whitespace-nowrap ${bold ? 'font-bold text-gray-900' : 'font-semibold'} ${highlight ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}
