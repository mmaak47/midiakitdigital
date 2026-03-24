import { useMemo, useRef, useState } from 'react';
import { RefreshCcw, Trash2 } from 'lucide-react';
import {
  buildDefaultQuadAt,
  buildRectQuad,
  defaultSelectionCorners,
  getSelectionBounds,
  normalizeCorners
} from '../../lib/simulation';

const HANDLE_RADIUS = 1.8;

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

function polylineForInterpolation(corners, fixedAxis, value) {
  const points = [];
  for (let index = 0; index <= 10; index += 1) {
    const variable = index / 10;
    const point = fixedAxis === 'u'
      ? bilerp(corners[0], corners[1], corners[2], corners[3], value, variable)
      : bilerp(corners[0], corners[1], corners[2], corners[3], variable, value);
    points.push(`${point.x},${point.y}`);
  }
  return points.join(' ');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function ScreenAreaEditor({ imageUrl, corners, onChange }) {
  const stageRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [helper, setHelper] = useState('Arraste no fundo para criar a área. Depois ajuste cantos, arestas ou a área inteira.');

  const normalizedCorners = useMemo(() => normalizeCorners(corners), [corners]);
  const hasSelection = !!normalizedCorners;
  const activeCorners = normalizedCorners || defaultSelectionCorners;
  const bounds = getSelectionBounds(activeCorners);

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

  const startBackgroundSelection = (event) => {
    const point = toPercentPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ kind: 'create', pointerId: event.pointerId, start: point });
    setHelper('Solte o mouse para finalizar a nova área.');
  };

  const startCornerDrag = (event, index) => {
    if (!normalizedCorners) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      kind: 'corner',
      pointerId: event.pointerId,
      index,
      start: toPercentPoint(event),
      startCorners: normalizedCorners.map((point) => ({ ...point }))
    });
    setHelper('Arraste o canto para ajuste fino da perspectiva.');
  };

  const startEdgeDrag = (event, edge) => {
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
        top: [0, 1],
        right: [1, 2],
        bottom: [2, 3],
        left: [3, 0]
      };
      const [first, second] = mapping[drag.edge];
      next[first] = {
        x: clamp(drag.startCorners[first].x + dx, 0, 100),
        y: clamp(drag.startCorners[first].y + dy, 0, 100)
      };
      next[second] = {
        x: clamp(drag.startCorners[second].x + dx, 0, 100),
        y: clamp(drag.startCorners[second].y + dy, 0, 100)
      };
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
    setHelper('Arraste cantos, arestas ou a área interna. Para criar outra seleção, arraste no fundo novamente.');
  };

  const polygonPoints = activeCorners.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray-400">Editor de tela</p>
          <p className="text-[11px] text-brand-gray-500">Marcação visual no estilo do simulador, com perspectiva por cantos e arestas.</p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onChange(buildDefaultQuadAt(bounds.centerX, bounds.centerY))} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
            <RefreshCcw size={14} />
            Centralizar
          </button>
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">
            <Trash2 size={14} />
            Limpar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
        <div ref={stageRef} className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
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
                <polygon points={polygonPoints} fill="rgba(254,92,43,0.14)" stroke="rgba(254,92,43,0.85)" strokeWidth="0.35" />

                {Array.from({ length: 4 }).map((_, index) => (
                  <polyline key={`grid-h-${index}`} points={polylineForInterpolation(activeCorners, 'v', (index + 1) / 5)} fill="none" stroke="rgba(255,255,255,0.24)" strokeWidth="0.18" />
                ))}

                {Array.from({ length: 4 }).map((_, index) => (
                  <polyline key={`grid-v-${index}`} points={polylineForInterpolation(activeCorners, 'u', (index + 1) / 5)} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.18" />
                ))}

                <polygon points={polygonPoints} fill="transparent" onPointerDown={startQuadDrag} style={{ cursor: 'move' }} />

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
                    strokeWidth="4"
                    onPointerDown={(event) => startEdgeDrag(event, edge.key)}
                    style={{ cursor: edge.key === 'top' || edge.key === 'bottom' ? 'ns-resize' : 'ew-resize' }}
                  />
                ))}

                {activeCorners.map((point, index) => (
                  <g key={`handle-${index}`}>
                    <circle cx={point.x} cy={point.y} r={HANDLE_RADIUS * 1.8} fill="transparent" onPointerDown={(event) => startCornerDrag(event, index)} style={{ cursor: 'grab' }} />
                    <circle cx={point.x} cy={point.y} r={HANDLE_RADIUS} fill="white" stroke="rgba(254,92,43,0.95)" strokeWidth="0.45" pointerEvents="none" />
                  </g>
                ))}
              </>
            )}
          </svg>
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