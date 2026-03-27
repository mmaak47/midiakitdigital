import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ZONAS_ESTRATEGICAS } from '../lib/strategy';
import 'leaflet/dist/leaflet.css';

const markerIcon = L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;background:#FE5C2B;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -24]
});

function ViewportController({ points, focusCoords }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return undefined;

    if (focusCoords && Number.isFinite(Number(focusCoords.lat)) && Number.isFinite(Number(focusCoords.lng))) {
      map.setView([Number(focusCoords.lat), Number(focusCoords.lng)], Math.max(map.getZoom(), 14), {
        animate: true,
        duration: 0.7
      });
      return undefined;
    }

    const validPoints = (Array.isArray(points) ? points : [])
      .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)));

    if (!validPoints.length) return undefined;

    if (validPoints.length === 1) {
      map.setView([Number(validPoints[0].lat), Number(validPoints[0].lng)], 14, {
        animate: true,
        duration: 0.7
      });
      return undefined;
    }

    const bounds = L.latLngBounds(validPoints.map((point) => [Number(point.lat), Number(point.lng)]));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14, animate: true, duration: 0.7 });
    return undefined;
  }, [map, points, focusCoords]);

  return null;
}

export default function SmartMap({ pontos = [], selectedId, onSelect, onOpenDetails, isDark = true, focusCoords = null }) {
  const [hoveredZone, setHoveredZone] = useState(null);

  const valid = useMemo(() => pontos.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))), [pontos]);
  const center = valid.length ? [Number(valid[0].lat), Number(valid[0].lng)] : [-23.32, -51.16];

  return (
    <div className={`smart-map h-full w-full rounded-2xl overflow-hidden border relative ${isDark ? 'smart-map-dark border-white/10' : 'smart-map-light border-neutral-200'}`}>
      <MapContainer center={center} zoom={11} className="h-full w-full">
        <ViewportController points={valid} focusCoords={focusCoords} />
        <TileLayer
          url={isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'}
          attribution='&copy; CARTO'
        />

        {ZONAS_ESTRATEGICAS.map((zona) => (
          <Circle
            key={zona.id}
            center={zona.center}
            radius={zona.radius}
            pathOptions={{ color: zona.color, fillColor: zona.color, fillOpacity: 0.08, weight: 1.5 }}
            eventHandlers={{
              mouseover: () => setHoveredZone(zona),
              mouseout: () => setHoveredZone((z) => (z?.id === zona.id ? null : z))
            }}
          >
            <Tooltip direction="center" permanent={false}>{zona.nome}</Tooltip>
          </Circle>
        ))}

        {valid.map((p) => (
          <Marker key={p.id} position={[Number(p.lat), Number(p.lng)]} icon={markerIcon} eventHandlers={{ click: () => onSelect?.(p) }}>
            <Popup>
              <div style={{ minWidth: 190, fontFamily: 'Montserrat, sans-serif' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.nome}</div>
                <div style={{ fontSize: 12, marginBottom: 6 }}>{p.tipo} • {p.cidade}</div>
                <button
                  style={{
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 10px',
                    background: '#FE5C2B',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                  onClick={() => onOpenDetails?.(p)}
                >
                  Ver detalhes
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {hoveredZone && (
        <div className={`absolute right-3 top-3 z-[500] w-72 rounded-xl border backdrop-blur p-3 ${isDark ? 'border-white/15 bg-black/85' : 'border-neutral-200 bg-white/95 shadow-sm'}`}>
          <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{hoveredZone.nome}</div>
          <div className={`text-xs mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>{hoveredZone.descricao}</div>
        </div>
      )}

      {selectedId && (
        <div className={`absolute left-3 bottom-3 z-[500] rounded-lg border border-brand-orange/40 px-3 py-2 text-xs ${isDark ? 'bg-brand-orange/20 text-white' : 'bg-brand-orange/12 text-neutral-800'}`}>
          Ponto selecionado no mapa sincronizado com a listagem.
        </div>
      )}
    </div>
  );
}
