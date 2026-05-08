import { useState } from 'react'
import SearchForm from './components/SearchForm'
import ResultCard from './components/ResultCard'
import ZipMap from './components/ZipMap'
import AffordabilityPanel from './components/AffordabilityPanel'
import BudgetPage from './components/BudgetPage'
import { HomePriceResult } from './types'

type Tab = 'lookup' | 'budget'

interface NominatimResult {
  lat: string
  lon: string
}

async function geocodeZip(zip: string): Promise<[number, number] | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1`
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
    const data: NominatimResult[] = await res.json()
    if (data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
    }
  } catch {
    // Map is optional — silently skip if geocoding fails
  }
  return null
}

export default function App() {
  const [result, setResult] = useState<HomePriceResult | null>(null)
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('lookup')

  async function handleSearch(zip: string) {
    setLoading(true)
    setError(null)
    setResult(null)
    setCoordinates(null)

    try {
      const res = await fetch(`/api/home-price?zip=${encodeURIComponent(zip)}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail ?? 'Failed to fetch home price data')
      }
      setResult(data as HomePriceResult)

      // Geocode in parallel — map is optional so failures are swallowed inside geocodeZip
      const coords = await geocodeZip(zip)
      setCoordinates(coords)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 pt-6 pb-0">
          <h1 className="text-2xl font-bold tracking-tight">US Home Price Lookup</h1>
          <p className="text-blue-300 text-sm mt-1">
            Median home values by ZIP code — powered by Zillow Research data
          </p>
          {/* Tab bar */}
          <div className="flex gap-1 mt-4">
            {([
              { id: 'lookup', label: 'Home Lookup' },
              { id: 'budget', label: 'Budget Analysis', disabled: !result },
            ] as { id: Tab; label: string; disabled?: boolean }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`px-5 py-2 text-sm font-medium rounded-t-lg transition-colors
                  ${activeTab === tab.id
                    ? 'bg-white text-blue-900'
                    : tab.disabled
                      ? 'text-blue-400 cursor-not-allowed opacity-50'
                      : 'text-blue-200 hover:text-white hover:bg-blue-800'
                  }`}
              >
                {tab.label}
                {tab.id === 'budget' && !result && (
                  <span className="ml-1.5 text-xs opacity-60">(search a ZIP first)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10 space-y-6">
        <SearchForm onSearch={handleSearch} loading={loading} />

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {result && activeTab === 'lookup' && (
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
            {coordinates && (
              <ZipMap
                center={coordinates}
                zipCode={result.zip_code}
                city={result.city}
                state={result.state}
              />
            )}
          </>
        )}

        {result && activeTab === 'budget' && (
          <BudgetPage result={result} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-4 text-center text-xs text-gray-400">
        Data source: Zillow ZHVI · Map tiles: OpenStreetMap · Not financial advice
      </footer>
    </div>
  )
}
