import { HomePriceResult } from '../types'
import { formatCurrency } from '../utils/format'

interface Props {
  result: HomePriceResult
}

function formatDate(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number)
  return new Date(year, month - 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function ptiLabel(ratio: number): string {
  if (ratio < 3) return 'Very affordable market'
  if (ratio < 4) return 'Affordable market'
  if (ratio < 5) return 'Moderately unaffordable'
  if (ratio < 7) return 'Severely unaffordable'
  return 'Extremely unaffordable'
}

export default function ResultCard({ result }: Props) {
  const location = [result.city, result.state].filter(Boolean).join(', ')
  const subParts = [result.county, result.metro].filter(Boolean)
  const pti = result.avg_agi ? (result.median_value / result.avg_agi).toFixed(1) : null

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
      {/* Header stripe */}
      <div className="bg-blue-900 px-6 py-3 flex items-center justify-between">
        <span className="text-blue-200 text-sm font-medium tracking-wide uppercase">
          ZIP Code {result.zip_code}
        </span>
        <span className="text-blue-300 text-xs">
          Home data as of {formatDate(result.last_updated)}
        </span>
      </div>

      {/* Location */}
      <div className="px-6 pt-5 pb-3">
        {location && <h2 className="text-xl font-bold text-gray-900">{location}</h2>}
        {subParts.length > 0 && (
          <p className="text-sm text-gray-500 mt-1">{subParts.join(' · ')}</p>
        )}
      </div>

      {/* Stats — 2×2 grid */}
      <div className="px-6 pb-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-gray-50 pt-4">

        <StatBox
          label="Median Home Value"
          value={formatCurrency(result.median_value)}
          sub="Zillow ZHVI · seasonally adj."
          color="text-blue-700"
        />

        <StatBox
          label="Avg. Monthly Rent"
          value={result.avg_rent ? formatCurrency(result.avg_rent) : null}
          sub="Zillow ZORI · all home types"
          color="text-violet-700"
        />

        <StatBox
          label="Avg. Household Income"
          value={result.avg_agi ? formatCurrency(result.avg_agi) : null}
          sub={result.income_year ? `IRS SOI avg. AGI · ${result.income_year} tax yr` : 'IRS SOI'}
          color="text-emerald-700"
        />

        <StatBox
          label="Price-to-Income Ratio"
          value={pti ? `${pti}×` : null}
          sub={pti ? ptiLabel(parseFloat(pti)) : undefined}
          color="text-gray-800"
        />

      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string | null
  sub?: string
  color: string
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      {value ? (
        <>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </>
      ) : (
        <p className="text-sm text-gray-400 mt-1">No data for this ZIP</p>
      )}
    </div>
  )
}
