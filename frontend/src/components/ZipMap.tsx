import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'

interface Props {
  center: [number, number]
  zipCode: string
  city: string
  state: string
}

export default function ZipMap({ center, zipCode, city, state }: Props) {
  const label = [city, state].filter(Boolean).join(', ') || zipCode

  return (
    <div
      className="rounded-xl overflow-hidden shadow-md border border-gray-100"
      style={{ height: 360 }}
    >
      {/* key forces a full remount when the zip changes, avoiding stale center */}
      <MapContainer
        key={`${center[0]}-${center[1]}`}
        center={center}
        zoom={11}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Marker position={center}>
          <Popup>
            {label}
            <br />
            ZIP {zipCode}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}
