import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, NavigationControl, Popup, Source } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import { ZONAS_ESTRATEGICAS } from '../lib/strategy';
import { mergeBounds, sanitizeCoordinate, sanitizePoints } from '../lib/geo';
import 'maplibre-gl/dist/maplibre-gl.css';

const DEFAULT_CENTER = { latitude: -23.32, longitude: -51.16, zoom: 11 };

const CLUSTER_LAYER = {
  id: 'clusters',
  type: 'circle',
  source: 'points',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#FE5C2B',
    'circle-stroke-color': '#FFFFFF',
    'circle-stroke-width': 1.5,
    'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 40, 28, 120, 34],
    'circle-opacity': 0.92,
  },
};

const CLUSTER_COUNT_LAYER = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'points',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-size': 12,
    'text-font': ['Open Sans Bold'],
  },
  paint: { 'text-color': '#FFFFFF' },
};

const UNCLUSTERED_LAYER = {
  id: 'unclustered-point',
  type: 'circle',
  source: 'points',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': ['case', ['boolean', ['get', 'isSelected'], false], '#FFD8CC', '#FE5C2B'],
    'circle-stroke-color': '#FFFFFF',
    'circle-stroke-width': 1.5,
    'circle-radius': ['case', ['boolean', ['get', 'isSelected'], false], 9, 7],
  },
};

function circlePolygon([lng, lat], radiusMeters = 900, steps = 40) {
  const earthRadius = 6378137;
  const latRadians = (lat * Math.PI) / 180;
  const dLat = (radiusMeters / earthRadius) * (180 / Math.PI);
  const dLng = (radiusMeters / (earthRadius * Math.cos(latRadians))) * (180 / Math.PI);
  const coords = [];

  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    coords.push([lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }

  return coords;
}

function buildZoneGeoJson() {
  return {
    type: 'FeatureCollection',
    features: ZONAS_ESTRATEGICAS.map((zona) => ({
      type: 'Feature',
      properties: { id: zona.id, nome: zona.nome, descricao: zona.descricao, color: zona.color },
      geometry: {
        type: 'Polygon',
        coordinates: [circlePolygon([Number(zona.center[1]), Number(zona.center[0])], Number(zona.radius) || 900)],
      },
    })),
  };
}

export default function SmartMap({
  pontos = [],
  selectedId,
  onSelect,
  onOpenDetails,
  isDark = true,
  focusCoords = null,
  selectedCidades = [],
  cityBounds = {},
}) {
  const [hoveredZone, setHoveredZone] = useState(null);
  const [popupPoint, setPopupPoint] = useState(null);
  const mapRef = useRef(null);

  const styleUrl = useMemo(() => {
    const darkStyle = import.meta.env.VITE_TILE_CDN_STYLE_DARK;
    const lightStyle = import.meta.env.VITE_TILE_CDN_STYLE_LIGHT;
    if (isDark && darkStyle) return darkStyle;
    if (!isDark && lightStyle) return lightStyle;
    return 'https://demotiles.maplibre.org/style.json';
  }, [isDark]);

  const valid = useMemo(() => sanitizePoints(pontos), [pontos]);
  const zoneGeoJson = useMemo(() => buildZoneGeoJson(), []);

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
    if (focusLat !== null && focusLng !== null) {
      map.flyTo({ center: [focusLng, focusLat], zoom: Math.max(map.getZoom(), 14), essential: true, duration: 700 });
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
      return;
    }

    if (!valid.length) return;
    if (valid.length === 1) {
      map.flyTo({ center: [valid[0].lng, valid[0].lat], zoom: 14, essential: true, duration: 700 });
      return;
    }

    const allBounds = mergeBounds(valid.map((point) => [point.lng, point.lat, point.lng, point.lat]));
    if (!allBounds) return;
    map.fitBounds(
      [[allBounds[0], allBounds[1]], [allBounds[2], allBounds[3]]],
      { padding: 48, maxZoom: 13, duration: 700 },
    );
  }, [focusCoords, valid, selectedCidades, cityBounds]);

  const handleMapClick = useCallback((event) => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    const feature = event.features?.[0];
    if (!feature) return;

    if (feature.layer?.id === 'clusters') {
      const clusterId = feature.properties?.cluster_id;
      const source = map.getSource('points');
      if (!source || typeof source.getClusterExpansionZoom !== 'function') return;

      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error) return;
        map.easeTo({
          center: feature.geometry.coordinates,
          zoom,
          duration: 500,
        });
      });
      return;
    }

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
        interactiveLayerIds={['clusters', 'unclustered-point', 'zones-fill']}
        attributionControl={false}
        onClick={handleMapClick}
        onMouseMove={(event) => {
          const zoneFeature = event.features?.find((feature) => feature.layer?.id === 'zones-fill');
          if (!zoneFeature) {
            setHoveredZone(null);
            return;
          }

          setHoveredZone({
            id: zoneFeature.properties?.id,
            nome: zoneFeature.properties?.nome,
            descricao: zoneFeature.properties?.descricao,
          });
        }}
      >
        <NavigationControl position="top-left" showCompass={false} />

        <Source id="zones" type="geojson" data={zoneGeoJson}>
          <Layer
            id="zones-fill"
            type="fill"
            paint={{
              'fill-color': ['coalesce', ['get', 'color'], '#FE5C2B'],
              'fill-opacity': 0.08,
            }}
          />
          <Layer
            id="zones-line"
            type="line"
            paint={{
              'line-color': ['coalesce', ['get', 'color'], '#FE5C2B'],
              'line-width': 1.2,
              'line-opacity': 0.7,
            }}
          />
        </Source>

        <Source
          id="points"
          type="geojson"
          data={pointsGeoJson}
          cluster
          clusterMaxZoom={14}
          clusterRadius={56}
        >
          <Layer {...CLUSTER_LAYER} />
          <Layer {...CLUSTER_COUNT_LAYER} />
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
            <div style={{ minWidth: 190, fontFamily: 'Montserrat, sans-serif' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{popupPoint.nome}</div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>{popupPoint.tipo} • {popupPoint.cidade}</div>
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
