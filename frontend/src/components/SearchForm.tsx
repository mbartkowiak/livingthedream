import { useState, FormEvent } from 'react'

interface Props {
  onSearch: (zip: string) => void
  loading: boolean
}

export default function SearchForm({ onSearch, loading }: Props) {
  const [zip, setZip] = useState('')
  const [validationError, setValidationError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const clean = zip.trim()
    if (!/^\d{5}$/.test(clean)) {
      setValidationError('Please enter a valid 5-digit ZIP code')
      return
    }
    setValidationError('')
    onSearch(clean)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            inputMode="numeric"
            value={zip}
            onChange={e => {
              setZip(e.target.value.replace(/\D/g, '').slice(0, 5))
              setValidationError('')
            }}
            placeholder="Enter ZIP code  (e.g. 90210)"
            maxLength={5}
            className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {validationError && (
            <p className="mt-1 text-sm text-red-600">{validationError}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || zip.length !== 5}
          className="px-8 py-3 bg-blue-700 text-white font-semibold rounded-lg shadow-sm hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? 'Searching…' : 'Look Up'}
        </button>
      </div>
    </form>
  )
}
