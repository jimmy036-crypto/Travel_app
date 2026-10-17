import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function FitCities({ cities }) {
  const map = useMap();
  useEffect(() => {
    if (cities.length) map.fitBounds(cities.map((city) => [city.lat, city.lng]), { padding: [35, 35], maxZoom: 10, animate: false });
  }, [cities, map]);
  return null;
}

export default function FootprintsMap({ cities, selectedId, onSelect }) {
  const [tileError, setTileError] = useState(false);
  return <>
    <div className="journal-map" aria-label="確認到訪城市地圖" data-testid="footprints-map">
      <MapContainer center={[25, 120]} zoom={3} scrollWheelZoom={false}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' eventHandlers={{ tileerror: () => setTileError(true) }} />
        <FitCities cities={cities} />
        {cities.map((city) => <CircleMarker key={city.id} center={[city.lat, city.lng]} radius={city.id === selectedId ? 13 : 9} pathOptions={{ color: city.id === selectedId ? '#172554' : '#1e40af', fillColor: '#3b82f6', fillOpacity: .8, weight: city.id === selectedId ? 4 : 2 }} eventHandlers={{ click: () => onSelect(city.id) }}><Tooltip>{city.city} · {city.tripCount} 趟旅行</Tooltip></CircleMarker>)}
      </MapContainer>
    </div>
    {tileError ? <p role="status" className="mb-3 text-sm">地圖底圖暫時無法載入，下方城市與旅行紀錄仍可查看。</p> : null}
  </>;
}
