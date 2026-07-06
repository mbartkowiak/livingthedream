/** Typed fetch helpers for the backend API. */

import { HomePriceResult } from './types'

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.detail ?? `Request failed (${res.status})`)
  }
  return data as T
}

export function fetchHomePrice(zip: string, signal?: AbortSignal): Promise<HomePriceResult> {
  return getJson(`/api/home-price?zip=${encodeURIComponent(zip)}`, signal)
}

export interface HistoryPoint {
  month: string   // e.g. "2026-05-31"
  value: number
}

export async function fetchHistory(zip: string, signal?: AbortSignal): Promise<HistoryPoint[]> {
  try {
    const data = await getJson<{ series: HistoryPoint[] }>(
      `/api/history?zip=${encodeURIComponent(zip)}`, signal,
    )
    return data.series
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return []   // trends are optional — degrade gracefully
  }
}

export interface NearbyZip {
  zip_code: string
  city: string
  state: string
  median_value: number
  avg_rent: number | null
  avg_agi: number | null
  latitude: number
  longitude: number
  distance_miles: number
}

export async function fetchNearby(zip: string, signal?: AbortSignal): Promise<NearbyZip[]> {
  try {
    const data = await getJson<{ results: NearbyZip[] }>(
      `/api/nearby?zip=${encodeURIComponent(zip)}&radius=25&limit=60`, signal,
    )
    return data.results
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return []   // nearby layer is optional
  }
}

export interface CityMatch {
  zip_code: string
  city: string
  state: string
  median_value: number
}

export async function searchCity(q: string, signal?: AbortSignal): Promise<CityMatch[]> {
  const data = await getJson<{ results: CityMatch[] }>(
    `/api/search-city?q=${encodeURIComponent(q)}`, signal,
  )
  return data.results
}

export interface MortgageRateInfo {
  rate: number | null
  as_of: string | null
}

export function fetchMortgageRate(): Promise<MortgageRateInfo> {
  return getJson('/api/mortgage-rate')
}

export interface AffordableZipsRequest {
  mode: 'buy' | 'rent'
  thresholds: Record<string, number>
  state?: string
  limit?: number
}

export interface AffordableZipRow {
  zip_code: string
  city: string
  state: string
  metro: string
  median_value: number
  avg_rent: number | null
  avg_agi: number | null
}

export interface AffordableZipsResponse {
  total: number
  by_state: { state: string; count: number }[]
  results: AffordableZipRow[]
}

export async function fetchAffordableZips(
  req: AffordableZipsRequest, signal?: AbortSignal,
): Promise<AffordableZipsResponse> {
  const res = await fetch('/api/affordable-zips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail ?? `Request failed (${res.status})`)
  return data as AffordableZipsResponse
}
