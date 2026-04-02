const TILE_SIZE = 256;

function shortenSegment(from, to, startPadding = 0, endPadding = 0) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const minLength = startPadding + endPadding + 2;

  if (!Number.isFinite(length) || length <= minLength) {
    return null;
  }

  const ux = dx / length;
  const uy = dy / length;

  return {
    startX: from.x + ux * startPadding,
    startY: from.y + uy * startPadding,
    endX: to.x - ux * endPadding,
    endY: to.y - uy * endPadding
  };
}

export async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) return null;
    return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

// Usando CARTO Voyager para consistência com SmartMap e MiniMap
const TILE_THEMES = {
  dark: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  light: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
};

const imageCache = new Map();

export function resolvePointCoordinates(point) {
  const candidates = [
    { lat: point?.lat, lng: point?.lng },
    { lat: point?.latitude, lng: point?.longitude },
    { lat: point?.entornoMetrics?.latitude, lng: point?.entornoMetrics?.longitude }
  ];

  for (const candidate of candidates) {
    const lat = Number(candidate.lat);
    const lng = Number(candidate.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001) {
      return { lat, lng };
    }
  }

  return null;
}

function clampLat(lat) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function lngLatToWorldPixel(lat, lng, zoom) {
  const latClamped = clampLat(lat);
  const sin = Math.sin((latClamped * Math.PI) / 180);
  const scale = TILE_SIZE * (2 ** zoom);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function pickMapZoom(samples, width, height, padding) {
  if (samples.length <= 1) {
    return 14;
  }

  for (let zoom = 16; zoom >= 8; zoom -= 1) {
    const projected = samples.map((item) => lngLatToWorldPixel(item.lat, item.lng, zoom));
    const minX = Math.min(...projected.map((item) => item.x));
    const maxX = Math.max(...projected.map((item) => item.x));
    const minY = Math.min(...projected.map((item) => item.y));
    const maxY = Math.max(...projected.map((item) => item.y));
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    if (spanX <= (width - padding * 2) * 0.9 && spanY <= (height - padding * 2) * 0.9) {
      return zoom;
    }
  }

  return 8;
}

function getTileUrl(theme, z, x, y) {
  const template = TILE_THEMES[theme] || TILE_THEMES.light;
  return template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

function loadImage(url) {
  if (imageCache.has(url)) {
    return imageCache.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar tile do mapa'));
    img.src = url;
  });

  imageCache.set(url, promise);
  return promise;
}

function createViewport(samples, width, height, zoom) {
  const projectedSamples = samples.map((item) => lngLatToWorldPixel(item.lat, item.lng, zoom));
  const minX = Math.min(...projectedSamples.map((item) => item.x));
  const maxX = Math.max(...projectedSamples.map((item) => item.x));
  const minY = Math.min(...projectedSamples.map((item) => item.y));
  const maxY = Math.max(...projectedSamples.map((item) => item.y));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  const scale = Math.min(width / spanX, height / spanY, 1);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const worldWidth = width / scale;
  const worldHeight = height / scale;
  const minWorldX = centerX - worldWidth / 2;
  const minWorldY = centerY - worldHeight / 2;

  return {
    scale,
    minWorldX,
    minWorldY,
    worldWidth,
    worldHeight
  };
}

function projectToViewport(lat, lng, zoom, viewport) {
  const world = lngLatToWorldPixel(lat, lng, zoom);
  return {
    x: (world.x - viewport.minWorldX) * viewport.scale,
    y: (world.y - viewport.minWorldY) * viewport.scale
  };
}

async function drawTiles(ctx, width, height, zoom, viewport, theme) {
  const worldTiles = 2 ** zoom;
  const startTileX = Math.floor(viewport.minWorldX / TILE_SIZE);
  const endTileX = Math.floor((viewport.minWorldX + viewport.worldWidth) / TILE_SIZE);
  const startTileY = Math.floor(viewport.minWorldY / TILE_SIZE);
  const endTileY = Math.floor((viewport.minWorldY + viewport.worldHeight) / TILE_SIZE);
  const tilePx = TILE_SIZE * viewport.scale;

  const drawJobs = [];

  for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
    for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
      if (tileY < 0 || tileY >= worldTiles) continue;
      const wrappedTileX = ((tileX % worldTiles) + worldTiles) % worldTiles;
      const tileUrl = getTileUrl(theme, zoom, wrappedTileX, tileY);
      const left = ((tileX * TILE_SIZE) - viewport.minWorldX) * viewport.scale;
      const top = ((tileY * TILE_SIZE) - viewport.minWorldY) * viewport.scale;

      drawJobs.push(
        loadImage(tileUrl)
          .then((img) => {
            ctx.drawImage(img, left, top, tilePx + 1, tilePx + 1);
          })
          .catch(() => {
            ctx.fillStyle = '#101112';
            ctx.fillRect(left, top, tilePx + 1, tilePx + 1);
          })
      );
    }
  }

  await Promise.all(drawJobs);

  ctx.save();
  ctx.fillStyle = theme === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function buildCanvasBackground(ctx, width, height, theme) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  if (theme === 'dark') {
    gradient.addColorStop(0, '#0b0d10');
    gradient.addColorStop(1, '#121417');
  } else {
    gradient.addColorStop(0, '#f4f6f8');
    gradient.addColorStop(1, '#e8edf2');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawRouteLine(ctx, points) {
  if (points.length < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(254, 92, 43, 0.9)';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
      return;
    }
    ctx.lineTo(point.x, point.y);
  });

  ctx.stroke();
  ctx.restore();
}

function drawClientLines(ctx, clientPoint, points) {
  if (!points.length) return;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.82)';
  ctx.lineCap = 'round';
  points.forEach((point) => {
    ctx.beginPath();
    ctx.moveTo(clientPoint.x, clientPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  });
  ctx.restore();
}

function drawClientMarker(ctx, clientPoint) {
  ctx.save();

  // Halo
  ctx.beginPath();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.arc(clientPoint.x, clientPoint.y, 18, 0, Math.PI * 2);
  ctx.fill();

  // Dot
  ctx.beginPath();
  ctx.fillStyle = '#38bdf8';
  ctx.arc(clientPoint.x, clientPoint.y, 10, 0, Math.PI * 2);
  ctx.fill();

  // Letter
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', clientPoint.x, clientPoint.y);

  // Label pill
  const label = 'Cliente';
  ctx.font = 'bold 11px Arial';
  const textW = ctx.measureText(label).width;
  const padX = 8;
  const padY = 4;
  const boxW = textW + padX * 2;
  const boxH = 11 + padY * 2;
  const boxX = clientPoint.x - boxW / 2;
  const boxY = clientPoint.y + 16;

  ctx.fillStyle = 'rgba(10, 20, 50, 0.82)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 4);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, clientPoint.x, boxY + boxH / 2);

  ctx.restore();
}

function drawPointMarkers(ctx, points) {
  points.forEach((point, index) => {
    ctx.save();

    // Halo
    ctx.beginPath();
    ctx.fillStyle = 'rgba(254, 92, 43, 0.28)';
    ctx.arc(point.x, point.y, 16, 0, Math.PI * 2);
    ctx.fill();

    // Dot
    ctx.beginPath();
    ctx.fillStyle = '#fe5c2b';
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fill();

    // Number (white)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), point.x, point.y);

    // Name label
    const rawName = point.point?.nome || point.point?.name || '';
    if (rawName) {
      const label = rawName.length > 24 ? rawName.slice(0, 22) + '…' : rawName;
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      const textW = ctx.measureText(label).width;
      const padX = 8;
      const padY = 4;
      const boxW = textW + padX * 2;
      const boxH = 11 + padY * 2;
      const boxX = point.x - boxW / 2;
      const boxY = point.y + 14;

      // Pill background
      ctx.fillStyle = 'rgba(10, 10, 10, 0.78)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 4);
      ctx.fill();

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, point.x, boxY + boxH / 2);
    }

    ctx.restore();
  });
}

function drawLegend(ctx, width, height, withLine, withClient) {
  const baseX = 20;
  const baseY = height - 46;

  ctx.save();
  const legendW = 200 + (withLine ? 180 : 0) + (withClient ? 180 : 0);
  ctx.fillStyle = 'rgba(5, 5, 5, 0.72)';
  ctx.fillRect(baseX - 10, baseY - 18, legendW, 34);

  ctx.fillStyle = '#fe5c2b';
  ctx.beginPath();
  ctx.arc(baseX, baseY, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '12px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Pontos selecionados', baseX + 14, baseY);

  if (withLine) {
    const lineX = baseX + 150;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(254, 92, 43, 0.95)';
    ctx.lineWidth = 3;
    ctx.moveTo(lineX, baseY);
    ctx.lineTo(lineX + 24, baseY);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Conexao entre pontos', lineX + 32, baseY);
  }

  if (withClient) {
    const clientX = baseX + 180 + (withLine ? 180 : 0);
    ctx.beginPath();
    ctx.fillStyle = '#38bdf8';
    ctx.arc(clientX, baseY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Endereco do cliente', clientX + 14, baseY);
  }

  ctx.restore();
}

export async function buildSelectionMapCanvas(points = [], options = {}) {
  const width = Math.max(640, Number(options.width) || 1600);
  const height = Math.max(360, Number(options.height) || 900);
  const theme = options.theme === 'dark' ? 'dark' : 'light';
  const connectPoints = !!options.connectPoints;
  const clientCoords = options.clientCoords && Number.isFinite(Number(options.clientCoords.lat)) && Number.isFinite(Number(options.clientCoords.lng))
    ? { lat: Number(options.clientCoords.lat), lng: Number(options.clientCoords.lng) }
    : null;

  const validPoints = (Array.isArray(points) ? points : [])
    .map((point) => {
      const coords = resolvePointCoordinates(point);
      if (!coords) return null;
      return {
        point,
        ...coords
      };
    })
    .filter(Boolean);

  if (!validPoints.length) {
    throw new Error('Nao ha coordenadas validas para gerar o print do mapa.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  buildCanvasBackground(ctx, width, height, theme);

  const samples = validPoints.map((point) => ({ lat: point.lat, lng: point.lng }));

  const allSamples = clientCoords ? [...samples, clientCoords] : samples;
  const zoom = pickMapZoom(allSamples, width, height, 54);
  const viewport = createViewport(allSamples, width, height, zoom);

  await drawTiles(ctx, width, height, zoom, viewport, theme);

  const projectedPoints = validPoints.map((point) => ({
    ...point,
    ...projectToViewport(point.lat, point.lng, zoom, viewport)
  }));

  if (connectPoints) {
    drawRouteLine(ctx, projectedPoints);
  }

  if (clientCoords) {
    const projectedClient = {
      x: projectToViewport(clientCoords.lat, clientCoords.lng, zoom, viewport).x,
      y: projectToViewport(clientCoords.lat, clientCoords.lng, zoom, viewport).y
    };
    drawClientLines(ctx, projectedClient, projectedPoints);
    drawPointMarkers(ctx, projectedPoints);
    drawClientMarker(ctx, projectedClient);
    drawLegend(ctx, width, height, connectPoints, true);
  } else {
    drawPointMarkers(ctx, projectedPoints);
    drawLegend(ctx, width, height, connectPoints, false);
  }

  return canvas;
}

export async function buildSelectionMapDataUrl(points = [], options = {}) {
  const canvas = await buildSelectionMapCanvas(points, options);
  return canvas.toDataURL('image/png');
}

export async function downloadSelectionMapPng(points = [], options = {}) {
  const canvas = await buildSelectionMapCanvas(points, options);
  const fileName = options.fileName || `mapa-selecao-${new Date().toISOString().slice(0, 10)}.png`;

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error('Falha ao gerar imagem do mapa.'));
        return;
      }
      resolve(result);
    }, 'image/png');
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
