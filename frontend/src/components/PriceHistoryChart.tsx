import { useMemo, useRef, useState } from 'react'
import { HistoryPoint } from '../api'
import { appreciationStats, formatMonth } from '../utils/history'
import { formatCurrency, formatPct } from '../utils/format'

// Single series → one hue, validated ≥3:1 on the white card surface
const SERIES = '#1d4ed8'   // Tailwind blue-700
const GRID   = '#e5e7eb'   // hairline
const MUTED  = '#9ca3af'   // axis labels

const W = 640
const H = 200
const PAD = { top: 16, right: 76, bottom: 24, left: 52 }

function compact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

interface Props {
  series: HistoryPoint[]
  zipCode: string
}

export default function PriceHistoryChart({ series, zipCode }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const stats = useMemo(() => appreciationStats(series), [series])

  const geom = useMemo(() => {
    if (series.length < 12) return null
    const values = series.map(p => p.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || max || 1
    const lo = min - span * 0.06
    const hi = max + span * 0.06

    const x = (i: number) =>
      PAD.left + (i / (series.length - 1)) * (W - PAD.left - PAD.right)
    const y = (v: number) =>
      PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)

    const path = series
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ')
    const area = `${path} L${x(series.length - 1).toFixed(1)},${H - PAD.bottom} L${PAD.left},${H - PAD.bottom} Z`

    // Year ticks on January points, thinned to ≤ 6 labels
    const janIdx = series
      .map((p, i) => ({ i, month: p.month }))
      .filter(({ month }) => month.slice(5, 7) === '01')
    const step = Math.max(1, Math.ceil(janIdx.length / 6))
    const ticks = janIdx.filter((_, k) => k % step === 0)
      .map(({ i, month }) => ({ x: x(i), label: month.slice(0, 4) }))

    const gridVals = [lo + (hi - lo) * 0.15, (lo + hi) / 2, lo + (hi - lo) * 0.85]
    return { x, y, path, area, ticks, gridVals }
  }, [series])

  if (!geom || series.length < 12) return null

  const last = series.length - 1

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const frac = (px - PAD.left) / (W - PAD.left - PAD.right)
    const idx = Math.round(frac * last)
    setHoverIdx(Math.max(0, Math.min(last, idx)))
  }

  const hover = hoverIdx !== null ? series[hoverIdx] : null

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
      <div className="px-6 pt-4 pb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">
            Home Value Trend — ZIP {zipCode}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Zillow ZHVI, monthly · last {Math.round(stats.spanYears)} years
          </p>
        </div>
        <div className="flex gap-4 text-xs">
          {stats.oneYearPct !== null && (
            <Delta label="1-yr" pct={stats.oneYearPct} />
          )}
          {stats.fiveYearPct !== null && (
            <Delta label="5-yr" pct={stats.fiveYearPct} />
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label={`Median home value in ZIP ${zipCode}, ${formatMonth(series[0].month)} to ${formatMonth(series[last].month)}`}
      >
        {/* recessive grid */}
        {geom.gridVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={geom.y(v)} y2={geom.y(v)}
              stroke={GRID} strokeWidth="1" />
            <text x={PAD.left - 6} y={geom.y(v) + 3.5} textAnchor="end"
              fontSize="10" fill={MUTED}>{compact(v)}</text>
          </g>
        ))}
        {geom.ticks.map((t, i) => (
          <text key={i} x={t.x} y={H - 8} textAnchor="middle" fontSize="10" fill={MUTED}>
            {t.label}
          </text>
        ))}

        {/* series */}
        <path d={geom.area} fill={SERIES} opacity="0.07" />
        <path d={geom.path} fill="none" stroke={SERIES} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* direct label on the latest point only */}
        <circle cx={geom.x(last)} cy={geom.y(series[last].value)} r="4"
          fill={SERIES} stroke="#ffffff" strokeWidth="2" />
        <text x={geom.x(last) + 8} y={geom.y(series[last].value) + 3.5}
          fontSize="11" fontWeight="600" fill="#111827">
          {compact(series[last].value)}
        </text>

        {/* crosshair + hover marker */}
        {hover && hoverIdx !== null && (
          <g pointerEvents="none">
            <line x1={geom.x(hoverIdx)} x2={geom.x(hoverIdx)}
              y1={PAD.top} y2={H - PAD.bottom} stroke={MUTED} strokeWidth="1"
              strokeDasharray="2,3" />
            <circle cx={geom.x(hoverIdx)} cy={geom.y(hover.value)} r="4"
              fill={SERIES} stroke="#ffffff" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* tooltip readout (HTML, below plot — avoids clipping at the edges) */}
      <div className="px-6 pb-3 h-5 text-xs text-gray-500">
        {hover
          ? <span>{formatMonth(hover.month)}: <span className="font-semibold text-gray-900">{formatCurrency(hover.value)}</span></span>
          : <span className="text-gray-300">Hover the chart for monthly values</span>}
      </div>
    </div>
  )
}

function Delta({ label, pct }: { label: string; pct: number }) {
  const up = pct >= 0
  return (
    <span className="whitespace-nowrap">
      <span className="text-gray-400">{label}</span>{' '}
      <span className={`font-semibold ${up ? 'text-emerald-700' : 'text-red-600'}`}>
        {formatPct(pct)}
      </span>
    </span>
  )
}
