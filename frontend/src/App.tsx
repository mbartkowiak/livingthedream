import { useEffect, useRef, useState } from 'react'
import SearchForm from './components/SearchForm'
import ResultCard from './components/ResultCard'
import ZipMap from './components/ZipMap'
import AffordabilityPanel from './components/AffordabilityPanel'
import BudgetPage from './components/BudgetPage'
import ComparePage from './components/ComparePage'
import AffordabilityFinder from './components/AffordabilityFinder'
import PriceHistoryChart from './components/PriceHistoryChart'
import BreakEvenCard from './components/BreakEvenCard'
import { HomePriceResult } from './types'
import { fetchHomePrice, fetchHistory, fetchNearby, HistoryPoint, NearbyZip } from './api'

type Tab = 'lookup' | 'budget' | 'compare' | 'finder'
const TAB_IDS: Tab[] = ['lookup', 'budget', 'compare', 'finder']

interface NominatimResult {
  lat: string
  lon: string
}

// Fallback only — reseeded databases carry Census centroid coordinates
async function geocodeZip(zip: string, signal: AbortSignal): Promise<[number, number] | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1`
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' }, signal })
    const data: NominatimResult[] = await res.json()
    if (data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
    }
  } catch {
    // Map is optional — silently skip if geocoding fails
  }
  return null
}

function readUrl(): { zip: string | null; tab: Tab } {
  const params = new URLSearchParams(window.location.search)
  const zip = params.get('zip')
  const tab = params.get('tab') as Tab | null
  return {
    zip: zip && /^\d{5}$/.test(zip) ? zip : null,
    tab: tab && TAB_IDS.includes(tab) ? tab : 'lookup',
  }
}

export default function App() {
  const [result, setResult] = useState<HomePriceResult | null>(null)
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [nearby, setNearby] = useState<NearbyZip[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>(() => readUrl().tab)
  const searchControllerRef = useRef<AbortController | null>(null)

  async function handleSearch(zip: string) {
    // Cancel any in-flight search so a slow older response can't overwrite a newer one
    searchControllerRef.current?.abort()
    const controller = new AbortController()
    searchControllerRef.current = controller

    setLoading(true)
    setError(null)
    setResult(null)
    setCoordinates(null)
    setHistory([])
    setNearby([])

    try {
      // History and nearby are optional layers and resolve to [] on failure
      const [res, hist, near] = await Promise.all([
        fetchHomePrice(zip, controller.signal),
        fetchHistory(zip, controller.signal),
        fetchNearby(zip, controller.signal),
      ])
      if (controller.signal.aborted) return   // superseded by a newer search

      // Prefer coordinates from the database; fall back to Nominatim geocoding
      let coords: [number, number] | null =
        res.latitude != null && res.longitude != null
          ? [res.latitude, res.longitude]
          : null
      if (!coords) {
        coords = await geocodeZip(zip, controller.signal)
        if (controller.signal.aborted) return
      }

      setResult(res)
      setHistory(hist)
      setNearby(near)
      setCoordinates(coords)
    } catch (err) {
      if (controller.signal.aborted) return   // superseded by a newer search
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      if (searchControllerRef.current === controller) {
        setLoading(false)
      }
    }
  }

  // Shareable URLs: load state from ?zip=&tab= on mount…
  useEffect(() => {
    const { zip } = readUrl()
    if (zip) handleSearch(zip)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // …and keep the URL in sync as the user navigates
  useEffect(() => {
    const params = new URLSearchParams()
    if (result) params.set('zip', result.zip_code)
    if (activeTab !== 'lookup') params.set('tab', activeTab)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [result, activeTab])

  function viewZip(zip: string) {
    setActiveTab('lookup')
    window.scrollTo({ top: 0 })
    handleSearch(zip)
  }

  const tabs: { id: Tab; label: string; disabled?: boolean; hint?: string }[] = [
    { id: 'lookup',  label: 'Home Lookup' },
    { id: 'budget',  label: 'Budget Analysis', disabled: !result, hint: '(search a ZIP first)' },
    { id: 'compare', label: 'Compare ZIPs' },
    { id: 'finder',  label: 'Where Can I Afford?' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 pt-6 pb-0">
          <h1 className="text-2xl font-bold tracking-tight">US Home Price Lookup</h1>
          <p className="text-blue-300 text-sm mt-1">
            Median home values, rents & affordability by ZIP code — powered by Zillow Research data
          </p>
          {/* Tab bar */}
          <div className="flex gap-1 mt-4 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`px-5 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'bg-white text-blue-900'
                    : tab.disabled
                      ? 'text-blue-400 cursor-not-allowed opacity-50'
                      : 'text-blue-200 hover:text-white hover:bg-blue-800'
                  }`}
              >
                {tab.label}
                {tab.disabled && tab.hint && (
                  <span className="ml-1.5 text-xs opacity-60">{tab.hint}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10 space-y-6">
        {activeTab === 'lookup' && (
          <>
            <SearchForm onSearch={handleSearch} loading={loading} />

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {result && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <ResultCard result={result} />
                  <AffordabilityPanel
                    medianHomePrice={result.median_value}
                    areaAvgIncome={result.avg_agi}
                    incomeYear={result.income_year}
                    avgRent={result.avg_rent}
                    state={result.state}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {history.length >= 12 && (
                    <PriceHistoryChart series={history} zipCode={result.zip_code} />
                  )}
                  {result.avg_rent && (
                    <BreakEvenCard
                      homePrice={result.median_value}
                      avgRent={result.avg_rent}
                      state={result.state}
                      history={history}
                    />
                  )}
                </div>

                {coordinates && (
                  <ZipMap
                    center={coordinates}
                    zipCode={result.zip_code}
                    city={result.city}
                    state={result.state}
                    currentValue={result.median_value}
                    nearby={nearby}
                    onSelectZip={viewZip}
                  />
                )}
              </>
            )}
          </>
        )}

        {result && activeTab === 'budget' && (
          <BudgetPage result={result} />
        )}

        {/* Kept mounted (hidden) so comparisons / finder results survive tab switches */}
        <div className={activeTab === 'compare' ? '' : 'hidden'}>
          <ComparePage initialZip={result?.zip_code} onViewZip={viewZip} />
        </div>
        <div className={activeTab === 'finder' ? '' : 'hidden'}>
          <AffordabilityFinder onViewZip={viewZip} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-4 text-center text-xs text-gray-400">
        Data: Zillow ZHVI/ZORI · IRS SOI · Census · FRED · Map: OpenStreetMap · Not financial advice
      </footer>
    </div>
  )
}
