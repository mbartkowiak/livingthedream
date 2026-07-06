import { HistoryPoint } from '../api'

export interface AppreciationStats {
  oneYearPct: number | null
  fiveYearPct: number | null
  cagr5: number | null      // annualized 5-yr appreciation %, for rent-vs-buy
  spanYears: number
}

function pctChange(from: number | undefined, to: number): number | null {
  if (!from || from <= 0) return null
  return ((to - from) / from) * 100
}

/** Series is monthly, oldest→newest (as returned by /api/history). */
export function appreciationStats(series: HistoryPoint[]): AppreciationStats {
  if (series.length < 2) {
    return { oneYearPct: null, fiveYearPct: null, cagr5: null, spanYears: 0 }
  }
  const latest = series[series.length - 1].value
  const yearAgo = series[series.length - 13]?.value
  const fiveAgo = series[series.length - 61]?.value

  const fiveYearPct = pctChange(fiveAgo, latest)
  const cagr5 = fiveAgo && fiveAgo > 0
    ? (Math.pow(latest / fiveAgo, 1 / 5) - 1) * 100
    : null

  return {
    oneYearPct: pctChange(yearAgo, latest),
    fiveYearPct,
    cagr5,
    spanYears: (series.length - 1) / 12,
  }
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
