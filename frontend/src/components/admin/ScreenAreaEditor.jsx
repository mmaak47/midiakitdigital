import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Minus, Plus, RefreshCcw, Trash2, Shrink, Expand } from 'lucide-react';
import {
  buildDefaultQuadAt,
  buildRectQuad,
  defaultSelectionCorners,
  getSelectionBounds,
  normalizeCorners,
  normalizeScreenStyle
} from '../../lib/simulation';

const HANDLE_RADIUS = 0.55;
const EDGE_HIT_STROKE = 1.8;
const HANDLE_HIT_RADIUS = 2;
const SELECTION_STROKE = 0.05;
const GRID_STROKE = 0.05;
// Permite zoom out (25%) para enxergar a foto inteira em telas pequenas
// quando a imagem do ponto e muito alta/larga, e zoom in ate 400% para
// ajuste fino dos cantos.
const MIN_ZOOM = 25;
const MAX_ZOOM = 400;
const ZOOM_STEP = 10;
const ROUNDED_PRESET_RADIUS = 0.18;

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
  if (corners.length >= 8) {
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

function polylineForInterpolation(corners, fixedAxis, value) {
  const points = [];
  for (let index = 0; index <= 10; index += 1) {
    const variable = index / 10;
    const point = fixedAxis === 'u'
      ? evaluateSurfacePoint(corners, value, variable)
      : evaluateSurfacePoint(corners, variable, value);
    points.push(`${point.x},${point.y}`);
  }
  return points.join(' ');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function buildSelectionPath(corners, style) {
  const cornerRadius = normalizeScreenStyle(style).cornerRadius;
  if (!cornerRadius) {
    return `M ${corners[0].x} ${corners[0].y} ${corners.slice(1).map((point) => `L ${point.x} ${point.y}`).join(' ')} Z`;
  }

  const cornerIndexes = corners.length >= 8 ? [0, 2, 4, 6] : [0, 1, 2, 3];
  const descriptors = cornerIndexes.map((cornerIndex) => {
    const corner = corners[cornerIndex];
    const prev = corners[(cornerIndex + corners.length - 1) % corners.length];
    const next = corners[(cornerIndex + 1) % corners.length];
    const prevLength = distanceBetween(corner, prev);
    const nextLength = distanceBetween(corner, next);
    const offset = Math.min(prevLength, nextLength) * cornerRadius;
    const safeOffset = Math.min(offset, prevLength / 2.2, nextLength / 2.2);
    return {
      corner,
      inPoint: pointTowards(corner, prev, safeOffset),
      outPoint: pointTowards(corner, next, safeOffset)
    };
  });

  const commands = [`M ${descriptors[0].outPoint.x} ${descriptors[0].outPoint.y}`];
  for (let index = 0; index < descriptors.length; index += 1) {
    const next = descriptors[(index + 1) % descriptors.length];
    if (corners.length >= 8) {
      const midpoint = corners[(index * 2 + 1) % corners.length];
      commands.push(`L ${midpoint.x} ${midpoint.y}`);
    }
    commands.push(`L ${next.inPoint.x} ${next.inPoint.y}`);
    commands.push(`Q ${next.corner.x} ${next.corner.y} ${next.outPoint.x} ${next.outPoint.y}`);
  }
  commands.push('Z');
  return commands.join(' ');
}

export default function ScreenAreaEditor({ imageUrl, corners, style, onChange, onStyleChange }) {
  const editorRootRef = useRef(null);
  const stageRef = useRef(null);
  const viewportRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [panDrag, setPanDrag] = useState(null);
  const [helper, setHelper] = useState('Arraste no fundo para criar a área. Clique num canto para selecioná-lo e use as setas para ajuste fino.');
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCornerIndex, setSelectedCornerIndex] = useState(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === editorRootRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const normalizedCorners = useMemo(() => normalizeCorners(corners), [corners]);
  const normalizedStyle = useMemo(() => normalizeScreenStyle(style), [style]);
  const hasSelection = !!normalizedCorners;
  const activeCorners = normalizedCorners || defaultSelectionCorners;
  const bounds = getSelectionBounds(activeCorners);
  const selectionPath = useMemo(() => buildSelectionPath(activeCorners, normalizedStyle), [activeCorners, normalizedStyle]);

  const toPercentPoint = (event) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
    };
  };

  const applyNext = (nextCorners) => {
    const normalized = normalizeCorners(nextCorners);
    if (normalized) onChange(normalized);
  };

  // Movimenta apenas o canto selecionado em "step" pontos percentuais.
  const nudgeSelectedCorner = (dx, dy) => {
    if (!normalizedCorners || selectedCornerIndex === null) return;
    const next = normalizedCorners.map((corner, idx) => (
      idx === selectedCornerIndex
        ? { x: clamp(corner.x + dx, 0, 100), y: clamp(corner.y + dy, 0, 100) }
        : corner
    ));
    applyNext(next);
  };

  // Encolhe ou expande a seleção inteira em relação ao centroide.
  // Útil quando aparece uma fina "borda branca" porque a seleção ficou
  // ligeiramente menor que a tela real na foto.
  const scaleSelectionFromCentroid = (factor) => {
    if (!normalizedCorners) return;
    const cx = normalizedCorners.reduce((acc, p) => acc + p.x, 0) / normalizedCorners.length;
    const cy = normalizedCorners.reduce((acc, p) => acc + p.y, 0) / normalizedCorners.length;
    const next = normalizedCorners.map((corner) => ({
      x: clamp(cx + (corner.x - cx) * factor, 0, 100),
      y: clamp(cy + (corner.y - cy) * factor, 0, 100)
    }));
    applyNext(next);
  };

  useEffect(() => {
    if (selectedCornerIndex === null) return undefined;
    const handler = (event) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const target = event.target;
      const isFormField = target instanceof HTMLElement && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      );
      if (isFormField) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.2 : event.altKey ? 5 : 1;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      nudgeSelectedCorner(dx, dy);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCornerIndex, normalizedCorners]);

  const updateZoom = (nextZoom) => {
    setZoom(clamp(nextZoom, MIN_ZOOM, MAX_ZOOM));
  };

  const updateStyle = (nextStyle) => {
    onStyleChange?.(normalizeScreenStyle(nextStyle));
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === editorRootRef.current) {
        await document.exitFullscreen();
        return;
      }
      if (!document.fullscreenElement && editorRootRef.current) {
        await editorRootRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error('Falha ao alternar fullscreen:', error);
    }
  };

  const handleWheelZoom = (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    updateZoom(zoom + delta);
  };

  const startPanDrag = (event) => {
    if (event.button !== 1 || zoom <= MIN_ZOOM || !viewportRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewportRef.current.scrollLeft,
      startScrollTop: viewportRef.current.scrollTop
    });
    setHelper('Arraste com o botão do meio pressionado para navegar na imagem ampliada.');
  };

  const handlePanMove = (event) => {
    if (!panDrag || event.pointerId !== panDrag.pointerId || !viewportRef.current) return;
    event.preventDefault();
    const dx = event.clientX - panDrag.startX;
    const dy = event.clientY - panDrag.startY;
    viewportRef.current.scrollLeft = panDrag.startScrollLeft - dx;
    viewportRef.current.scrollTop = panDrag.startScrollTop - dy;
  };

  const stopPanDrag = (event) => {
    if (!panDrag || event.pointerId !== panDrag.pointerId) return;
    setPanDrag(null);
  };

  const startBackgroundSelection = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = toPercentPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ kind: 'create', pointerId: event.pointerId, start: point });
    setHelper('Solte o mouse para finalizar a nova área.');
  };

  const startCornerDrag = (event, index) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!normalizedCorners) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedCornerIndex(index);
    setDrag({
      kind: 'corner',
      pointerId: event.pointerId,
      index,
      start: toPercentPoint(event),
      startCorners: normalizedCorners.map((point) => ({ ...point }))
    });
    setHelper('Arraste o canto. Você também pode usar as setas do teclado (Shift = passo fino, Alt = passo grosso).');
  };

  const startEdgeDrag = (event, edge) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!normalizedCorners) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      kind: 'edge',
      pointerId: event.pointerId,
      edge,
      start: toPercentPoint(event),
      startCorners: normalizedCorners.map((point) => ({ ...point }))
    });
    setHelper('Arraste a aresta para expandir ou contrair a tela.');
  };

  const startQuadDrag = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!normalizedCorners) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      kind: 'quad',
      pointerId: event.pointerId,
      start: toPercentPoint(event),
      startCorners: normalizedCorners.map((point) => ({ ...point }))
    });
    setHelper('Arraste a área inteira para reposicionar a tela.');
  };

  const handlePointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = toPercentPoint(event);
    if (!point) return;

    if (drag.kind === 'create') {
      applyNext(buildRectQuad(drag.start.x, drag.start.y, point.x, point.y));
      return;
    }

    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    const next = drag.startCorners.map((corner) => ({ ...corner }));

    if (drag.kind === 'corner') {
      next[drag.index] = {
        x: clamp(drag.startCorners[drag.index].x + dx, 0, 100),
        y: clamp(drag.startCorners[drag.index].y + dy, 0, 100)
      };
      applyNext(next);
      return;
    }

    if (drag.kind === 'edge') {
      const mapping = {
        top: next.length >= 8 ? [0, 1, 2] : [0, 1],
        right: next.length >= 8 ? [2, 3, 4] : [1, 2],
        bottom: next.length >= 8 ? [4, 5, 6] : [2, 3],
        left: next.length >= 8 ? [6, 7, 0] : [3, 0]
      };
      mapping[drag.edge].forEach((pointIndex) => {
        next[pointIndex] = {
          x: clamp(drag.startCorners[pointIndex].x + dx, 0, 100),
          y: clamp(drag.startCorners[pointIndex].y + dy, 0, 100)
        };
      });
      applyNext(next);
      return;
    }

    if (drag.kind === 'quad') {
      const adjusted = drag.startCorners.map((corner) => ({
        x: clamp(corner.x + dx, 0, 100),
        y: clamp(corner.y + dy, 0, 100)
      }));
      const adjustedBounds = getSelectionBounds(adjusted);
      const offsetX = adjustedBounds.minX < 0 ? -adjustedBounds.minX : adjustedBounds.maxX > 100 ? 100 - adjustedBounds.maxX : 0;
      const offsetY = adjustedBounds.minY < 0 ? -adjustedBounds.minY : adjustedBounds.maxY > 100 ? 100 - adjustedBounds.maxY : 0;
      applyNext(adjusted.map((corner) => ({ x: corner.x + offsetX, y: corner.y + offsetY })));
    }
  };

  const handlePointerUp = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.kind === 'create') {
      const point = toPercentPoint(event) || drag.start;
      const dx = Math.abs(point.x - drag.start.x);
      const dy = Math.abs(point.y - drag.start.y);
      if (dx < 1.5 && dy < 1.5) {
        onChange(buildDefaultQuadAt(point.x, point.y));
      }
    }
    setDrag(null);
    setHelper('Arraste cantos, arestas ou a área interna. Scroll do mouse aplica zoom (25%–400%). Botão do meio move a área ampliada.');
  };

  const pointMode = activeCorners.length >= 8 ? '8 pontos' : '4 pontos';

  return (
    <div ref={editorRootRef} className={isFullscreen ? 'h-screen w-screen overflow-auto bg-black p-4 space-y-3' : 'space-y-3'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray-400">Editor de tela</p>
          <p className="text-[11px] text-brand-gray-500">Marcação visual com warp por cantos, pontos intermediários e arestas. Scroll aplica zoom (25%–400%) e botão do meio move a área com zoom.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {isFullscreen ? 'Sair tela cheia' : 'Tela cheia'}
          </button>
          <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/5">
            <button
              type="button"
              onClick={() => updateZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              className="inline-flex h-9 w-9 items-center justify-center text-brand-gray-300 hover:bg-white/10 disabled:opacity-40"
            >
              <Minus size={14} />
            </button>
            <span className="min-w-[56px] px-2 text-center text-xs font-semibold text-white">{zoom}%</span>
            <button
              type="button"
              onClick={() => updateZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              className="inline-flex h-9 w-9 items-center justify-center text-brand-gray-300 hover:bg-white/10 disabled:opacity-40"
            >
              <Plus size={14} />
            </button>
          </div>
          <button type="button" onClick={() => updateZoom(50)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10" title="Reduz para 50% — útil para ver a foto inteira em fotos altas">
            50%
          </button>
          <button type="button" onClick={() => updateZoom(100)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
            100%
          </button>
          <button type="button" onClick={() => onChange(buildDefaultQuadAt(bounds.centerX, bounds.centerY))} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
            <RefreshCcw size={14} />
            Centralizar
          </button>
          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => scaleSelectionFromCentroid(0.98)}
            title="Encolher 2% — útil quando aparece uma fina borda da tela ao redor do criativo"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-40"
          >
            <Shrink size={14} />
            Encolher
          </button>
          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => scaleSelectionFromCentroid(1.02)}
            title="Expandir 2% — cobre folgas remanescentes na seleção"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-40"
          >
            <Expand size={14} />
            Expandir
          </button>
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
            <Trash2 size={14} />
            Limpar
          </button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 lg:grid-cols-[auto_auto_1fr] lg:items-end">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-gray-400">Formato da seleção</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateStyle({ cornerRadius: 0 })}
              className={`rounded-lg border px-3 py-2 text-xs transition-colors ${normalizedStyle.cornerRadius === 0 ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}`}
            >
              Retangular
            </button>
            <button
              type="button"
              onClick={() => updateStyle({ cornerRadius: ROUNDED_PRESET_RADIUS })}
              className={`rounded-lg border px-3 py-2 text-xs transition-colors ${normalizedStyle.cornerRadius > 0 ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}`}
            >
              Arredondada
            </button>
          </div>
        </div>

        <label className="block min-w-[220px]">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-brand-gray-400">Curvatura dos cantos</span>
          <input
            type="range"
            min="0"
            max="35"
            step="1"
            value={Math.round(normalizedStyle.cornerRadius * 100)}
            onChange={(event) => updateStyle({ cornerRadius: Number(event.target.value) / 100 })}
            className="w-full accent-brand-orange"
          />
        </label>

        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-brand-gray-300">
          {normalizedStyle.cornerRadius > 0 ? `Seleção arredondada com ${Math.round(normalizedStyle.cornerRadius * 100)}% de curvatura.` : 'Seleção retangular padrão.'}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
        <div
          ref={viewportRef}
          className={`overflow-auto rounded-xl border border-white/10 bg-black ${isFullscreen ? 'max-h-[calc(100vh-190px)]' : 'max-h-[62vh]'}`}
          onWheel={handleWheelZoom}
          onPointerDown={startPanDrag}
          onPointerMove={handlePanMove}
          onPointerUp={stopPanDrag}
          onPointerCancel={stopPanDrag}
          onMouseDown={(event) => {
            if (event.button === 1) event.preventDefault();
          }}
          style={{ cursor: panDrag ? 'grabbing' : zoom > MIN_ZOOM ? 'grab' : 'default' }}
        >
          <div
            ref={stageRef}
            className="relative mx-auto"
            style={{ width: `${zoom}%`, minWidth: zoom >= 100 ? '100%' : undefined }}
          >
            <img src={imageUrl} alt="Base do ponto" className="block w-full h-auto select-none" draggable="false" />

            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full touch-none select-none"
              onPointerDown={startBackgroundSelection}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ cursor: drag ? 'crosshair' : hasSelection ? 'default' : 'crosshair' }}
            >
              <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.12)" />

              {hasSelection && (
                <>
                  <path d={selectionPath} fill="rgba(254,92,43,0.05)" stroke="rgba(254,92,43,0.55)" strokeWidth={SELECTION_STROKE} />

                  {Array.from({ length: 4 }).map((_, index) => (
                    <polyline key={`grid-h-${index}`} points={polylineForInterpolation(activeCorners, 'v', (index + 1) / 5)} fill="none" stroke="rgba(255,255,255,0.11)" strokeWidth={GRID_STROKE} />
                  ))}

                  {Array.from({ length: 4 }).map((_, index) => (
                    <polyline key={`grid-v-${index}`} points={polylineForInterpolation(activeCorners, 'u', (index + 1) / 5)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={GRID_STROKE} />
                  ))}

                  <path d={selectionPath} fill="transparent" onPointerDown={startQuadDrag} style={{ cursor: 'move' }} />

                  {[
                    { key: 'top', a: activeCorners[0], b: activeCorners[1] },
                    { key: 'right', a: activeCorners[1], b: activeCorners[2] },
                    { key: 'bottom', a: activeCorners[2], b: activeCorners[3] },
                    { key: 'left', a: activeCorners[3], b: activeCorners[0] }
                  ].map((edge) => (
                    <line
                      key={edge.key}
                      x1={edge.a.x}
                      y1={edge.a.y}
                      x2={edge.b.x}
                      y2={edge.b.y}
                      stroke="transparent"
                      strokeWidth={EDGE_HIT_STROKE}
                      onPointerDown={(event) => startEdgeDrag(event, edge.key)}
                      style={{ cursor: edge.key === 'top' || edge.key === 'bottom' ? 'ns-resize' : 'ew-resize' }}
                    />
                  ))}

                  {activeCorners.map((point, index) => {
                    const isSelected = selectedCornerIndex === index;
                    return (
                      <g key={`handle-${index}`}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={HANDLE_HIT_RADIUS}
                          fill="transparent"
                          onPointerDown={(event) => startCornerDrag(event, index)}
                          style={{ cursor: 'grab' }}
                        />
                        {isSelected && (
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r={HANDLE_RADIUS * 1.9}
                            fill="none"
                            stroke="rgba(254,92,43,0.95)"
                            strokeWidth="0.18"
                            pointerEvents="none"
                          />
                        )}
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={HANDLE_RADIUS}
                          fill={isSelected ? 'rgba(254,92,43,0.85)' : 'rgba(0,0,0,0.3)'}
                          stroke={isSelected ? 'rgba(255,255,255,0.95)' : 'rgba(254,92,43,0.35)'}
                          strokeWidth="0.16"
                          pointerEvents="none"
                        />
                      </g>
                    );
                  })}
                </>
              )}
            </svg>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[11px] text-brand-gray-400 uppercase tracking-wide mb-2">Como usar</p>
          <p className="text-sm text-brand-gray-300">{helper}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[11px] text-brand-gray-400 uppercase tracking-wide mb-2">Leitura rápida</p>
          <div className="space-y-1 text-sm text-brand-gray-300">
            <div>Formato: {normalizedStyle.cornerRadius > 0 ? 'Arredondado' : 'Retangular'}</div>
            <div>Controle: {pointMode}</div>
            <div>Largura: {bounds.width.toFixed(1)}%</div>
            <div>Altura: {bounds.height.toFixed(1)}%</div>
            <div>Centro X: {bounds.centerX.toFixed(1)}%</div>
            <div>Centro Y: {bounds.centerY.toFixed(1)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}