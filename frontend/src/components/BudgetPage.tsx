import { useState, useMemo } from 'react'
import { calcBudget, BudgetCategory, BudgetResult } from '../utils/budgetCalc'
import { HomePriceResult } from '../types'

const NATIONAL_MEDIAN_SALARY = 59_228
const NATIONAL_MEDIAN_YEAR   = '2023'
const DEFAULT_RATE           = 7.0
const DEFAULT_DOWN           = 20

interface Props {
  result: HomePriceResult
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function pct(n: number, total: number): string {
  if (!total) return '—'
  return `${((n / total) * 100).toFixed(1)}%`
}

// ── Column ────────────────────────────────────────────────────────────────

function BudgetColumn({
  label,
  sublabel,
  budget,
  grossMonthly,
  accent,
}: {
  label: string
  sublabel: string
  budget: BudgetResult
  grossMonthly: number
  accent: string
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

      {/* Taxes row */}
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

// ── Category row (collapsible) ─────────────────────────────────────────────

function CategoryRow({
  cat,
  grossMonthly,
  expanded,
  onToggle,
}: {
  cat: BudgetCategory
  grossMonthly: number
  expanded: boolean
  onToggle: () => void
}) {
  const hasItems = cat.items.some(i => i.monthly > 0 || i.note)

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
          {cat.items.map((item, i) => (
            <div key={i} className="flex items-start justify-between px-4 py-2 text-xs">
              <div className="flex-1 min-w-0 pr-4">
                <span className={`${item.monthly === 0 ? 'text-gray-400' : 'text-gray-700'}`}>
                  {item.name}
                </span>
                {item.note && (
                  <span className="ml-1 text-gray-400 italic">({item.note})</span>
                )}
                <p className="text-gray-400 mt-0.5 text-xs">{item.source}</p>
              </div>
              <span className={`font-semibold whitespace-nowrap ${item.monthly === 0 ? 'text-gray-300' : 'text-gray-800'}`}>
                {item.monthly === 0 ? '—' : fmt(item.monthly)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function BudgetPage({ result }: Props) {
  const [housingMode, setHousingMode] = useState<'rent' | 'buy'>('rent')
  const [mortgageRate, setMortgageRate] = useState(DEFAULT_RATE)
  const [downPayment, setDownPayment] = useState(DEFAULT_DOWN)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const state = result.state || 'TX'

  const areaBudget = useMemo(() =>
    result.avg_agi
      ? calcBudget(result.avg_agi, state, result.median_value, result.avg_rent, mortgageRate, downPayment, housingMode)
      : null,
    [result, state, housingMode, mortgageRate, downPayment]
  )

  const nationalBudget = useMemo(() =>
    calcBudget(NATIONAL_MEDIAN_SALARY, state, result.median_value, result.avg_rent, mortgageRate, downPayment, housingMode),
    [result, state, housingMode, mortgageRate, downPayment]
  )

  const location = [result.city, result.state].filter(Boolean).join(', ')

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-4">
        <h2 className="text-lg font-bold text-gray-900">
          Monthly Budget Analysis — {location || `ZIP ${result.zip_code}`}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Estimated monthly expenses using BLS, EIA, USDA, KFF and other national data sources.
          Click any category to expand line items.
        </p>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap gap-4 items-end">
          {/* Housing toggle */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Housing scenario</p>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setHousingMode('rent')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${housingMode === 'rent' ? 'bg-blue-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Renting
              </button>
              <button
                onClick={() => setHousingMode('buy')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${housingMode === 'buy' ? 'bg-blue-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Buying
              </button>
            </div>
          </div>

          {/* Advanced */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {showAdvanced ? '▲ Hide' : '▼ Show'} mortgage options
          </button>

          {showAdvanced && (
            <div className="flex gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Interest rate (%)</label>
                <input
                  type="number" step="0.1" min="1" max="20"
                  value={mortgageRate}
                  onChange={e => setMortgageRate(parseFloat(e.target.value))}
                  className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Down payment (%)</label>
                <input
                  type="number" step="1" min="0" max="99"
                  value={downPayment}
                  onChange={e => setDownPayment(parseFloat(e.target.value))}
                  className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          * Estimates assume a single adult, no children, one car. Items marked $0 are optional/variable — expand categories to see notes.
          Tax calculations use 2024 federal brackets + estimated state rates. Not financial advice.
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
        />
      </div>
    </div>
  )
}
