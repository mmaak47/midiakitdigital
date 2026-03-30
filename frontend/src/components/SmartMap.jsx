import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, NavigationControl, Popup, Source } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import { mergeBounds, sanitizeCoordinate, sanitizePoints } from '../lib/geo';
import 'maplibre-gl/dist/maplibre-gl.css';

const DEFAULT_CENTER = { latitude: -23.32, longitude: -51.16, zoom: 11 };

function buildRasterFallbackStyle(isDark) {
  const darkTiles = [
    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  ];
  const lightTiles = [
    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  ];

  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: isDark ? darkTiles : lightTiles,
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      },
    },
    layers: [
      {
        id: 'basemap-layer',
        type: 'raster',
        source: 'basemap',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

const UNCLUSTERED_LAYER = {
  id: 'unclustered-point',
  type: 'circle',
  source: 'points',
  paint: {
    'circle-color': ['case', ['boolean', ['get', 'isSelected'], false], '#FFD8CC', '#FE5C2B'],
    'circle-stroke-color': '#FFFFFF',
    'circle-stroke-width': 1.5,
    'circle-radius': ['case', ['boolean', ['get', 'isSelected'], false], 11, 9],
  },
};

function SmartMap({
  pontos = [],
  selectedId,
  onSelect,
  onOpenDetails,
  isDark = true,
  focusCoords = null,
  selectedCidades = [],
  cityBounds = {},
}) {
  const [popupPoint, setPopupPoint] = useState(null);
  const mapRef = useRef(null);
  const shouldAutoFitRef = useRef(true);

  const styleUrl = useMemo(() => {
    const darkStyle = import.meta.env.VITE_TILE_CDN_STYLE_DARK;
    const lightStyle = import.meta.env.VITE_TILE_CDN_STYLE_LIGHT;
    if (isDark && darkStyle) return darkStyle;
    if (!isDark && lightStyle) return lightStyle;
    return buildRasterFallbackStyle(isDark);
  }, [isDark]);

  const valid = useMemo(() => sanitizePoints(pontos), [pontos]);

  const pointsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: valid.map((point) => ({
      type: 'Feature',
      properties: {
        pointId: point.id,
        nome: point.nome,
        tipo: point.tipo,
        cidade: point.cidade,
        fluxo: point.fluxo,
        preco: point.preco,
        isSelected: point.id === selectedId,
      },
      geometry: {
        type: 'Point',
        coordinates: [point.lng, point.lat],
      },
    })),
  }), [valid, selectedId]);

  useEffect(() => {
    // Re-enable auto-fit only when external inputs change (new data/filter/focus).
    shouldAutoFitRef.current = true;
  }, [pontos, selectedCidades, cityBounds, focusCoords]);

  useEffect(() => {
    if (!selectedId) {
      setPopupPoint(null);
      return;
    }

    const selected = valid.find((p) => p.id === selectedId) || null;
    setPopupPoint(selected);
  }, [selectedId, valid]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    const focusLat = sanitizeCoordinate(focusCoords?.lat, -90, 90);
    const focusLng = sanitizeCoordinate(focusCoords?.lng, -180, 180);
    const hasFocus = focusLat !== null && focusLng !== null;

    if (!hasFocus && !shouldAutoFitRef.current) {
      return;
    }

    if (focusLat !== null && focusLng !== null) {
      map.flyTo({ center: [focusLng, focusLat], zoom: Math.max(map.getZoom(), 14), essential: true, duration: 700 });
      shouldAutoFitRef.current = false;
      return;
    }

    const boundsFromCities = mergeBounds(
      (Array.isArray(selectedCidades) ? selectedCidades : [])
        .map((cidade) => cityBounds?.[cidade])
        .filter(Boolean),
    );

    if (boundsFromCities) {
      map.fitBounds([
        [boundsFromCities[0], boundsFromCities[1]],
        [boundsFromCities[2], boundsFromCities[3]],
      ], { padding: 48, maxZoom: 13, duration: 700 });
      shouldAutoFitRef.current = false;
      return;
    }

    if (!valid.length) return;
    if (valid.length === 1) {
      map.flyTo({ center: [valid[0].lng, valid[0].lat], zoom: 14, essential: true, duration: 700 });
      shouldAutoFitRef.current = false;
      return;
    }

    const allBounds = mergeBounds(valid.map((point) => [point.lng, point.lat, point.lng, point.lat]));
    if (!allBounds) return;
    map.fitBounds(
      [[allBounds[0], allBounds[1]], [allBounds[2], allBounds[3]]],
      { padding: 48, maxZoom: 13, duration: 700 },
    );
    shouldAutoFitRef.current = false;
  }, [focusCoords, valid, selectedCidades, cityBounds]);

  const handleMapClick = useCallback((event) => {
    const feature = event.features?.[0];
    if (!feature) return;

    if (feature.layer?.id === 'unclustered-point') {
      const pointId = Number(feature.properties?.pointId);
      const point = valid.find((item) => Number(item.id) === pointId);
      if (!point) return;
      setPopupPoint(point);
      onSelect?.(point);
    }
  }, [onSelect, valid]);

  return (
    <div className={`smart-map h-full w-full rounded-2xl overflow-hidden border relative ${isDark ? 'smart-map-dark border-white/10' : 'smart-map-light border-neutral-200'}`}>
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={DEFAULT_CENTER}
        mapStyle={styleUrl}
        interactiveLayerIds={['unclustered-point']}
        attributionControl={false}
        onClick={handleMapClick}
        onDragStart={() => {
          shouldAutoFitRef.current = false;
        }}
        onZoomStart={() => {
          shouldAutoFitRef.current = false;
        }}
      >
        <NavigationControl position="top-left" showCompass={false} />

        <Source
          id="points"
          type="geojson"
          data={pointsGeoJson}
        >
          <Layer {...UNCLUSTERED_LAYER} />
        </Source>

        {popupPoint ? (
          <Popup
            longitude={popupPoint.lng}
            latitude={popupPoint.lat}
            closeButton
            closeOnClick={false}
            onClose={() => setPopupPoint(null)}
            offset={18}
          >
            <div
              style={{
                minWidth: 210,
                fontFamily: 'Montserrat, sans-serif',
                color: '#101010',
                lineHeight: 1.35,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#101010' }}>{popupPoint.nome}</div>
              <div style={{ fontSize: 12, marginBottom: 8, color: '#404040' }}>{popupPoint.tipo} • {popupPoint.cidade}</div>
              <button
                style={{
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 10px',
                  background: '#FE5C2B',
                  color: '#fff',
                  cursor: 'pointer',
                }}
                onClick={() => onOpenDetails?.(popupPoint)}
              >
                Ver detalhes
              </button>
            </div>
          </Popup>
        ) : null}
      </Map>

      {selectedId && (
        <div className={`absolute left-3 bottom-3 z-[500] rounded-lg border border-brand-orange/40 px-3 py-2 text-xs ${isDark ? 'bg-brand-orange/20 text-white' : 'bg-brand-orange/12 text-neutral-800'}`}>
          Ponto selecionado no mapa sincronizado com a listagem.
        </div>
      )}
    </div>
  );
}

export default memo(SmartMap, (prevProps, nextProps) => {
  return prevProps.pontos === nextProps.pontos
    && prevProps.selectedId === nextProps.selectedId
    && prevProps.onSelect === nextProps.onSelect
    && prevProps.onOpenDetails === nextProps.onOpenDetails
    && prevProps.isDark === nextProps.isDark
    && prevProps.focusCoords?.lat === nextProps.focusCoords?.lat
    && prevProps.focusCoords?.lng === nextProps.focusCoords?.lng
    && prevProps.selectedCidades === nextProps.selectedCidades
    && prevProps.cityBounds === nextProps.cityBounds;
});
