import { useState, useMemo } from 'react'
import {
  calcBudget, BudgetCategory, BudgetResult, BudgetInputs,
  itemKey, HouseholdPreset, HOUSEHOLD_LABELS, BudgetOverrides,
} from '../utils/budgetCalc'
import { FilingStatus } from '../utils/taxCalc'
import { HomePriceResult } from '../types'
import { formatCurrency as fmt } from '../utils/format'
import {
  NATIONAL_MEDIAN_SALARY, NATIONAL_MEDIAN_YEAR, DEFAULT_DOWN_PAYMENT_PCT,
} from '../utils/constants'
import { useMortgageRate } from '../hooks/useMortgageRate'
import { useBudgetPrefs } from '../hooks/useBudgetPrefs'

interface Props {
  result: HomePriceResult
}

function pct(n: number, total: number): string {
  if (!total) return '—'
  return `${((n / total) * 100).toFixed(1)}%`
}

// ── Editable line-item value ──────────────────────────────────────────────

function EditableValue({
  value, isOverridden, onSave, onClear,
}: {
  value: number
  isOverridden: boolean
  onSave: (v: number) => void
  onClear: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function commit() {
    const v = parseFloat(draft.replace(/[^\d.]/g, ''))
    if (!isNaN(v) && v >= 0) onSave(Math.round(v))
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        defaultValue={Math.round(value)}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-20 px-1 py-0.5 text-right text-xs border border-blue-400 rounded focus:outline-none"
      />
    )
  }

  return (
    <span className="whitespace-nowrap flex items-center gap-1">
      {isOverridden && (
        <button
          onClick={onClear}
          title="Reset to default"
          className="text-gray-300 hover:text-red-500 text-xs leading-none"
        >
          ✕
        </button>
      )}
      <button
        onClick={() => { setDraft(String(Math.round(value))); setEditing(true) }}
        title="Click to edit"
        className={`font-semibold hover:bg-blue-50 rounded px-1 -mx-1 ${
          value === 0 ? 'text-gray-300' : isOverridden ? 'text-blue-700' : 'text-gray-800'
        }`}
      >
        {value === 0 ? '—' : fmt(value)}
      </button>
    </span>
  )
}

// ── Category row (collapsible) ─────────────────────────────────────────────

function CategoryRow({
  cat, grossMonthly, expanded, onToggle, overrides, onOverride,
}: {
  cat: BudgetCategory
  grossMonthly: number
  expanded: boolean
  onToggle: () => void
  overrides?: BudgetOverrides
  onOverride?: (key: string, monthly: number | null) => void
}) {
  return (
    <div className="border-x border-b border-gray-200">
      {/* Category header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-2.5 ${cat.color} text-white text-sm font-semibold hover:opacity-90 transition-opacity`}
      >
        <span>{cat.name}</span>
        <span className="flex items-center gap-3">
          <span className="font-bold">{fmt(cat.total)}</span>
          <span className="text-xs opacity-75">{pct(cat.total, grossMonthly)} of gross</span>
          <span className="text-xs">{expanded ? '▲' : '▼'}</span>
        </span>
      </button>

      {/* Line items */}
      {expanded && (
        <div className="bg-white divide-y divide-gray-50">
          {cat.items.map((item, i) => {
            const key = itemKey(cat.id, item.name)
            const overridden = overrides ? key in overrides : false
            return (
              <div key={i} className="flex items-start justify-between px-4 py-2 text-xs">
                <div className="flex-1 min-w-0 pr-4">
                  <span className={`${item.monthly === 0 ? 'text-gray-400' : 'text-gray-700'}`}>
                    {item.name}
                  </span>
                  {item.note && (
                    <span className="ml-1 text-gray-400 italic">({item.note})</span>
                  )}
                  <p className="text-gray-400 mt-0.5 text-xs">
                    {overridden ? 'Your custom amount' : item.source}
                  </p>
                </div>
                {onOverride ? (
                  <EditableValue
                    value={item.monthly}
                    isOverridden={overridden}
                    onSave={v => onOverride(key, v)}
                    onClear={() => onOverride(key, null)}
                  />
                ) : (
                  <span className={`font-semibold whitespace-nowrap ${item.monthly === 0 ? 'text-gray-300' : 'text-gray-800'}`}>
                    {item.monthly === 0 ? '—' : fmt(item.monthly)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────

function BudgetColumn({
  label, sublabel, budget, grossMonthly, accent, overrides, onOverride,
}: {
  label: string
  sublabel: string
  budget: BudgetResult
  grossMonthly: number
  accent: string
  overrides: BudgetOverrides
  onOverride: (key: string, monthly: number | null) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const surplus = budget.surplus
  const surplusColor = surplus >= 0 ? 'text-emerald-700' : 'text-red-600'
  const surplusBg    = surplus >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'

  return (
    <div className="flex flex-col min-w-0">
      {/* Column header */}
      <div className={`${accent} text-white rounded-t-xl px-4 py-3`}>
        <p className="font-bold text-base">{label}</p>
        <p className="text-xs opacity-80 mt-0.5">{sublabel}</p>
      </div>

      {/* Income summary */}
      <div className="bg-gray-50 border-x border-gray-200 px-4 py-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-gray-500">Gross / month</p>
          <p className="font-bold text-gray-900">{fmt(budget.grossMonthly)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Take-home / month</p>
          <p className="font-bold text-gray-900">{fmt(budget.takeHomeMonthly)}</p>
        </div>
      </div>

      {/* Taxes row (not editable — computed) */}
      <CategoryRow
        cat={budget.taxes}
        grossMonthly={grossMonthly}
        expanded={expanded.has('taxes')}
        onToggle={() => toggle('taxes')}
      />

      {/* All other categories */}
      {budget.categories.map(cat => (
        <CategoryRow
          key={cat.id}
          cat={cat}
          grossMonthly={grossMonthly}
          expanded={expanded.has(cat.id)}
          onToggle={() => toggle(cat.id)}
          overrides={overrides}
          onOverride={onOverride}
        />
      ))}

      {/* Surplus / Deficit */}
      <div className={`border ${surplusBg} rounded-b-xl mx-0 px-4 py-3 border-x border-b border-gray-200`}>
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              {surplus >= 0 ? 'Monthly Surplus' : 'Monthly Deficit'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Take-home minus all non-tax expenses</p>
          </div>
          <div className="text-right">
            <p className={`text-xl font-bold ${surplusColor}`}>{fmt(Math.abs(surplus))}</p>
            <p className={`text-xs ${surplusColor}`}>{fmt(Math.abs(surplus * 12))} / year</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function BudgetPage({ result }: Props) {
  const [housingMode, setHousingMode] = useState<'rent' | 'buy'>('rent')
  const liveRate = useMortgageRate()
  const [rateInput, setRateInput] = useState('')
  const [downInput, setDownInput] = useState(String(DEFAULT_DOWN_PAYMENT_PCT))
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { prefs, update, setOverride, resetOverrides } = useBudgetPrefs()

  // Fall back to live/default values while inputs are empty/invalid so cleared
  // fields never push NaN into the budget math
  const parsedRate   = parseFloat(rateInput)
  const parsedDown   = parseFloat(downInput)
  const mortgageRate = parsedRate > 0 && parsedRate <= 20 ? parsedRate : liveRate.rate
  const downPayment  = parsedDown >= 0 && parsedDown < 100 ? parsedDown : DEFAULT_DOWN_PAYMENT_PCT

  const state = result.state || 'TX'

  const shared: Omit<BudgetInputs, 'annualIncome'> = useMemo(() => ({
    state,
    medianHomePrice: result.median_value,
    avgRent: result.avg_rent,
    mortgageRate,
    downPaymentPct: downPayment,
    housingMode,
    filingStatus: prefs.filingStatus,
    household: prefs.household,
    overrides: prefs.overrides,
  }), [state, result, mortgageRate, downPayment, housingMode, prefs])

  const areaBudget = useMemo(() =>
    result.avg_agi ? calcBudget({ ...shared, annualIncome: result.avg_agi }) : null,
    [shared, result.avg_agi]
  )

  const nationalBudget = useMemo(() =>
    calcBudget({ ...shared, annualIncome: NATIONAL_MEDIAN_SALARY }),
    [shared]
  )

  const location = [result.city, result.state].filter(Boolean).join(', ')
  const overrideCount = Object.keys(prefs.overrides).length

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-4">
        <h2 className="text-lg font-bold text-gray-900">
          Monthly Budget Analysis — {location || `ZIP ${result.zip_code}`}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Estimated monthly expenses using BLS, EIA, USDA, KFF and other national data sources,
          scaled to {state.toUpperCase()} price levels. Click any category to expand — then click
          any amount to customize it.
        </p>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap gap-4 items-end">
          {/* Housing toggle */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Housing scenario</p>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(['rent', 'buy'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setHousingMode(mode)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${housingMode === mode ? 'bg-blue-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {mode === 'rent' ? 'Renting' : 'Buying'}
                </button>
              ))}
            </div>
          </div>

          {/* Household preset */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Household</label>
            <select
              value={prefs.household}
              onChange={e => update({ household: e.target.value as HouseholdPreset })}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(Object.keys(HOUSEHOLD_LABELS) as HouseholdPreset[]).map(h => (
                <option key={h} value={h}>{HOUSEHOLD_LABELS[h]}</option>
              ))}
            </select>
          </div>

          {/* Filing status */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tax filing</label>
            <select
              value={prefs.filingStatus}
              onChange={e => update({ filingStatus: e.target.value as FilingStatus })}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="single">Single</option>
              <option value="married">Married filing jointly</option>
            </select>
          </div>

          {/* Advanced */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium pb-1.5"
          >
            {showAdvanced ? '▲ Hide' : '▼ Show'} mortgage options
          </button>

          {showAdvanced && (
            <div className="flex gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Interest rate (%)</label>
                <input
                  type="number" step="0.1" min="1" max="20"
                  value={rateInput}
                  placeholder={liveRate.rate.toFixed(2)}
                  onChange={e => setRateInput(e.target.value)}
                  className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Down payment (%)</label>
                <input
                  type="number" step="1" min="0" max="99"
                  value={downInput}
                  onChange={e => setDownInput(e.target.value)}
                  className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {overrideCount > 0 && (
            <button
              onClick={resetOverrides}
              className="text-sm text-red-600 hover:text-red-800 font-medium pb-1.5"
            >
              Reset {overrideCount} customization{overrideCount > 1 ? 's' : ''}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          * Assumes {HOUSEHOLD_LABELS[prefs.household].toLowerCase()}, one car.
          Live mortgage rate {liveRate.asOf ? `${liveRate.rate.toFixed(2)}% as of ${liveRate.asOf} (FRED)` : `${liveRate.rate.toFixed(1)}% default`}.
          Regional scaling: BEA price parities. Tax calculations use 2024 federal brackets + estimated state rates.
          Customized amounts are saved in your browser. Not financial advice.
        </p>
      </div>

      {/* Two-column comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {areaBudget ? (
          <BudgetColumn
            label={`Area Avg. Income — ${result.zip_code}`}
            sublabel={`${fmt(result.avg_agi!)} / yr · IRS SOI ${result.income_year}`}
            budget={areaBudget}
            grossMonthly={areaBudget.grossMonthly}
            accent="bg-emerald-800"
            overrides={prefs.overrides}
            onOverride={setOverride}
          />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            No IRS income data available for this ZIP code.
          </div>
        )}

        <BudgetColumn
          label="National Median Earner"
          sublabel={`${fmt(NATIONAL_MEDIAN_SALARY)} / yr · BLS CPS ${NATIONAL_MEDIAN_YEAR}`}
          budget={nationalBudget}
          grossMonthly={nationalBudget.grossMonthly}
          accent="bg-blue-800"
          overrides={prefs.overrides}
          onOverride={setOverride}
        />
      </div>
    </div>
  )
}
