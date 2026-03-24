import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Tooltip } from 'react-leaflet';
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

export default function SmartMap({ pontos = [], selectedId, onSelect, onOpenDetails }) {
  const [hoveredZone, setHoveredZone] = useState(null);

  const valid = useMemo(() => pontos.filter((p) => p.lat && p.lng), [pontos]);
  const center = valid.length ? [valid[0].lat, valid[0].lng] : [-23.32, -51.16];

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden border border-white/10 relative">
      <MapContainer center={center} zoom={11} className="h-full w-full">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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
          <Marker key={p.id} position={[p.lat, p.lng]} icon={markerIcon} eventHandlers={{ click: () => onSelect?.(p) }}>
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
        <div className="absolute right-3 top-3 z-[500] w-72 rounded-xl border border-white/15 bg-black/85 backdrop-blur p-3">
          <div className="text-sm font-semibold text-white">{hoveredZone.nome}</div>
          <div className="text-xs text-brand-gray-400 mt-1">{hoveredZone.descricao}</div>
        </div>
      )}

      {selectedId && (
        <div className="absolute left-3 bottom-3 z-[500] rounded-lg bg-brand-orange/20 border border-brand-orange/40 px-3 py-2 text-xs">
          Ponto selecionado no mapa sincronizado com a listagem.
        </div>
      )}
    </div>
  );
}
