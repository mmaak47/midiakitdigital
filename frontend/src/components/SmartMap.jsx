import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, NavigationControl, Popup, Source } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import { mergeBounds, sanitizeCoordinate, sanitizePoints } from '../lib/geo';
import 'maplibre-gl/dist/maplibre-gl.css';

const DEFAULT_CENTER = { latitude: -23.32, longitude: -51.16, zoom: 11 };

const CENSUS_PROFILE_COLORS = {
  alta_renda:          '#f59e0b',
  massa_varejo:        '#3b82f6',
  jovem_universitario: '#8b5cf6',
  terceira_idade:      '#10b981',
};

const CENSUS_PROFILE_LABELS = {
  alta_renda:          'Alta Renda',
  massa_varejo:        'Massa / Varejo',
  jovem_universitario: 'Jovem / Universitário',
  terceira_idade:      'Terceira Idade',
};

/** Generate a GeoJSON polygon approximating a circle of `radiusMeters` around [lng, lat]. */
function makeCirclePolygon(lng, lat, radiusMeters, steps = 48) {
  const earthRadius = 6_371_008.8;
  const latRad = (lat * Math.PI) / 180;
  const angularDist = radiusMeters / earthRadius;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * i) / steps;
    const dLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDist) +
      Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearing),
    );
    const dLng =
      (lng * Math.PI) / 180 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDist) * Math.cos(latRad),
        Math.cos(angularDist) - Math.sin(latRad) * Math.sin(dLat),
      );
    coords.push([(dLng * 180) / Math.PI, (dLat * 180) / Math.PI]);
  }
  return coords;
}

/** Haversine distance in meters between two lat/lng pairs. */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6_371_008.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Cluster nearby points into neighborhoods and return one feature per cluster. */
const CLUSTER_MERGE_DISTANCE = 1200; // meters — points within this range merge into one neighborhood

function buildNeighborhoodCircles(points, censusProfiles) {
  // Build list of points with census data
  const items = [];
  for (const pt of points) {
    const cp = censusProfiles[pt.id];
    if (!cp?.perfil_dominante) continue;
    items.push({ lat: pt.lat, lng: pt.lng, profile: cp.perfil_dominante });
  }
  if (!items.length) return [];

  // Greedy distance-based clustering
  const clusters = []; // each: { lats: [], lngs: [], profiles: [] }
  for (const item of items) {
    let merged = false;
    for (const cl of clusters) {
      const cLat = cl.lats.reduce((a, b) => a + b, 0) / cl.lats.length;
      const cLng = cl.lngs.reduce((a, b) => a + b, 0) / cl.lngs.length;
      if (haversineMeters(item.lat, item.lng, cLat, cLng) <= CLUSTER_MERGE_DISTANCE) {
        cl.lats.push(item.lat);
        cl.lngs.push(item.lng);
        cl.profiles.push(item.profile);
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({ lats: [item.lat], lngs: [item.lng], profiles: [item.profile] });
    }
  }

  // Build one feature per cluster
  return clusters.map((cl) => {
    const centLat = cl.lats.reduce((a, b) => a + b, 0) / cl.lats.length;
    const centLng = cl.lngs.reduce((a, b) => a + b, 0) / cl.lngs.length;

    // Majority vote for dominant profile
    const counts = {};
    for (const p of cl.profiles) counts[p] = (counts[p] || 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const color = CENSUS_PROFILE_COLORS[dominant];

    // Radius: covers the cluster spread + 800m analysis buffer
    let maxDist = 0;
    for (let i = 0; i < cl.lats.length; i++) {
      const d = haversineMeters(cl.lats[i], cl.lngs[i], centLat, centLng);
      if (d > maxDist) maxDist = d;
    }
    const radius = Math.max(800, maxDist + 800);

    return {
      type: 'Feature',
      properties: { color, profile: dominant, count: cl.profiles.length },
      geometry: {
        type: 'Polygon',
        coordinates: [makeCirclePolygon(centLng, centLat, radius)],
      },
    };
  });
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

function buildRasterFallbackStyle() {
  const voyagerTiles = [
    'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  ];

  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: voyagerTiles,
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
  censusProfiles = null,
}) {
  const [popupPoint, setPopupPoint] = useState(null);
  const mapRef = useRef(null);
  const shouldAutoFitRef = useRef(true);

  const styleUrl = useMemo(() => {
    const cdnStyle = import.meta.env.VITE_TILE_CDN_STYLE;
    if (cdnStyle) return cdnStyle;
    return buildRasterFallbackStyle();
  }, []);

  const valid = useMemo(() => sanitizePoints(pontos), [pontos]);

  const censusCirclesGeoJson = useMemo(() => {
    if (!censusProfiles || !valid.length) return EMPTY_FC;
    const features = buildNeighborhoodCircles(valid, censusProfiles);
    return features.length ? { type: 'FeatureCollection', features } : EMPTY_FC;
  }, [valid, censusProfiles]);

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
    <div className={`smart-map h-full w-full rounded-2xl overflow-hidden border relative smart-map-light border-neutral-200`}>
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

        <Source id="census-circles" type="geojson" data={censusCirclesGeoJson}>
          <Layer
            id="census-circles-fill"
            type="fill"
            paint={{
              'fill-color': ['get', 'color'],
              'fill-opacity': 0.18,
            }}
          />
          <Layer
            id="census-circles-stroke"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 1.5,
              'line-opacity': 0.55,
            }}
          />
        </Source>

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

      {censusProfiles && (
        <div className={`absolute right-3 bottom-3 z-[500] rounded-lg border px-3 py-2 text-xs bg-white/90 border-neutral-200 text-neutral-800 backdrop-blur-sm shadow-sm`}>
          <div className="font-semibold mb-1.5" style={{ fontSize: 11 }}>Perfil Censitário (800 m)</div>
          {Object.entries(CENSUS_PROFILE_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5 mb-0.5 last:mb-0">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ background: CENSUS_PROFILE_COLORS[key], opacity: 0.7 }}
              />
              <span style={{ fontSize: 11 }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {selectedId && (
        <div className="absolute left-3 bottom-3 z-[500] rounded-lg border border-brand-orange/40 px-3 py-2 text-xs bg-brand-orange/12 text-neutral-800">
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
    && prevProps.cityBounds === nextProps.cityBounds
    && prevProps.censusProfiles === nextProps.censusProfiles;
});
