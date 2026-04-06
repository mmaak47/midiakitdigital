export const defaultSelectionCorners = [
  { x: 28, y: 28 },
  { x: 72, y: 28 },
  { x: 72, y: 62 },
  { x: 28, y: 62 }
];

const EDGE_POINT_COUNT = 8;

export const defaultDisplaySettings = {
  opacity: 0.96,
  brightness: 1.08,
  reflection: 0.18,
  spill: 0.14,
  ledPixelIntensity: 0.1,
  ledPixelSize: 5,
  glare: 0.12
};

export const defaultMediaParams = {
  mediaMode: 'led',       // 'led' | 'backlight' | 'frontlight'
  colorTemp: 4000,        // 3000=quente | 4000=neutro | 6500=frio
  textureIntensity: 0.5,  // 0-1
  lightAngle: 135,        // graus (frontlight)
  lightIntensity: 0.7,    // 0-1
  worn: false             // material novo/usado
};

export const defaultScreenStyle = {
  cornerRadius: 0
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizePoint(point, fallback) {
  return {
    x: clamp(toNumber(point?.x, fallback.x), 0, 100),
    y: clamp(toNumber(point?.y, fallback.y), 0, 100)
  };
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function expandQuadToEdgePoints(points) {
  return [
    points[0],
    midpoint(points[0], points[1]),
    points[1],
    midpoint(points[1], points[2]),
    points[2],
    midpoint(points[2], points[3]),
    points[3],
    midpoint(points[3], points[0])
  ];
}

function getNormalizedSelectionTemplate(pointCount) {
  const base = defaultSelectionCorners.map((point) => ({ ...point }));
  return pointCount === EDGE_POINT_COUNT ? expandQuadToEdgePoints(base) : base;
}

export function normalizeCorners(corners) {
  if (!Array.isArray(corners) || ![4, EDGE_POINT_COUNT].includes(corners.length)) return null;
  const template = getNormalizedSelectionTemplate(corners.length);
  const normalized = corners.map((point, index) => normalizePoint(point, template[index]));
  const normalizedEdgePoints = normalized.length === 4 ? expandQuadToEdgePoints(normalized) : normalized;
  const bounds = getSelectionBoundsRaw(normalizedEdgePoints);
  if (bounds.width < 2 || bounds.height < 2) return null;
  return normalizedEdgePoints;
}

export function normalizeDisplaySettings(input) {
  return {
    opacity: clamp(toNumber(input?.opacity, defaultDisplaySettings.opacity), 0.6, 1),
    brightness: clamp(toNumber(input?.brightness, defaultDisplaySettings.brightness), 0.7, 1.8),
    reflection: clamp(toNumber(input?.reflection, defaultDisplaySettings.reflection), 0, 0.55),
    spill: clamp(toNumber(input?.spill, defaultDisplaySettings.spill), 0, 0.45),
    ledPixelIntensity: clamp(toNumber(input?.ledPixelIntensity, defaultDisplaySettings.ledPixelIntensity), 0, 0.45),
    ledPixelSize: clamp(toNumber(input?.ledPixelSize, defaultDisplaySettings.ledPixelSize), 3, 14),
    glare: clamp(toNumber(input?.glare, defaultDisplaySettings.glare), 0, 0.4)
  };
}

export function normalizeScreenStyle(input) {
  return {
    cornerRadius: clamp(toNumber(input?.cornerRadius, defaultScreenStyle.cornerRadius), 0, 0.35)
  };
}

export function buildDefaultQuadAt(x = 50, y = 50) {
  const halfWidth = 18;
  const halfHeight = 12;
  return normalizeCorners([
    { x: x - halfWidth, y: y - halfHeight },
    { x: x + halfWidth, y: y - halfHeight },
    { x: x + halfWidth, y: y + halfHeight },
    { x: x - halfWidth, y: y + halfHeight }
  ]);
}

export function buildRectQuad(x0, y0, x1, y1) {
  const left = clamp(Math.min(x0, x1), 0, 100);
  const right = clamp(Math.max(x0, x1), 0, 100);
  const top = clamp(Math.min(y0, y1), 0, 100);
  const bottom = clamp(Math.max(y0, y1), 0, 100);
  return normalizeCorners([
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom }
  ]);
}

function rectConfigToCorners(raw) {
  const x = clamp(toNumber(raw?.x, 20), 0, 95);
  const y = clamp(toNumber(raw?.y, 25), 0, 95);
  const width = clamp(toNumber(raw?.width, 45), 3, 100 - x);
  const height = clamp(toNumber(raw?.height, 35), 3, 100 - y);
  return buildRectQuad(x, y, x + width, y + height);
}

function normalizeFaceConfig(inputFace, fallbackStyle = defaultScreenStyle) {
  const corners = normalizeCorners(inputFace?.corners || inputFace);
  if (!corners) return null;
  return {
    corners,
    display: normalizeDisplaySettings(inputFace?.display),
    style: normalizeScreenStyle({
      ...fallbackStyle,
      ...inputFace?.style
    })
  };
}

export function parseSimulationConfig(raw) {
  if (!raw) return null;

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const topLevelStyle = normalizeScreenStyle(parsed?.style);

    if (Array.isArray(parsed?.faces)) {
      const faces = parsed.faces
        .map((face) => normalizeFaceConfig(face, topLevelStyle))
        .filter(Boolean);

      if (!faces.length) return null;
      const activeFaceIndex = clamp(toNumber(parsed?.activeFaceIndex, 0), 0, Math.max(0, faces.length - 1));
      const activeFace = faces[activeFaceIndex] || faces[0];

      return {
        corners: activeFace.corners,
        display: activeFace.display,
        style: activeFace.style,
        faces,
        activeFaceIndex
      };
    }

    if (parsed?.corners) {
      const face = normalizeFaceConfig(parsed, topLevelStyle);
      if (!face) return null;
      return {
        corners: face.corners,
        display: face.display,
        style: face.style,
        faces: [face],
        activeFaceIndex: 0
      };
    }

    if (typeof parsed?.x !== 'undefined' || typeof parsed?.width !== 'undefined') {
      const face = normalizeFaceConfig({
        corners: rectConfigToCorners(parsed),
        display: parsed,
        style: parsed?.style
      }, topLevelStyle);
      if (!face) return null;
      return {
        corners: face.corners,
        display: face.display,
        style: face.style,
        faces: [face],
        activeFaceIndex: 0
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function serializeSimulationConfig({ corners, display, style, faces, activeFaceIndex = 0 } = {}) {
  const normalizedFaces = Array.isArray(faces)
    ? faces.map((face) => normalizeFaceConfig(face, style)).filter(Boolean)
    : [];

  if (!normalizedFaces.length) {
    const normalizedCorners = normalizeCorners(corners);
    if (!normalizedCorners) return '';
    return JSON.stringify({
      version: 2,
      corners: normalizedCorners,
      style: normalizeScreenStyle(style),
      ...(display ? { display: normalizeDisplaySettings(display) } : {})
    });
  }

  if (normalizedFaces.length === 1) {
    return JSON.stringify({
      version: 2,
      corners: normalizedFaces[0].corners,
      style: normalizedFaces[0].style,
      ...(normalizedFaces[0].display ? { display: normalizedFaces[0].display } : {})
    });
  }

  const selectedFaceIndex = clamp(toNumber(activeFaceIndex, 0), 0, normalizedFaces.length - 1);
  return JSON.stringify({
    version: 3,
    corners: normalizedFaces[selectedFaceIndex].corners,
    style: normalizedFaces[selectedFaceIndex].style,
    ...(normalizedFaces[selectedFaceIndex].display ? { display: normalizedFaces[selectedFaceIndex].display } : {}),
    activeFaceIndex: selectedFaceIndex,
    faces: normalizedFaces.map((face) => ({
      corners: face.corners,
      style: face.style,
      ...(face.display ? { display: face.display } : {})
    }))
  });
}

export function parseScreen(raw) {
  return parseSimulationConfig(raw)?.corners || null;
}

export function parseScreenStyle(raw) {
  return parseSimulationConfig(raw)?.style || { ...defaultScreenStyle };
}

function getSelectionBoundsRaw(corners) {
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: minX + (maxX - minX) / 2,
    centerY: minY + (maxY - minY) / 2
  };
}

export function getSelectionBounds(corners) {
  const normalized = normalizeCorners(corners) || normalizeCorners(defaultSelectionCorners);
  return getSelectionBoundsRaw(normalized);
}

function interpolateSegment(points, t) {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const clampedT = clamp(t, 0, 1);
  const scaled = clampedT * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const localT = scaled - index;
  const start = points[index];
  const end = points[index + 1];

  return {
    x: start.x + (end.x - start.x) * localT,
    y: start.y + (end.y - start.y) * localT
  };
}

function getEdgeControlPoints(corners) {
  if (!Array.isArray(corners) || corners.length < 4) return null;
  if (corners.length >= EDGE_POINT_COUNT) {
    return {
      top: [corners[0], corners[1], corners[2]],
      right: [corners[2], corners[3], corners[4]],
      bottom: [corners[6], corners[5], corners[4]],
      left: [corners[0], corners[7], corners[6]],
      quad: [corners[0], corners[2], corners[4], corners[6]]
    };
  }

  return {
    top: [corners[0], corners[1]],
    right: [corners[1], corners[2]],
    bottom: [corners[3], corners[2]],
    left: [corners[0], corners[3]],
    quad: [corners[0], corners[1], corners[2], corners[3]]
  };
}

function evaluateSurfacePoint(corners, u, v) {
  const edges = getEdgeControlPoints(corners);
  if (!edges) return { x: 0, y: 0 };

  const top = interpolateSegment(edges.top, u);
  const bottom = interpolateSegment(edges.bottom, u);
  const left = interpolateSegment(edges.left, v);
  const right = interpolateSegment(edges.right, v);
  const [tl, tr, br, bl] = edges.quad;
  const bilinear = bilerp(tl, tr, br, bl, u, v);

  return {
    x: (1 - v) * top.x + v * bottom.x + (1 - u) * left.x + u * right.x - bilinear.x,
    y: (1 - v) * top.y + v * bottom.y + (1 - u) * left.y + u * right.y - bilinear.y
  };
}

function bilerp(tl, tr, br, bl, u, v) {
  const top = {
    x: tl.x + (tr.x - tl.x) * u,
    y: tl.y + (tr.y - tl.y) * u
  };
  const bottom = {
    x: bl.x + (br.x - bl.x) * u,
    y: bl.y + (br.y - bl.y) * u
  };

  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v
  };
}

function getQuadAspect(corners) {
  const edges = getEdgeControlPoints(corners);
  const segmentLength = (points) => points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
  const topWidth = segmentLength(edges.top);
  const bottomWidth = segmentLength(edges.bottom);
  const leftHeight = segmentLength(edges.left);
  const rightHeight = segmentLength(edges.right);
  const width = Math.max(1, (topWidth + bottomWidth) / 2);
  const height = Math.max(1, (leftHeight + rightHeight) / 2);
  return width / height;
}

function computeSourceCrop(width, height, targetAspect) {
  let sx = 0;
  let sy = 0;
  let sw = width;
  let sh = height;
  const imageAspect = width / height;

  if (imageAspect > targetAspect) {
    sw = height * targetAspect;
    sx = (width - sw) / 2;
  } else {
    sh = width / targetAspect;
    sy = (height - sh) / 2;
  }

  return { sx, sy, sw, sh };
}

function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointTowards(from, to, distance) {
  const length = distanceBetween(from, to);
  if (!length) return { x: from.x, y: from.y };
  const ratio = distance / length;
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio
  };
}

function getRoundedCornerDescriptors(corners, style) {
  const radiusFactor = normalizeScreenStyle(style).cornerRadius;
  if (radiusFactor <= 0) return null;

  const cornerIndexes = corners.length >= EDGE_POINT_COUNT ? [0, 2, 4, 6] : [0, 1, 2, 3];

  return cornerIndexes.map((cornerIndex) => {
    const corner = corners[cornerIndex];
    const prev = corners[(cornerIndex + corners.length - 1) % corners.length];
    const next = corners[(cornerIndex + 1) % corners.length];
    const prevLength = distanceBetween(corner, prev);
    const nextLength = distanceBetween(corner, next);
    const offset = Math.min(prevLength, nextLength) * radiusFactor;
    const safeOffset = Math.min(offset, prevLength / 2.2, nextLength / 2.2);

    return {
      corner,
      inPoint: pointTowards(corner, prev, safeOffset),
      outPoint: pointTowards(corner, next, safeOffset)
    };
  });
}

function createQuadPath(ctx, corners, style) {
  const roundedCorners = getRoundedCornerDescriptors(corners, style);
  ctx.beginPath();

  if (!roundedCorners) {
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let index = 1; index < corners.length; index += 1) {
      ctx.lineTo(corners[index].x, corners[index].y);
    }
    ctx.closePath();
    return;
  }

  ctx.moveTo(roundedCorners[0].outPoint.x, roundedCorners[0].outPoint.y);
  for (let index = 0; index < roundedCorners.length; index += 1) {
    const current = roundedCorners[index];
    const next = roundedCorners[(index + 1) % roundedCorners.length];
    const betweenPoints = corners.length >= EDGE_POINT_COUNT
      ? [corners[(index * 2 + 1) % corners.length]]
      : [];

    betweenPoints.forEach((point) => {
      ctx.lineTo(point.x, point.y);
    });

    ctx.lineTo(next.inPoint.x, next.inPoint.y);
    ctx.quadraticCurveTo(next.corner.x, next.corner.y, next.outPoint.x, next.outPoint.y);
  }
  ctx.closePath();
}

function createPolygonPath(ctx, corners) {
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let index = 1; index < corners.length; index += 1) {
    ctx.lineTo(corners[index].x, corners[index].y);
  }
  ctx.closePath();
}

function isPrintedSurface(panelType) {
  const value = String(panelType || '').toLowerCase();
  return value.includes('frontlight') || value.includes('backlight');
}

function drawCreativeIntoQuad(ctx, creative, corners, display, style, options = {}) {
  if (!Array.isArray(corners) || corners.length < 4) return;
  const targetAspect = getQuadAspect(corners);
  const { sx, sy, sw, sh } = computeSourceCrop(creative.width, creative.height, targetAspect);
  const divisions = options.highQuality ? 18 : 10;

  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();

  for (let row = 0; row < divisions; row += 1) {
    const v0 = row / divisions;
    const v1 = (row + 1) / divisions;

    for (let column = 0; column < divisions; column += 1) {
      const u0 = column / divisions;
      const u1 = (column + 1) / divisions;

      const p00 = evaluateSurfacePoint(corners, u0, v0);
      const p10 = evaluateSurfacePoint(corners, u1, v0);
      const p11 = evaluateSurfacePoint(corners, u1, v1);
      const p01 = evaluateSurfacePoint(corners, u0, v1);

      const srcX = sx + sw * u0;
      const srcY = sy + sh * v0;
      const srcW = sw * (u1 - u0);
      const srcH = sh * (v1 - v0);

      ctx.save();
      ctx.globalAlpha = display.opacity;
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.clip();

      const a = (p10.x - p00.x) / srcW;
      const b = (p10.y - p00.y) / srcW;
      const c = (p01.x - p00.x) / srcH;
      const d = (p01.y - p00.y) / srcH;
      const e = p00.x - a * srcX - c * srcY;
      const f = p00.y - b * srcX - d * srcY;
      ctx.setTransform(a, b, c, d, e, f);
      ctx.drawImage(creative, 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawScreenGlow(ctx, corners, settings, style, canvasWidth, canvasHeight) {
  const bounds = getSelectionBoundsRaw(corners);
  const glowRadius = Math.max(canvasWidth, canvasHeight) * (0.14 + settings.spill * 0.25);

  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();
  ctx.globalCompositeOperation = 'screen';
  const radial = ctx.createRadialGradient(bounds.centerX, bounds.centerY, 0, bounds.centerX, bounds.centerY, glowRadius);
  radial.addColorStop(0, `rgba(255,255,255,${0.06 + (settings.brightness - 1) * 0.12})`);
  radial.addColorStop(0.55, `rgba(255,196,120,${settings.glare * 0.34})`);
  radial.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (settings.brightness > 1) {
    ctx.fillStyle = `rgba(255,255,255,${(settings.brightness - 1) * 0.08})`;
    createQuadPath(ctx, corners, style);
    ctx.fill();
  }
  ctx.restore();
}

function drawReflection(ctx, corners, settings, style) {
  if (settings.reflection <= 0) return;
  const bounds = getSelectionBoundsRaw(corners);
  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();
  ctx.translate(bounds.centerX, bounds.centerY);
  ctx.rotate((-18 * Math.PI) / 180);
  ctx.translate(-bounds.centerX, -bounds.centerY);
  const gradient = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.38, `rgba(255,255,255,${settings.reflection * 0.16})`);
  gradient.addColorStop(0.5, `rgba(255,255,255,${settings.reflection * 0.5})`);
  gradient.addColorStop(0.62, `rgba(255,255,255,${settings.reflection * 0.16})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(bounds.minX - bounds.width, bounds.minY - bounds.height, bounds.width * 3, bounds.height * 3);
  ctx.restore();
}

function getLedPattern(size, intensity) {
  const key = `${size}-${intensity}`;
  if (!getLedPattern.cache.has(key)) {
    const pitch = Math.max(4, Math.round(size));
    const tile = pitch * 3;
    const canvas = document.createElement('canvas');
    canvas.width = tile;
    canvas.height = tile;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Dark base — the gaps between LED dots
      ctx.fillStyle = `rgba(0,0,0,${0.35 + intensity * 0.45})`;
      ctx.fillRect(0, 0, tile, tile);

      // Draw illuminated LED dots in an RGB sub-pixel pattern
      const dotRadius = Math.max(1.2, pitch * 0.38);
      const cols = 3;
      const rows = 3;
      const spacingX = tile / cols;
      const spacingY = tile / rows;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cx = spacingX * (col + 0.5);
          const cy = spacingY * (row + 0.5);
          const alpha = 0.55 + intensity * 0.45;

          // Each dot is a bright circle with soft falloff
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, dotRadius * 1.2);
          gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
          gradient.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.6})`);
          gradient.addColorStop(0.85, `rgba(255,255,255,${alpha * 0.15})`);
          gradient.addColorStop(1, 'rgba(255,255,255,0)');

          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(cx, cy, dotRadius * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Subtle dark grid lines between dots
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(0,0,0,${0.15 + intensity * 0.25})`;
      ctx.lineWidth = Math.max(0.5, pitch * 0.08);
      for (let i = 0; i <= cols; i++) {
        ctx.beginPath();
        ctx.moveTo(spacingX * i, 0);
        ctx.lineTo(spacingX * i, tile);
        ctx.stroke();
      }
      for (let i = 0; i <= rows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, spacingY * i);
        ctx.lineTo(tile, spacingY * i);
        ctx.stroke();
      }
    }
    getLedPattern.cache.set(key, canvas);
  }
  return getLedPattern.cache.get(key);
}

getLedPattern.cache = new Map();

function drawLedPixels(ctx, corners, settings, style) {
  if (settings.ledPixelIntensity <= 0) return;
  const patternCanvas = getLedPattern(settings.ledPixelSize, settings.ledPixelIntensity);
  const pattern = ctx.createPattern(patternCanvas, 'repeat');
  if (!pattern) return;
  const bounds = getSelectionBoundsRaw(corners);

  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();

  // Multiply pass — darkens gaps between LED dots
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.4 + settings.ledPixelIntensity * 0.5;
  ctx.fillStyle = pattern;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);

  // Screen pass — brightens the LED dot centers
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.08 + settings.ledPixelIntensity * 0.22;
  ctx.fillStyle = pattern;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  ctx.restore();
}

function drawPrintedTexture(ctx, corners, settings, style) {
  const bounds = getSelectionBoundsRaw(corners);
  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();

  const texture = document.createElement('canvas');
  texture.width = 120;
  texture.height = 120;
  const textureCtx = texture.getContext('2d');
  if (textureCtx) {
    textureCtx.fillStyle = 'rgba(255,255,255,0.04)';
    textureCtx.fillRect(0, 0, 120, 120);
    textureCtx.strokeStyle = `rgba(255,255,255,${0.025 + settings.reflection * 0.04})`;
    textureCtx.lineWidth = 1;
    for (let i = 0; i < 120; i += 6) {
      textureCtx.beginPath();
      textureCtx.moveTo(i, 0);
      textureCtx.lineTo(i, 120);
      textureCtx.stroke();
      textureCtx.beginPath();
      textureCtx.moveTo(0, i);
      textureCtx.lineTo(120, i);
      textureCtx.stroke();
    }
  }

  const pattern = ctx.createPattern(texture, 'repeat');
  if (pattern) {
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = pattern;
    ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  }
  ctx.restore();
}

function drawLightSpill(ctx, corners, settings, style) {
  if (settings.spill <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.shadowColor = `rgba(255,175,106,${0.28 + settings.spill * 0.55})`;
  ctx.shadowBlur = 30 + settings.spill * 90;
  ctx.fillStyle = `rgba(255,255,255,${0.018 + settings.spill * 0.04})`;
  createQuadPath(ctx, corners, style);
  ctx.fill();
  ctx.restore();
}

// ─────────────────────────────────────────────
// MÍDIA IMPRESSA: BACKLIGHT & FRONTLIGHT
// ─────────────────────────────────────────────

function getWeaveTexture(type) {
  const key = `weave-${type}`;
  if (!getWeaveTexture.cache.has(key)) {
    const isCoarse = type === 'coarse';
    // Coarse = trama aberta (frontlight), Fine = trama fechada (backlight)
    const pitch = isCoarse ? 13 : 8;
    const threadW = isCoarse ? 2 : 1;
    const baseAlpha = isCoarse ? 0.32 : 0.18;

    const canvas = document.createElement('canvas');
    canvas.width = pitch;
    canvas.height = pitch;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, pitch, pitch);

      // Fio horizontal
      ctx.strokeStyle = `rgba(0,0,0,${baseAlpha * 0.65})`;
      ctx.lineWidth = threadW;
      ctx.beginPath();
      ctx.moveTo(0, pitch / 2);
      ctx.lineTo(pitch, pitch / 2);
      ctx.stroke();

      // Fio vertical
      ctx.beginPath();
      ctx.moveTo(pitch / 2, 0);
      ctx.lineTo(pitch / 2, pitch);
      ctx.stroke();

      // Nó de cruzamento (mais escuro)
      ctx.fillStyle = `rgba(0,0,0,${baseAlpha})`;
      ctx.beginPath();
      ctx.arc(pitch / 2, pitch / 2, threadW * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }

    getWeaveTexture.cache.set(key, canvas);
  }
  return getWeaveTexture.cache.get(key);
}
getWeaveTexture.cache = new Map();

function colorTempTint(kelvin) {
  // Retorna { r, g, b, a } para overlay de temperatura de cor
  if (kelvin <= 3200) {
    return { r: 255, g: 170, b: 70, a: 0.10 };   // quente âmbar
  } else if (kelvin >= 5800) {
    return { r: 180, g: 210, b: 255, a: 0.09 };   // frio azulado
  } else {
    return { r: 255, g: 230, b: 195, a: 0.05 };   // neutro, leve quente
  }
}

function drawWeaveOverlay(ctx, corners, style, type, intensity) {
  if (intensity <= 0) return;
  const bounds = getSelectionBoundsRaw(corners);
  const weaveCanvas = getWeaveTexture(type);
  const pattern = ctx.createPattern(weaveCanvas, 'repeat');
  if (!pattern) return;

  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.12 + intensity * 0.30;
  ctx.fillStyle = pattern;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  ctx.restore();
}

function drawColorTempOverlay(ctx, corners, style, kelvin, intensity) {
  const tint = colorTempTint(kelvin);
  if (tint.a <= 0) return;
  const bounds = getSelectionBoundsRaw(corners);

  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${tint.a * intensity})`;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  ctx.restore();
}

function drawBacklightMode(ctx, corners, style, params) {
  const bounds = getSelectionBoundsRaw(corners);
  const textureIntensity = clamp(params.textureIntensity ?? 0.5, 0, 1);
  const lightIntensity = clamp(params.lightIntensity ?? 0.7, 0, 1);
  const kelvin = params.colorTemp ?? 4000;

  // 1. Trama de tecido fina (multiply)
  drawWeaveOverlay(ctx, corners, style, 'fine', textureIntensity);

  // 2. Glow difuso do backlight (screen) — luz vem de trás, distribui-se do centro
  const cx = bounds.centerX;
  const cy = bounds.centerY;
  const glowR = Math.max(bounds.width, bounds.height) * 0.75;

  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();
  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  glow.addColorStop(0,   `rgba(255,255,255,${0.08 + lightIntensity * 0.14})`);
  glow.addColorStop(0.55, `rgba(255,255,255,${0.03 + lightIntensity * 0.05})`);
  glow.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  ctx.restore();

  // 3. Vinheta nas bordas (menos luz nas extremidades)
  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();
  const vigR = Math.max(bounds.width, bounds.height) * 0.65;
  const vignette = ctx.createRadialGradient(cx, cy, vigR * 0.52, cx, cy, vigR);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${0.18 + (1 - lightIntensity) * 0.14})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  ctx.restore();

  // 4. Desaturação leve (luz atravessa o tecido, lava as cores)
  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = 'rgba(128,128,128,0.12)';
  ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  ctx.restore();

  // 5. Temperatura de cor
  drawColorTempOverlay(ctx, corners, style, kelvin, lightIntensity);
}

function drawFrontlightMode(ctx, corners, style, params) {
  const bounds = getSelectionBoundsRaw(corners);
  const textureIntensity = clamp(params.textureIntensity ?? 0.5, 0, 1);
  const lightIntensity = clamp(params.lightIntensity ?? 0.7, 0, 1);
  const lightAngleRad = ((params.lightAngle ?? 135) * Math.PI) / 180;
  const kelvin = params.colorTemp ?? 4000;
  const worn = params.worn ?? false;

  // 1. Trama de lona grossa (multiply)
  drawWeaveOverlay(ctx, corners, style, 'coarse', textureIntensity);

  // 2. Highlight direcional (holofote frontal)
  const dx = Math.cos(lightAngleRad);
  const dy = Math.sin(lightAngleRad);
  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;
  const lightX = bounds.centerX - dx * halfW * 1.2;
  const lightY = bounds.centerY - dy * halfH * 1.2;
  const shadowX = bounds.centerX + dx * halfW * 1.2;
  const shadowY = bounds.centerY + dy * halfH * 1.2;

  // Highlight (screen)
  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();
  ctx.globalCompositeOperation = 'screen';
  const hilight = ctx.createLinearGradient(lightX, lightY, shadowX, shadowY);
  hilight.addColorStop(0,    `rgba(255,255,255,${0.16 + lightIntensity * 0.22})`);
  hilight.addColorStop(0.40, `rgba(255,255,255,${0.05 + lightIntensity * 0.07})`);
  hilight.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = hilight;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  ctx.restore();

  // Sombra no lado oposto (multiply)
  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  const shadow = ctx.createLinearGradient(lightX, lightY, shadowX, shadowY);
  shadow.addColorStop(0,    'rgba(255,255,255,1)');   // lado iluminado — sem escurecimento
  shadow.addColorStop(0.55, `rgba(215,215,215,${0.55 + (1 - lightIntensity) * 0.2})`);
  shadow.addColorStop(1,    `rgba(140,140,140,${0.45 + (1 - lightIntensity) * 0.25})`);
  ctx.fillStyle = shadow;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  ctx.restore();

  // 3. Micro-sombras na trama via normal-map simplificado (overlay escuro deslocado)
  if (textureIntensity > 0.15) {
    const coarseCanvas = getWeaveTexture('coarse');
    const pattern = ctx.createPattern(coarseCanvas, 'repeat');
    if (pattern) {
      ctx.save();
      createQuadPath(ctx, corners, style);
      ctx.clip();
      ctx.translate(dx * 1.2, dy * 1.2);   // desloca sombra na direção da luz
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.08 + textureIntensity * 0.12;
      ctx.fillStyle = pattern;
      ctx.fillRect(bounds.minX - 4, bounds.minY - 4, bounds.width + 8, bounds.height + 8);
      ctx.restore();
    }
  }

  // 4. Temperatura de cor
  drawColorTempOverlay(ctx, corners, style, kelvin, lightIntensity);

  // 5. Efeitos de material usado (opcional)
  if (worn) {
    // Sujeira acumulada na borda inferior
    ctx.save();
    createQuadPath(ctx, corners, style);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    const dirt = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.minX, bounds.maxY);
    dirt.addColorStop(0.65, 'rgba(80,60,40,0)');
    dirt.addColorStop(1,    'rgba(80,60,40,0.18)');
    ctx.fillStyle = dirt;
    ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
    ctx.restore();

    // Vincos de tensão horizontais suaves
    ctx.save();
    createQuadPath(ctx, corners, style);
    ctx.clip();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 0.9;
    for (let i = 1; i <= 4; i++) {
      const wy = bounds.minY + bounds.height * (i / 5);
      ctx.beginPath();
      ctx.moveTo(bounds.minX, wy);
      ctx.lineTo(bounds.maxX, wy);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRoundedCornerMask(ctx, corners, style) {
  const normalizedStyle = normalizeScreenStyle(style);
  if (normalizedStyle.cornerRadius <= 0) return;

  ctx.save();
  createPolygonPath(ctx, corners);
  createQuadPath(ctx, corners, normalizedStyle);
  ctx.fillStyle = 'rgba(6, 8, 12, 0.58)';
  ctx.fill('evenodd');

  ctx.globalCompositeOperation = 'multiply';
  createPolygonPath(ctx, corners);
  createQuadPath(ctx, corners, normalizedStyle);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.fill('evenodd');
  ctx.restore();
}

function drawQuadOutline(ctx, corners, settings, style) {
  ctx.save();
  createQuadPath(ctx, corners, style);
  ctx.strokeStyle = `rgba(255,255,255,${0.12 + settings.reflection * 0.25})`;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem para simulacao'));
    img.src = url;
  });
}

export async function generateSimulationPreview({
  baseImageUrl,
  creativeImageUrl,
  screen,
  displaySettings,
  panelType,
  mediaParams,
  maxWidth = 1800
}) {
  const parsedConfig = screen?.corners ? screen : parseSimulationConfig(screen);
  const faces = Array.isArray(parsedConfig?.faces) && parsedConfig.faces.length
    ? parsedConfig.faces
    : [parsedConfig];
  const normalizedFaces = faces
    .map((face) => ({
      corners: normalizeCorners(face?.corners || face),
      style: normalizeScreenStyle(face?.style || parsedConfig?.style),
      display: normalizeDisplaySettings({
        ...parsedConfig?.display,
        ...face?.display,
        ...displaySettings
      })
    }))
    .filter((face) => Array.isArray(face.corners));

  if (!normalizedFaces.length) throw new Error('Area da tela nao configurada');

  const firstFace = normalizedFaces[0];

  const [base, creative] = await Promise.all([
    loadImage(baseImageUrl),
    loadImage(creativeImageUrl)
  ]);

  const scale = base.width > maxWidth ? (maxWidth / base.width) : 1;
  const outW = Math.max(1, Math.round(base.width * scale));
  const outH = Math.max(1, Math.round(base.height * scale));
  const scaledFaces = normalizedFaces.map((face) => ({
    corners: face.corners.map((point) => ({
      x: (point.x / 100) * outW,
      y: (point.y / 100) * outH
    })),
    style: face.style,
    settings: face.display
  }));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponivel para simulacao');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, 0, 0, outW, outH);

  // Determina o modo de mídia: parâmetro explícito prevalece,
  // fallback para inferência pelo tipo do painel (legado)
  const resolvedParams = { ...defaultMediaParams, ...mediaParams };
  const mode = resolvedParams.mediaMode || (isPrintedSurface(panelType) ? 'backlight' : 'led');
  const isLed = mode === 'led';

  scaledFaces.forEach((face) => {
    drawCreativeIntoQuad(ctx, creative, face.corners, face.settings, face.style, {
      highQuality: !isLed
    });
    drawRoundedCornerMask(ctx, face.corners, face.style);

    if (isLed) {
      // Modo LED — comportamento original inalterado
      drawLightSpill(ctx, face.corners, face.settings, face.style);
      drawScreenGlow(ctx, face.corners, face.settings, face.style, outW, outH);
      drawReflection(ctx, face.corners, face.settings, face.style);
      drawLedPixels(ctx, face.corners, face.settings, face.style);
    } else if (mode === 'backlight') {
      drawBacklightMode(ctx, face.corners, face.style, resolvedParams);
    } else if (mode === 'frontlight') {
      drawFrontlightMode(ctx, face.corners, face.style, resolvedParams);
    }

    drawQuadOutline(ctx, face.corners, face.settings, face.style);
  });

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error('Falha ao exportar imagem da simulacao'));
        return;
      }
      resolve(value);
    }, 'image/png', 0.92);
  });

  const previewUrl = URL.createObjectURL(blob);
  return {
    blob,
    previewUrl,
    screen: {
      corners: firstFace.corners,
      display: firstFace.settings,
      style: firstFace.style,
      faces: normalizedFaces.map((face) => ({
        corners: face.corners,
        display: face.settings,
        style: face.style
      }))
    }
  };
}