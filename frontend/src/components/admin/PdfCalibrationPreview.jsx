import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Focus, Loader2, MonitorUp } from 'lucide-react';
import { buildPdfCalibrationPreview, PDF_PAGE_SIZE } from '../../lib/midiaKitPdf';

function clearNode(node) {
  if (!node) return;
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function getUnionBounds(elements, pageRect) {
  if (!elements.length) return null;

  const rects = elements.map((element) => element.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left)) - pageRect.left;
  const top = Math.min(...rects.map((rect) => rect.top)) - pageRect.top;
  const right = Math.max(...rects.map((rect) => rect.right)) - pageRect.left;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) - pageRect.top;

  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  };
}

function mountFocusedClone({ sourcePage, host, viewport, bounds }) {
  clearNode(host);
  if (!sourcePage || !host || !viewport || !bounds) return;

  const clone = sourcePage.cloneNode(true);
  Object.assign(clone.style, {
    margin: '0',
    transformOrigin: 'top left',
    pointerEvents: 'none'
  });

  host.appendChild(clone);

  const padding = 44;
  const availableWidth = Math.max(viewport.clientWidth - padding * 2, 1);
  const availableHeight = Math.max(viewport.clientHeight - padding * 2, 1);
  const scale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
    2.2
  );

  const translateX = (viewport.clientWidth - bounds.width * scale) / 2 - bounds.left * scale;
  const translateY = (viewport.clientHeight - bounds.height * scale) / 2 - bounds.top * scale;
  clone.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

export default function PdfCalibrationPreview({
  config,
  previewKey,
  focusKey,
  focusLabel,
  isolateFocus
}) {
  const deferredConfig = useDeferredValue(config);
  const pageViewportRef = useRef(null);
  const pageHostRef = useRef(null);
  const focusViewportRef = useRef(null);
  const focusHostRef = useRef(null);
  const [pageScale, setPageScale] = useState(0.34);
  const [viewportVersion, setViewportVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusedCount, setFocusedCount] = useState(0);

  useEffect(() => {
    if (!pageViewportRef.current) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width || 1;
      setPageScale(width / PDF_PAGE_SIZE.width);
      setViewportVersion((current) => current + 1);
    });

    observer.observe(pageViewportRef.current);
    if (focusViewportRef.current) {
      observer.observe(focusViewportRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const renderPreview = async () => {
      const pageHost = pageHostRef.current;
      const focusHost = focusHostRef.current;
      const focusViewport = focusViewportRef.current;
      if (!pageHost) return;

      setLoading(true);
      setError('');
      clearNode(pageHost);
      clearNode(focusHost);

      try {
        const page = await buildPdfCalibrationPreview({
          previewKey,
          layoutConfig: deferredConfig,
          focusKey,
          isolateFocus
        });
        if (cancelled) return;

        pageHost.appendChild(page);

        requestAnimationFrame(() => {
          if (cancelled) return;
          const focusedElements = focusKey
            ? Array.from(page.querySelectorAll(`[data-calibration-id="${focusKey}"]`))
            : [];

          setFocusedCount(focusedElements.length);

          if (!focusedElements.length || !focusHost || !focusViewport) {
            clearNode(focusHost);
            setLoading(false);
            return;
          }

          const bounds = getUnionBounds(focusedElements, page.getBoundingClientRect());
          mountFocusedClone({
            sourcePage: page,
            host: focusHost,
            viewport: focusViewport,
            bounds
          });
          setLoading(false);
        });
      } catch (previewError) {
        if (cancelled) return;
        setError(previewError instanceof Error ? previewError.message : 'Falha ao montar preview do PDF.');
        setLoading(false);
      }
    };

    renderPreview();
    return () => {
      cancelled = true;
    };
  }, [deferredConfig, previewKey, focusKey, isolateFocus, viewportVersion]);

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white">Preview em tempo real</h4>
          <p className="mt-1 text-xs text-brand-gray-500">
            O layout abaixo reage aos sliders sem precisar gerar o PDF.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-orange/25 bg-brand-orange/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-orange">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <MonitorUp size={13} />}
          {loading ? 'Atualizando preview' : 'Preview ativo'}
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}

      <div className="rounded-2xl border border-white/10 bg-[#060606] p-3">
        <div ref={pageViewportRef} className="relative w-full overflow-hidden rounded-xl bg-[#111]" style={{ minHeight: `${Math.round(PDF_PAGE_SIZE.height * pageScale)}px` }}>
          <div
            ref={pageHostRef}
            style={{
              width: `${PDF_PAGE_SIZE.width}px`,
              height: `${PDF_PAGE_SIZE.height}px`,
              transform: `scale(${pageScale})`,
              transformOrigin: 'top left'
            }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#080808] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h5 className="text-sm font-semibold text-white">Box isolado</h5>
            <p className="mt-1 text-xs text-brand-gray-500">
              {focusLabel ? `${focusLabel}${isolateFocus ? ' com o restante atenuado.' : ' ampliado para ajuste fino.'}` : 'Selecione um box para ampliar.'}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-brand-gray-400">
            <Focus size={13} />
            {focusedCount > 0 ? `${focusedCount} elemento(s)` : 'Sem foco'}
          </div>
        </div>

        <div ref={focusViewportRef} className="relative mt-3 h-[320px] overflow-hidden rounded-xl border border-white/10 bg-[#050505]">
          <div ref={focusHostRef} className="absolute inset-0" />
          {!focusLabel ? (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-brand-gray-500">
              Escolha um box no seletor acima para ver o recorte ampliado.
            </div>
          ) : null}
          {focusLabel && !loading && focusedCount === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-brand-gray-500">
              Esse preview não encontrou o box selecionado.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}