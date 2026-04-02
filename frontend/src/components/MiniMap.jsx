/**
 * MiniMap — mapa leve para exibir a localização de um ponto no modal de detalhes.
 * Usa o mesmo tile CARTO Voyager do SmartMap para manter consistência visual.
 */
import { useRef, useEffect } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const VOYAGER_STYLE = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [{ id: 'basemap-layer', type: 'raster', source: 'basemap' }],
};

export default function MiniMap({ lat, lng, className = '' }) {
  const validLat = Number.isFinite(Number(lat)) ? Number(lat) : null;
  const validLng = Number.isFinite(Number(lng)) ? Number(lng) : null;

  if (!validLat || !validLng) {
    return (
      <div className={`flex items-center justify-center text-xs text-neutral-400 bg-neutral-100 ${className}`}>
        Sem coordenadas para exibir o mapa.
      </div>
    );
  }

  // Resolve tile style: prefer env override (same as SmartMap) → fallback to Voyager
  const styleUrl = import.meta.env.VITE_TILE_CDN_STYLE || VOYAGER_STYLE;

  return (
    <div className={`relative ${className}`}>
      <Map
        mapLib={maplibregl}
        initialViewState={{ longitude: validLng, latitude: validLat, zoom: 15 }}
        mapStyle={styleUrl}
        attributionControl={false}
        scrollZoom={false}
        dragPan={false}
        dragRotate={false}
        doubleClickZoom={false}
        touchZoomRotate={false}
        keyboard={false}
      >
        <NavigationControl position="top-left" showCompass={false} />
        <Marker longitude={validLng} latitude={validLat} anchor="bottom">
          <div style={{
            width: 22,
            height: 22,
            borderRadius: '50% 50% 50% 0',
            transform: 'rotate(-45deg)',
            background: '#FE5C2B',
            border: '2.5px solid #fff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
          }} />
        </Marker>
      </Map>
      <div className="absolute left-2 top-2 rounded-md bg-white/85 backdrop-blur-sm px-2 py-1 text-[11px] text-neutral-700 font-medium pointer-events-none shadow-sm">
        Localização do ponto
      </div>
    </div>
  );
}
