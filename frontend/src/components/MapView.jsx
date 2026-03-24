import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom orange marker
function createIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px; height:28px; background:#FE5C2B; border-radius:50% 50% 50% 0;
      transform:rotate(-45deg); border:2px solid #fff;
      box-shadow:0 2px 8px rgba(254,92,43,0.5);
      display:flex; align-items:center; justify-content:center;
    "><span style="transform:rotate(45deg);color:#fff;font-size:10px;font-weight:700;">●</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

function FitBounds({ pontos }) {
  const map = useMap();
  const prevCount = useRef(0);

  useEffect(() => {
    if (pontos.length === 0) return;
    if (pontos.length === prevCount.current) return;
    prevCount.current = pontos.length;

    const bounds = L.latLngBounds(pontos.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [pontos, map]);

  return null;
}

const formatCurrency = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export default function MapView({ pontos, onSelect }) {
  const icon = createIcon();

  const validPontos = pontos.filter(p => p.lat && p.lng);
  const center = validPontos.length > 0
    ? [validPontos[0].lat, validPontos[0].lng]
    : [-24.5, -50.5];

  return (
    <div className="w-full h-full min-h-[400px] rounded-2xl overflow-hidden border border-white/5">
      <MapContainer
        center={center}
        zoom={7}
        className="w-full h-full"
        style={{ minHeight: '400px', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <FitBounds pontos={validPontos} />

        {validPontos.map(ponto => (
          <Marker
            key={ponto.id}
            position={[ponto.lat, ponto.lng]}
            icon={icon}
            eventHandlers={{ click: () => onSelect(ponto) }}
          >
            <Popup>
              <div style={{ fontFamily: 'Montserrat, sans-serif', minWidth: 180 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#fff', marginBottom: 4 }}>
                  {ponto.nome}
                </div>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                  {ponto.tipo} · {ponto.cidade}
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>
                  Fluxo: {new Intl.NumberFormat('pt-BR').format(ponto.fluxo)}/mês
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#FE5C2B' }}>
                  {formatCurrency(ponto.preco)}<span style={{ fontSize: 10, color: '#666', fontWeight: 400 }}>/mês</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
