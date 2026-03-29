import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import * as Pretext from '@chenglou/pretext';

const BRAND_BLACK = '#000000';
const BRAND_ORANGE = '#FE5C2B';
const BRAND_GRAY_300 = '#D4D4D4';
const BRAND_GRAY_700 = '#404040';
const LINE_HEIGHT = 22;
const FONT = '14px Montserrat';
const PADDING = 24;
const MIN_LINE_WIDTH = 60;

const CORPUS = 'Cada ponto de mídia conta uma história. Elevadores, painéis LED, telas indoor e totens digitais formam um ecossistema de presença urbana que conecta marcas a pessoas no momento certo. A Intermidia transforma inventário OOH em estratégia — com planejamento de mídia, análise de entorno e propostas geradas em segundos. Cobertura em Londrina, Maringá, Balneário Camboriú e Itajaí. Mais de 93 pontos ativos. 221 telas. 2,9 milhões de impactos mensais. Cada localização é analisada por fluxo, público e ambiente comercial ao redor. O mídia kit digital mostra onde sua marca precisa estar.';

const FADE_UP = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  }
};

const PANEL_DEFS = [
  {
    id: 'p0',
    label: 'Painel LED',
    name: 'Av. Higienópolis',
    meta: 'Londrina · ~42k fluxo/mês',
    accent: '#FE5C2B',
    w: 148,
    h: 108,
    x: 34,
    y: 42,
    vx: 0.34,
    vy: 0.29
  },
  {
    id: 'p1',
    label: 'Tela Indoor',
    name: 'Shopping Catuaí',
    meta: 'Londrina · 221 telas',
    accent: '#00c864',
    w: 132,
    h: 96,
    x: 226,
    y: 308,
    vx: -0.32,
    vy: 0.25
  },
  {
    id: 'p2',
    label: 'Totem Digital',
    name: 'Centro Cívico',
    meta: 'Maringá · 4 faces',
    accent: '#8250ff',
    w: 156,
    h: 116,
    x: 700,
    y: 58,
    vx: 0.27,
    vy: -0.31
  },
  {
    id: 'p3',
    label: 'Elevador',
    name: 'Ed. Corporate Park',
    meta: 'Balneário Camboriú',
    accent: '#00a0dc',
    w: 140,
    h: 100,
    x: 920,
    y: 300,
    vx: -0.26,
    vy: -0.24
  }
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgba(hex, alpha) {
  const normalized = String(hex || '#ffffff').replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((ch) => `${ch}${ch}`).join('')
    : normalized;
  const num = Number.parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createInitialCursor() {
  return {
    segmentIndex: 0,
    graphemeIndex: 0,
    fallbackWordIndex: 0
  };
}

function createPrepared(preparedApi) {
  if (typeof preparedApi !== 'function') return null;
  try {
    return preparedApi(CORPUS, FONT);
  } catch {
    return null;
  }
}

export default function PretextSection() {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const panelRefs = useRef({});
  const rafRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const metricsMsRef = useRef(null);
  const metricsLinesRef = useRef(null);
  const metricsDomRef = useRef(null);

  const preparedRef = useRef(null);
  const cursorRef = useRef(createInitialCursor());
  const wordsRef = useRef(CORPUS.split(/\s+/).filter(Boolean));

  const stageSizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const panelsRef = useRef(PANEL_DEFS.map((panel) => ({ ...panel, dragging: false })));
  const draggingRef = useRef({ id: null, offsetX: 0, offsetY: 0, lastX: 0, lastY: 0, moved: false });

  const runningRef = useRef(true);
  const pausedRef = useRef(false);

  const pretextLayoutNextLine = useMemo(() => {
    return typeof Pretext.layoutNextLine === 'function' ? Pretext.layoutNextLine : null;
  }, []);

  const pretextPrepareWithSegments = useMemo(() => {
    return typeof Pretext.prepareWithSegments === 'function' ? Pretext.prepareWithSegments : null;
  }, []);

  const syncPanelSizes = () => {
    const stage = stageRef.current;
    if (!stage) return;

    const maxW = stage.clientWidth;
    const maxH = stage.clientHeight;

    panelsRef.current.forEach((panel) => {
      const el = panelRefs.current[panel.id];
      if (el) {
        const measuredW = el.offsetWidth || panel.w;
        const measuredH = el.offsetHeight || panel.h;
        panel.w = measuredW;
        panel.h = measuredH;
      }
      panel.x = clamp(panel.x, 0, Math.max(0, maxW - panel.w));
      panel.y = clamp(panel.y, 0, Math.max(0, maxH - panel.h));
    });
  };

  const applyPanelStyles = () => {
    panelsRef.current.forEach((panel) => {
      const el = panelRefs.current[panel.id];
      if (!el) return;
      el.style.transform = `translate3d(${panel.x}px, ${panel.y}px, 0)`;
    });
  };

  const resizeCanvas = () => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    stageSizeRef.current = { width, height, dpr };

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.textBaseline = 'alphabetic';
    ctx.font = FONT;

    preparedRef.current = createPrepared(pretextPrepareWithSegments);
    syncPanelSizes();
    applyPanelStyles();
  };

  const getAvailableBounds = (lineY) => {
    const { width } = stageSizeRef.current;
    let left = PADDING;
    let right = width - PADDING;

    for (const panel of panelsRef.current) {
      const top = panel.y;
      const bottom = panel.y + panel.h;
      if (lineY < top || lineY > bottom) continue;

      const centerX = panel.x + panel.w / 2;
      if (centerX < width / 2) {
        left = Math.max(left, panel.x + panel.w + 12);
      } else {
        right = Math.min(right, panel.x - 12);
      }
    }

    return { left, right, width: right - left };
  };

  const getLineAlpha = (lineY, lineLeft, lineRight) => {
    let minDistance = Number.POSITIVE_INFINITY;

    for (const panel of panelsRef.current) {
      const verticalDistance = lineY < panel.y
        ? panel.y - lineY
        : lineY > panel.y + panel.h
          ? lineY - (panel.y + panel.h)
          : 0;

      const horizontalDistance = lineRight < panel.x
        ? panel.x - lineRight
        : lineLeft > panel.x + panel.w
          ? lineLeft - (panel.x + panel.w)
          : 0;

      const distance = Math.sqrt((verticalDistance ** 2) + (horizontalDistance ** 2));
      minDistance = Math.min(minDistance, distance);
    }

    if (!Number.isFinite(minDistance)) return 1;
    if (minDistance <= 30) return 0.3;
    if (minDistance >= 120) return 1;

    const t = (minDistance - 30) / 90;
    return 0.3 + (0.7 * t);
  };

  const layoutNextFallbackLine = (ctx, maxWidth) => {
    const words = wordsRef.current;
    if (!words.length) return null;

    let index = Number(cursorRef.current.fallbackWordIndex) || 0;
    if (index >= words.length) index = 0;

    let lineText = '';
    let consumed = 0;

    while (consumed < words.length) {
      const word = words[(index + consumed) % words.length];
      const candidate = lineText ? `${lineText} ${word}` : word;
      const measured = ctx.measureText(candidate).width;

      if (measured > maxWidth) {
        if (!lineText) {
          lineText = word;
          consumed += 1;
        }
        break;
      }

      lineText = candidate;
      consumed += 1;
    }

    if (!lineText) return null;

    cursorRef.current.fallbackWordIndex = (index + consumed) % words.length;
    return { text: lineText };
  };

  const layoutLine = (ctx, maxWidth) => {
    const canUsePretext = pretextLayoutNextLine && preparedRef.current;

    if (canUsePretext) {
      let line = null;
      try {
        line = pretextLayoutNextLine(preparedRef.current, cursorRef.current, maxWidth);
      } catch {
        line = null;
      }

      if (!line) {
        cursorRef.current.segmentIndex = 0;
        cursorRef.current.graphemeIndex = 0;
        try {
          line = pretextLayoutNextLine(preparedRef.current, cursorRef.current, maxWidth);
        } catch {
          line = null;
        }
      }

      if (line && typeof line.text === 'string') {
        cursorRef.current.segmentIndex = Number(line.end?.segmentIndex || 0);
        cursorRef.current.graphemeIndex = Number(line.end?.graphemeIndex || 0);
        return line;
      }
    }

    return layoutNextFallbackLine(ctx, maxWidth);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const start = performance.now();
    const { width, height } = stageSizeRef.current;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = BRAND_BLACK;
    ctx.fillRect(0, 0, width, height);
    ctx.font = FONT;

    let linesRendered = 0;
    const startY = PADDING + 14;
    const endY = height - PADDING;

    for (let y = startY; y < endY; y += LINE_HEIGHT) {
      const bounds = getAvailableBounds(y - 12);
      if (bounds.width < MIN_LINE_WIDTH) continue;

      const line = layoutLine(ctx, bounds.width);
      if (!line || !line.text) continue;

      const lineColor = linesRendered % 2 === 0 ? BRAND_GRAY_300 : BRAND_GRAY_700;
      const alpha = getLineAlpha(y - 8, bounds.left, bounds.right);
      ctx.fillStyle = hexToRgba(lineColor, alpha);
      ctx.fillText(line.text, bounds.left, y);
      linesRendered += 1;
    }

    const elapsed = performance.now() - start;

    if (metricsMsRef.current) {
      metricsMsRef.current.textContent = `${elapsed.toFixed(2)}ms`;
    }
    if (metricsLinesRef.current) {
      metricsLinesRef.current.textContent = String(linesRendered);
    }
    if (metricsDomRef.current) {
      metricsDomRef.current.textContent = '0';
    }
  };

  const updatePhysics = () => {
    const { width, height } = stageSizeRef.current;

    for (const panel of panelsRef.current) {
      if (panel.dragging) continue;

      panel.x += panel.vx;
      panel.y += panel.vy;

      if (panel.x <= 0) {
        panel.x = 0;
        panel.vx = Math.abs(panel.vx);
      } else if (panel.x + panel.w >= width) {
        panel.x = Math.max(0, width - panel.w);
        panel.vx = -Math.abs(panel.vx);
      }

      if (panel.y <= 0) {
        panel.y = 0;
        panel.vy = Math.abs(panel.vy);
      } else if (panel.y + panel.h >= height) {
        panel.y = Math.max(0, height - panel.h);
        panel.vy = -Math.abs(panel.vy);
      }
    }
  };

  const loop = () => {
    if (!runningRef.current) return;

    if (!pausedRef.current) {
      updatePhysics();
      applyPanelStyles();
    }

    draw();
    rafRef.current = requestAnimationFrame(loop);
  };

  const extractClientPoint = (event) => {
    if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    return { x: event.clientX, y: event.clientY };
  };

  const beginDrag = (event, panelId) => {
    const stage = stageRef.current;
    const panel = panelsRef.current.find((item) => item.id === panelId);
    if (!stage || !panel) return;

    event.preventDefault();
    event.stopPropagation();

    const point = extractClientPoint(event);
    const stageRect = stage.getBoundingClientRect();
    const pointerX = point.x - stageRect.left;
    const pointerY = point.y - stageRect.top;

    draggingRef.current = {
      id: panelId,
      offsetX: pointerX - panel.x,
      offsetY: pointerY - panel.y,
      lastX: pointerX,
      lastY: pointerY,
      moved: false
    };

    panel.dragging = true;
    const el = panelRefs.current[panelId];
    if (el) el.style.cursor = 'grabbing';
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
      } catch {
        // Continue even if fonts API is not available.
      }

      if (!mounted) return;

      resizeCanvas();
      draw();

      runningRef.current = true;
      rafRef.current = requestAnimationFrame(loop);
    };

    init();

    const stage = stageRef.current;
    if (stage && typeof ResizeObserver !== 'undefined') {
      resizeObserverRef.current = new ResizeObserver(() => {
        resizeCanvas();
        draw();
      });
      resizeObserverRef.current.observe(stage);
    }

    const onMove = (event) => {
      const stageNode = stageRef.current;
      const dragging = draggingRef.current;
      if (!stageNode || !dragging.id) return;

      event.preventDefault();
      const point = extractClientPoint(event);
      const rect = stageNode.getBoundingClientRect();
      const pointerX = point.x - rect.left;
      const pointerY = point.y - rect.top;

      const panel = panelsRef.current.find((item) => item.id === dragging.id);
      if (!panel) return;

      const nextX = clamp(pointerX - dragging.offsetX, 0, Math.max(0, stageNode.clientWidth - panel.w));
      const nextY = clamp(pointerY - dragging.offsetY, 0, Math.max(0, stageNode.clientHeight - panel.h));

      const deltaX = pointerX - dragging.lastX;
      const deltaY = pointerY - dragging.lastY;
      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
        dragging.moved = true;
      }

      panel.vx = clamp(deltaX * 0.16, -1.2, 1.2);
      panel.vy = clamp(deltaY * 0.16, -1.2, 1.2);
      panel.x = nextX;
      panel.y = nextY;

      dragging.lastX = pointerX;
      dragging.lastY = pointerY;
      applyPanelStyles();
      draw();
    };

    const onEnd = () => {
      const dragging = draggingRef.current;
      if (!dragging.id) return;

      const panel = panelsRef.current.find((item) => item.id === dragging.id);
      if (panel) {
        panel.dragging = false;
      }

      const el = panelRefs.current[dragging.id];
      if (el) el.style.cursor = 'grab';

      draggingRef.current = {
        id: null,
        offsetX: 0,
        offsetY: 0,
        lastX: 0,
        lastY: 0,
        moved: false
      };
    };

    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);

    return () => {
      mounted = false;
      runningRef.current = false;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      if (resizeObserverRef.current && stageRef.current) {
        resizeObserverRef.current.unobserve(stageRef.current);
        resizeObserverRef.current.disconnect();
      }

      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [pretextLayoutNextLine, pretextPrepareWithSegments]);

  const handleStageClick = () => {
    if (draggingRef.current.moved) {
      draggingRef.current.moved = false;
      return;
    }

    pausedRef.current = !pausedRef.current;
    if (pausedRef.current) {
      draw();
    }
  };

  return (
    <section className="bg-black border-t border-white/5 py-24">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={FADE_UP}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-10"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0e0e0e] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D4D4D4]">
            <span className="h-2 w-2 rounded-full bg-[#FE5C2B] animate-pulse" />
            Tecnologia de Layout
          </div>
          <h2 className="mt-5 text-4xl md:text-5xl font-extrabold text-white" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
            Cada ponto no lugar certo.
          </h2>
          <p className="mt-3 text-base md:text-lg text-[#D4D4D4]" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>
            Texto que se adapta ao espaço — como a mídia que planejamos.
          </p>
        </motion.div>

        <motion.div
          variants={FADE_UP}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          ref={stageRef}
          onClick={handleStageClick}
          className="relative h-[480px] overflow-hidden rounded-2xl border border-white/5 bg-[#050505]"
        >
          <canvas ref={canvasRef} className="absolute inset-0 z-0 h-full w-full" />

          <div className="pointer-events-none absolute right-4 top-3 z-20 text-right text-[9px] leading-4 text-neutral-500" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>
            <div>
              reflow <span ref={metricsMsRef} className="text-[#FE5C2B]">0.00ms</span>
            </div>
            <div>
              linhas <span ref={metricsLinesRef} className="text-[#FE5C2B]">0</span>
            </div>
            <div>
              dom reads <span ref={metricsDomRef} className="text-[#4ade80]">0</span>
            </div>
          </div>

          {PANEL_DEFS.map((panel) => (
            <div
              key={panel.id}
              ref={(node) => {
                if (!node) {
                  delete panelRefs.current[panel.id];
                  return;
                }
                panelRefs.current[panel.id] = node;
              }}
              onMouseDown={(event) => beginDrag(event, panel.id)}
              onTouchStart={(event) => beginDrag(event, panel.id)}
              className="absolute z-10 rounded-2xl border border-white/5 bg-brand-gray-900 px-3 py-2 select-none"
              style={{
                width: `${panel.w}px`,
                height: `${panel.h}px`,
                cursor: 'grab',
                touchAction: 'none',
                background: `linear-gradient(145deg, rgba(10,10,10,0.95), ${hexToRgba(panel.accent, 0.12)})`,
                borderColor: hexToRgba(panel.accent, 0.3)
              }}
            >
              <span
                className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full animate-pulse"
                style={{ backgroundColor: panel.accent }}
              />
              <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#D4D4D4]" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>
                {panel.label}
              </div>
              <div className="mt-2 text-[13px] font-bold text-white leading-tight" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
                {panel.name}
              </div>
              <div className="mt-1 text-[9px] text-neutral-400" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>
                {panel.meta}
              </div>
            </div>
          ))}
        </motion.div>

        <motion.div
          variants={FADE_UP}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-5 flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.16em] text-neutral-500"
          style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#FE5C2B]" />
          powered by precision text engine — pretext
        </motion.div>
      </div>
    </section>
  );
}
