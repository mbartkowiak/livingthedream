import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet'
import { NearbyZip } from '../api'
import { formatCurrency } from '../utils/format'

interface Props {
  center: [number, number]
  zipCode: string
  city: string
  state: string
  currentValue: number
  nearby: NearbyZip[]
  onSelectZip: (zip: string) => void
}

// Diverging vs the searched ZIP: cheaper / similar / pricier
const CHEAPER = '#15803d'   // green-700
const SIMILAR = '#6b7280'   // gray-500
const PRICIER = '#b91c1c'   // red-700

function bucket(value: number, current: number) {
  const diff = (value - current) / current
  if (diff <= -0.1) return { color: CHEAPER, label: 'cheaper' }
  if (diff >= 0.1)  return { color: PRICIER, label: 'pricier' }
  return { color: SIMILAR, label: 'similar' }
}

export default function ZipMap({
  center, zipCode, city, state, currentValue, nearby, onSelectZip,
}: Props) {
  const label = [city, state].filter(Boolean).join(', ') || zipCode

  return (
    <div className="rounded-xl overflow-hidden shadow-md border border-gray-100 relative">
      <div style={{ height: 420 }}>
        {/* key forces a full remount when the zip changes, avoiding stale center */}
        <MapContainer
          key={`${center[0]}-${center[1]}`}
          center={center}
          zoom={10}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          {nearby.map(n => {
            const b = bucket(n.median_value, currentValue)
            const diffPct = ((n.median_value - currentValue) / currentValue) * 100
            return (
              <CircleMarker
                key={n.zip_code}
                center={[n.latitude, n.longitude]}
                radius={8}
                pathOptions={{
                  color: '#ffffff', weight: 2,
                  fillColor: b.color, fillOpacity: 0.85,
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold">{n.city}, {n.state} · {n.zip_code}</p>
                    <p>
                      {formatCurrency(n.median_value)}{' '}
                      <span style={{ color: b.color }} className="font-semibold">
                        ({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(0)}%)
                      </span>
                    </p>
                    <p className="text-gray-500 text-xs">{n.distance_miles} mi away</p>
                    <button
                      onClick={() => onSelectZip(n.zip_code)}
                      className="mt-1.5 text-blue-700 font-semibold hover:underline"
                    >
                      View details →
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}

          <Marker position={center}>
            <Popup>
              {label}
              <br />
              ZIP {zipCode} · {formatCurrency(currentValue)}
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      {nearby.length > 0 && (
        <div className="absolute bottom-3 right-3 z-[1000] bg-white/95 rounded-lg shadow px-3 py-2 text-xs space-y-1">
          <p className="font-semibold text-gray-700">Nearby ZIPs vs. {zipCode}</p>
          <LegendRow color={CHEAPER} label="≥10% cheaper" />
          <LegendRow color={SIMILAR} label="within ±10%" />
          <LegendRow color={PRICIER} label="≥10% pricier" />
        </div>
      )}
    </div>
  )
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <p className="flex items-center gap-1.5 text-gray-600">
      <span
        className="inline-block w-3 h-3 rounded-full border-2 border-white shadow-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </p>
  )
}
