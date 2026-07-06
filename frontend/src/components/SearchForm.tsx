import { useEffect, useRef, useState, FormEvent } from 'react'
import { searchCity, CityMatch } from '../api'
import { formatCurrency } from '../utils/format'

interface Props {
  onSearch: (zip: string) => void
  loading: boolean
}

export default function SearchForm({ onSearch, loading }: Props) {
  const [query, setQuery] = useState('')
  const [validationError, setValidationError] = useState('')
  const [matches, setMatches] = useState<CityMatch[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<number>()
  const ctrlRef = useRef<AbortController | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const isZipLike = /^\d/.test(query)
  const zipValue = query.replace(/\D/g, '').slice(0, 5)

  // Close the dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function handleChange(raw: string) {
    setValidationError('')
    window.clearTimeout(debounceRef.current)
    ctrlRef.current?.abort()

    if (/^\d/.test(raw)) {
      setQuery(raw.replace(/\D/g, '').slice(0, 5))
      setMatches([])
      setOpen(false)
      return
    }

    setQuery(raw)
    const term = raw.trim()
    if (term.length < 2) {
      setMatches([])
      setOpen(false)
      return
    }
    debounceRef.current = window.setTimeout(async () => {
      const controller = new AbortController()
      ctrlRef.current = controller
      try {
        const results = await searchCity(term, controller.signal)
        if (!controller.signal.aborted) {
          setMatches(results)
          setOpen(results.length > 0)
        }
      } catch {
        // autocomplete is best-effort
      }
    }, 250)
  }

  function pick(match: CityMatch) {
    setQuery(match.zip_code)
    setMatches([])
    setOpen(false)
    onSearch(match.zip_code)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (isZipLike) {
      if (!/^\d{5}$/.test(zipValue)) {
        setValidationError('Please enter a valid 5-digit ZIP code')
        return
      }
      setValidationError('')
      setOpen(false)
      onSearch(zipValue)
    } else if (matches.length > 0) {
      pick(matches[0])
    } else if (query.trim()) {
      setValidationError('No matching city found — try a ZIP code')
    }
  }

  const canSubmit = isZipLike ? zipValue.length === 5 : query.trim().length >= 2

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative" ref={boxRef}>
          <input
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onFocus={() => matches.length > 0 && setOpen(true)}
            placeholder="ZIP code or city  (e.g. 90210 or Boise)"
            className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {open && (
            <ul className="absolute z-[1000] mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {matches.map(m => (
                <li key={m.zip_code}>
                  <button
                    type="button"
                    onClick={() => pick(m)}
                    className="w-full flex justify-between items-baseline px-4 py-2.5 text-sm hover:bg-blue-50 text-left"
                  >
                    <span>
                      <span className="font-semibold text-gray-900">{m.city}, {m.state}</span>
                      <span className="text-gray-400 ml-2">{m.zip_code}</span>
                    </span>
                    <span className="text-gray-500">{formatCurrency(m.median_value)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {validationError && (
            <p className="mt-1 text-sm text-red-600">{validationError}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="px-8 py-3 bg-blue-700 text-white font-semibold rounded-lg shadow-sm hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? 'Searching…' : 'Look Up'}
        </button>
      </div>
    </form>
  )
}
