import { useEffect, useState } from 'react'
import { fetchMortgageRate, MortgageRateInfo } from '../api'
import { DEFAULT_MORTGAGE_RATE } from '../utils/constants'

// One fetch per page load, shared across components
let cached: Promise<MortgageRateInfo> | null = null

export interface LiveRate {
  rate: number          // live FRED rate, or DEFAULT_MORTGAGE_RATE fallback
  asOf: string | null   // observation date when live, null when fallback
}

export function useMortgageRate(): LiveRate {
  const [live, setLive] = useState<LiveRate>({ rate: DEFAULT_MORTGAGE_RATE, asOf: null })

  useEffect(() => {
    cached ??= fetchMortgageRate().catch(() => ({ rate: null, as_of: null }))
    let mounted = true
    cached.then(info => {
      if (mounted && info.rate != null && info.rate > 0 && info.rate < 20) {
        setLive({ rate: info.rate, asOf: info.as_of })
      }
    })
    return () => { mounted = false }
  }, [])

  return live
}
