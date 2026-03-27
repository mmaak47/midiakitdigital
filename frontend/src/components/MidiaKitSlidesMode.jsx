import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Maximize2, Minimize2, Play, X } from 'lucide-react';
import CustomSelect from './CustomSelect';
import { getPrimaryPointMediaKitImage } from '../lib/pointImages';
import { campaignTotals } from '../lib/strategy';

const fmtInt = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(Number(v) || 0));
const fmtMoney = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

// ─── Lobby: seleção de pontos ────────────────
function Lobby({
  filteredPoints,
  selectedPointIds,
  togglePoint,
  onStart,
  cidades,
  tipos,
  selectedPracas,
  setSelectedPracas,
  selectedTipos,
  setSelectedTipos,
}) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of filteredPoints) {
      const key = p.tipo || 'Sem tipo';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return Array.from(map.entries()).map(([tipo, points]) => ({ tipo, points }));
  }, [filteredPoints]);

  const allIds = useMemo(() => new Set(filteredPoints.map((p) => p.id || p._id)), [filteredPoints]);
  const allSelected = allIds.size > 0 && [...allIds].every((id) => selectedPointIds.has(id));

  const toggleAll = () => {
    if (allSelected) {
      filteredPoints.forEach((p) => { if (selectedPointIds.has(p.id || p._id)) togglePoint(p.id || p._id); });
    } else {
      filteredPoints.forEach((p) => { if (!selectedPointIds.has(p.id || p._id)) togglePoint(p.id || p._id); });
    }
  };

  const toggleGroup = (groupPoints) => {
    const groupIds = groupPoints.map((p) => p.id || p._id);
    const allGroupSelected = groupIds.every((id) => selectedPointIds.has(id));
    groupIds.forEach((id) => {
      if (allGroupSelected ? selectedPointIds.has(id) : !selectedPointIds.has(id)) togglePoint(id);
    });
  };

  return (
    <div className="h-full flex flex-col px-6 py-5 md:px-10 md:py-7">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <img src="/logo.png" alt="Intermidia" className="h-8 mb-2" />
          <h1 className="text-2xl font-extrabold">Preparar Apresentação</h1>
          <p className="mt-1 text-sm text-brand-gray-400">
            Escolha as praças e formatos, selecione os pontos e inicie.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-black text-brand-orange">{selectedPointIds.size}</div>
          <div className="text-xs uppercase tracking-wide text-brand-gray-400">
            ponto{selectedPointIds.size !== 1 ? 's' : ''} selecionado{selectedPointIds.size !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <CustomSelect
          label="Praças"
          value={selectedPracas}
          onChange={setSelectedPracas}
          options={cidades}
          placeholder="Todas as praças"
          multiple
        />
        <CustomSelect
          label="Formatos"
          value={selectedTipos}
          onChange={setSelectedTipos}
          options={tipos}
          placeholder="Todos os formatos"
          multiple
        />
      </div>

      {/* Controle global */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={toggleAll}
          className={`text-sm font-medium transition-colors ${
            allSelected ? 'text-brand-gray-400 hover:text-white' : 'text-brand-orange hover:underline'
          }`}
        >
          {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
        </button>
        <span className="text-white/15">|</span>
        <span className="text-sm text-brand-gray-400">{filteredPoints.length} pontos disponíveis</span>
      </div>

      {/* Lista agrupada por formato */}
      <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
        {filteredPoints.length === 0 ? (
          <p className="text-center py-16 text-brand-gray-500">
            Nenhum ponto para os filtros selecionados.
          </p>
        ) : (
          groups.map(({ tipo, points }) => {
            const groupIds = points.map((p) => p.id || p._id);
            const allGroupSelected = groupIds.every((id) => selectedPointIds.has(id));
            return (
              <div key={tipo}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{tipo}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-brand-gray-300">
                      {points.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleGroup(points)}
                    className="text-[11px] text-brand-gray-400 hover:text-white transition-colors"
                  >
                    {allGroupSelected ? 'Desmarcar grupo' : 'Selecionar grupo'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {points.map((point) => {
                    const id = point.id || point._id;
                    const selected = selectedPointIds.has(id);
                    const img = getPrimaryPointMediaKitImage(point);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => togglePoint(id)}
                        className={`relative h-[88px] flex text-left rounded-xl border overflow-hidden transition-all ${
                          selected
                            ? 'border-brand-orange bg-brand-orange/[0.06] ring-1 ring-brand-orange/30'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="w-24 h-full shrink-0 bg-black/50">
                          {img ? (
                            <img src={img} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-white/5" />
                          )}
                        </div>
                        <div className="flex-1 px-3 py-2.5 min-w-0 overflow-hidden">
                          <div className="text-sm font-semibold line-clamp-1 leading-tight pr-5">
                            {point.nome}
                          </div>
                          <div className="mt-0.5 text-[11px] text-brand-gray-400 line-clamp-1">
                            {point.cidade}
                          </div>
                          <div className="mt-1.5 text-[11px] text-brand-gray-300 line-clamp-1">
                            Fluxo: {fmtInt(Number(point.fluxo) || 0)} &bull;{' '}
                            {fmtMoney(Number(point.preco) || 0)}/mês
                          </div>
                        </div>
                        <div
                          className={`absolute top-2 right-2 w-[18px] h-[18px] rounded-full flex items-center justify-center transition-all shrink-0 ${
                            selected ? 'bg-brand-orange' : 'bg-black/40 border border-white/30'
                          }`}
                        >
                          {selected && <Check size={9} strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Botão iniciar */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onStart}
          disabled={selectedPointIds.size === 0}
          className="inline-flex items-center gap-2 rounded-2xl bg-brand-orange px-8 py-3 text-sm font-bold text-white shadow-lg hover:bg-brand-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Play size={16} fill="currentColor" />
          Iniciar Apresentação
        </button>
      </div>
    </div>
  );
}

// ─── Slide de transição entre formatos ───
function DividerSlide({ tipo, count, totaisTipo }) {
  return (
    <motion.div
      key={`divider-${tipo}`}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="h-full flex flex-col items-center justify-center text-center relative"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(254,92,43,0.2),transparent_62%)]" />
      <div className="relative z-10 flex flex-col items-center">
        <img src="/logo.png" alt="Intermidia" className="h-8 mb-4 opacity-60" />
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-orange">Formato</div>
        <h2 className="mt-3 text-5xl md:text-7xl font-black tracking-tight leading-none">{tipo}</h2>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-brand-orange/35 bg-brand-orange/15 px-6 py-2.5 text-xl font-bold text-brand-orange">
          {fmtInt(count)} {count === 1 ? 'ponto' : 'pontos'} selecionados
        </div>
        {totaisTipo && (
          <div className="mt-5 grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-2xl font-bold">{fmtInt(totaisTipo.telas)}</div>
              <div className="text-[11px] uppercase tracking-wide text-brand-gray-400 mt-1">Telas</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmtInt(totaisTipo.fluxo)}</div>
              <div className="text-[11px] uppercase tracking-wide text-brand-gray-400 mt-1">Fluxo / mês</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmtMoney(totaisTipo.valor)}</div>
              <div className="text-[11px] uppercase tracking-wide text-brand-gray-400 mt-1">Investimento</div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Slide por ponto ───
function PointSlide({ slide, totals, selectionLabel, typesLabel }) {
  const { point, infoOnLeft } = slide;
  const img = getPrimaryPointMediaKitImage(point);
  return (
    <motion.div
      key={slide.key}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="h-full relative"
    >
      <div
        className={`absolute top-3 z-20 rounded-xl border border-brand-orange/30 bg-black/70 px-3 py-2 backdrop-blur-sm ${
          infoOnLeft ? 'right-3' : 'left-3'
        }`}
      >
        <div className="text-[10px] uppercase tracking-wide text-brand-orange mb-1">Totais da seleção</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-brand-gray-200">
          <span>Pontos: <strong className="text-white">{fmtInt(totals.quantidade)}</strong></span>
          <span>Telas: <strong className="text-white">{fmtInt(totals.telasTotal)}</strong></span>
          <span>Fluxo: <strong className="text-white">{fmtInt(totals.fluxoTotal)}</strong></span>
          <span>Invest.: <strong className="text-white">{fmtMoney(totals.valorTotal)}</strong></span>
        </div>
      </div>

      <div className="absolute inset-0 rounded-2xl overflow-hidden border border-white/10 bg-black/40">
        {img ? (
          <img src={img} alt={point.nome} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-black/70" />
        )}
        <div
          className={`absolute inset-0 ${
            infoOnLeft
              ? 'bg-[linear-gradient(90deg,rgba(0,0,0,0.93)_0%,rgba(0,0,0,0.65)_35%,rgba(0,0,0,0.18)_72%,rgba(0,0,0,0.04)_100%)]'
              : 'bg-[linear-gradient(270deg,rgba(0,0,0,0.93)_0%,rgba(0,0,0,0.65)_35%,rgba(0,0,0,0.18)_72%,rgba(0,0,0,0.04)_100%)]'
          }`}
        />
      </div>

      <div
        className={`absolute inset-y-0 z-10 w-[320px] max-w-[44%] p-3 md:p-4 ${
          infoOnLeft ? 'left-0' : 'right-0'
        }`}
      >
        <div className="h-full rounded-2xl border border-white/15 bg-black/65 backdrop-blur-md p-4 flex flex-col">
          <img src="/logo.png" alt="Intermidia" className="h-6 self-start mb-3 opacity-65" />
          <div className="text-[10px] uppercase tracking-wide text-brand-orange">
            Informações do ponto
          </div>
          <h3 className="mt-1.5 text-xl font-extrabold leading-tight">{point.nome}</h3>
          <p className="mt-0.5 text-sm text-brand-gray-300">
            {point.tipo || 'Sem tipo'} &bull; {point.cidade || 'Sem cidade'}
          </p>
          <div className="mt-3 space-y-1.5 text-sm text-brand-gray-200">
            {point.endereco ? (
              <div>
                <span className="text-brand-gray-500">Endereço: </span>
                {point.endereco}
              </div>
            ) : null}
            <div>
              <span className="text-brand-gray-500">Público: </span>
              {point.publico || 'N/I'}
            </div>
            <div>
              <span className="text-brand-gray-500">Fluxo: </span>
              {fmtInt(Number(point.fluxo) || 0)} / mês
            </div>
            <div>
              <span className="text-brand-gray-500">Telas: </span>
              {fmtInt(Number(point.telas) || 0)}
            </div>
            <div>
              <span className="text-brand-gray-500">Inserções: </span>
              {fmtInt(Number(point.insercoes) || 0)} / mês
            </div>
            <div>
              <span className="text-brand-gray-500">Investimento: </span>
              <strong className="text-white">{fmtMoney(Number(point.preco) || 0)}</strong> / mês
            </div>
          </div>
          <div className="mt-auto pt-3 border-t border-white/10 text-[11px] text-brand-gray-400 space-y-0.5">
            <div>
              <span className="text-brand-gray-500">Praça(s): </span>
              {selectionLabel}
            </div>
            <div>
              <span className="text-brand-gray-500">Formato(s): </span>
              {typesLabel}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Componente principal ───
export default function MidiaKitSlidesMode({
  open = false,
  onClose,
  allPontos = [],
  selectedPracas = [],
  setSelectedPracas,
  selectedTipos = [],
  setSelectedTipos,
}) {
  const [phase, setPhase] = useState('lobby');
  const [selectedPointIds, setSelectedPointIds] = useState(new Set());
  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  const cidades = useMemo(
    () =>
      Array.from(new Set(allPontos.map((p) => p.cidade).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [allPontos],
  );

  const tipos = useMemo(
    () =>
      Array.from(new Set(allPontos.map((p) => p.tipo).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [allPontos],
  );

  const filteredPoints = useMemo(() => {
    let result = Array.isArray(allPontos) ? allPontos : [];
    if (selectedPracas.length) result = result.filter((p) => selectedPracas.includes(p.cidade));
    if (selectedTipos.length) result = result.filter((p) => selectedTipos.includes(p.tipo));
    return result;
  }, [allPontos, selectedPracas, selectedTipos]);

  useEffect(() => {
    if (open) {
      setPhase('lobby');
      setIndex(0);
      setSelectedPointIds(new Set(filteredPoints.map((p) => p.id || p._id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const validIds = new Set(filteredPoints.map((p) => p.id || p._id));
    setSelectedPointIds((prev) => {
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredPoints]);

  const togglePoint = useCallback((id) => {
    setSelectedPointIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedPoints = useMemo(
    () => filteredPoints.filter((p) => selectedPointIds.has(p.id || p._id)),
    [filteredPoints, selectedPointIds],
  );

  const totals = useMemo(() => campaignTotals(selectedPoints), [selectedPoints]);

  const slides = useMemo(() => {
    const groups = new Map();
    for (const point of selectedPoints) {
      const key = point.tipo || 'Sem tipo';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(point);
    }
    const result = [];
    let pointIndex = 0;
    for (const [tipo, pts] of groups) {
      const totaisTipo = pts.reduce(
        (acc, p) => ({
          telas: acc.telas + (Number(p.telas) || 0),
          fluxo: acc.fluxo + (Number(p.fluxo) || 0),
          valor: acc.valor + (Number(p.preco) || 0),
        }),
        { telas: 0, fluxo: 0, valor: 0 },
      );
      result.push({ type: 'divider', key: `divider-${tipo}`, tipo, count: pts.length, totaisTipo });
      for (const point of pts) {
        result.push({
          type: 'point',
          key: `point-${point.id || point._id || pointIndex}`,
          point,
          infoOnLeft: pointIndex % 2 === 0,
        });
        pointIndex++;
      }
    }
    return result;
  }, [selectedPoints]);

  useEffect(() => {
    if (phase !== 'presenting') return;
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
        setIndex((i) => Math.min(slides.length - 1, i + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, slides.length]);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  if (!open) return null;

  const active = slides[index] || null;

  const selectionLabel = selectedPracas.length
    ? selectedPracas.length === 1
      ? selectedPracas[0]
      : `${selectedPracas.length} praças`
    : 'Todas as praças';

  const typesLabel = selectedTipos.length
    ? selectedTipos.length === 1
      ? selectedTipos[0]
      : `${selectedTipos.length} formatos`
    : 'Todos os formatos';

  return (
    <div ref={containerRef} className="fixed inset-0 z-[95] bg-black text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(254,92,43,0.22),transparent_34%)]" />
      <div className="relative z-[1] h-full flex flex-col">
        {phase === 'lobby' ? (
          <>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 rounded-xl border border-white/20 bg-black/40 p-2 text-white/70 hover:text-white"
            >
              <X size={18} />
            </button>
            <Lobby
              filteredPoints={filteredPoints}
              selectedPointIds={selectedPointIds}
              togglePoint={togglePoint}
              onStart={() => { setIndex(0); setPhase('presenting'); }}
              cidades={cidades}
              tipos={tipos}
              selectedPracas={selectedPracas}
              setSelectedPracas={setSelectedPracas}
              selectedTipos={selectedTipos}
              setSelectedTipos={setSelectedTipos}
            />
          </>
        ) : (
          <div className="h-full flex flex-col px-4 py-3 md:px-6 md:py-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <img src="/logo.png" alt="Intermidia" className="h-7 opacity-70" />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPhase('lobby')}
                  className="rounded-xl border border-white/20 bg-black/35 px-3 py-1.5 text-xs text-white/70 hover:text-white"
                >
                  ← Seleção
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="rounded-xl border border-white/20 bg-black/35 p-2 text-white/70 hover:text-white"
                  title={isFullscreen ? 'Sair do fullscreen' : 'Tela cheia'}
                >
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-xl border border-white/20 bg-black/35 p-2 text-white/75 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-3 md:p-4 overflow-hidden relative">
              {!active ? (
                <div className="h-full flex items-center justify-center text-brand-gray-400">
                  Nenhum ponto selecionado.
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {active.type === 'divider' ? (
                    <DividerSlide
                      key={active.key}
                      tipo={active.tipo}
                      count={active.count}
                      totaisTipo={active.totaisTipo}
                    />
                  ) : (
                    <PointSlide
                      key={active.key}
                      slide={active}
                      totals={totals}
                      selectionLabel={selectionLabel}
                      typesLabel={typesLabel}
                    />
                  )}
                </AnimatePresence>
              )}
            </div>
            <div className="mt-3 flex items-center justify-center gap-3 rounded-full border border-white/20 bg-black/40 px-4 py-2 self-center">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="rounded-full p-1 text-white/70 hover:text-white disabled:opacity-30"
                aria-label="Slide anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs uppercase tracking-[0.14em] text-white/70 min-w-[60px] text-center">
                {slides.length ? `${index + 1} / ${slides.length}` : '—'}
              </span>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
                disabled={index >= slides.length - 1}
                className="rounded-full p-1 text-white/70 hover:text-white disabled:opacity-30"
                aria-label="Próximo slide"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
