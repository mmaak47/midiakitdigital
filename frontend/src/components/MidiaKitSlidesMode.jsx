import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, X } from 'lucide-react';
import { FixedSizeList } from 'react-window';
import CustomSelect from './CustomSelect';
import SmartMap from './SmartMap';
import { getPointDisplayImages, getPrimaryPointMediaKitImage } from '../lib/pointImages';
import { campaignTotals } from '../lib/strategy';

const fmtInt = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(Number(v) || 0));
const fmtMoney = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

function getFocusCoords(point) {
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function formatTipoLabel(tipo, count = 1) {
  const normalized = String(tipo || '').trim();
  if (!normalized) return 'Formato não informado';

  const labels = {
    Elevador: { one: 'Elevador', many: 'Elevadores' },
    'Tela Indoor': { one: 'Tela Indoor', many: 'Telas Indoor' },
    'Painel LED': { one: 'Painel de Led', many: 'Painéis de Led' },
    Backlight: { one: 'Backlight', many: 'Backlights' },
    Frontlight: { one: 'Frontlight', many: 'Frontlights' },
    'Totem Digital': { one: 'Totem Digital', many: 'Totens Digitais' },
    'Circuito Muffato': { one: 'Circuito Muffato', many: 'Circuitos Muffato' },
    'LED Posto': { one: 'LED Posto', many: 'LEDs de Posto' },
    'Video Wall': { one: 'Video Wall', many: 'Video Walls' },
  };

  const entry = labels[normalized];
  if (!entry) return count > 1 ? `${normalized}s` : normalized;
  return count > 1 ? entry.many : entry.one;
}

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
  isDark = true,
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

  const renderPointOption = useCallback((point) => {
    const id = point.id || point._id;
    const selected = selectedPointIds.has(id);
    const img = getPrimaryPointMediaKitImage(point);

    return (
      <button
        key={id}
        type="button"
        onClick={() => togglePoint(id)}
        className={`relative h-[88px] flex text-left rounded-xl border overflow-hidden transition-all w-full ${
          selected
            ? 'border-brand-orange bg-brand-orange/[0.06] ring-1 ring-brand-orange/30'
            : isDark
              ? 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
              : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
        }`}
      >
        <div className={`w-24 h-full shrink-0 ${isDark ? 'bg-black/50' : 'bg-neutral-100'}`}>
          {img ? (
            <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" width="160" height="120" />
          ) : (
            <div className={`h-full w-full ${isDark ? 'bg-white/5' : 'bg-neutral-100'}`} />
          )}
        </div>
        <div className="flex-1 px-3 py-2.5 min-w-0 overflow-hidden">
          <div className={`text-sm font-semibold line-clamp-1 leading-tight pr-5 ${isDark ? '' : 'text-neutral-900'}`}>
            {point.nome}
          </div>
          <div className={`mt-0.5 text-[11px] line-clamp-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            {point.cidade}
          </div>
          <div className={`mt-1.5 text-[11px] line-clamp-1 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
            Fluxo: {fmtInt(Number(point.fluxo) || 0)} &bull;{' '}
            {fmtMoney(Number(point.preco) || 0)}/mês
          </div>
        </div>
        <div
          className={`absolute top-2 right-2 w-[18px] h-[18px] rounded-full flex items-center justify-center transition-all shrink-0 ${
            selected ? 'bg-brand-orange' : isDark ? 'bg-black/40 border border-white/30' : 'bg-white border border-neutral-300'
          }`}
        >
          {selected && <Check size={9} strokeWidth={3} />}
        </div>
      </button>
    );
  }, [selectedPointIds, togglePoint]);

  return (
    <div className="h-full flex flex-col px-4 py-4 md:px-10 md:py-7">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <img src={isDark ? '/logo.png' : '/logo-light.png'} alt="Intermidia" className="h-7 mb-1.5" />
          <h1 className={`text-xl md:text-2xl font-extrabold leading-tight ${isDark ? '' : 'text-neutral-900'}`}>Preparar Apresentação</h1>
          <p className={`mt-0.5 text-sm hidden sm:block ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            Escolha as praças e formatos, selecione os pontos e inicie.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-black text-brand-orange">{selectedPointIds.size}</div>
          <div className={`text-[11px] uppercase tracking-wide ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            ponto{selectedPointIds.size !== 1 ? 's' : ''}<br className="sm:hidden" /> selecionado{selectedPointIds.size !== 1 ? 's' : ''}
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
            allSelected ? (isDark ? 'text-brand-gray-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-900') : 'text-brand-orange hover:underline'
          }`}
        >
          {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
        </button>
        <span className={isDark ? 'text-white/15' : 'text-neutral-300'}>|</span>
        <span className={`text-sm ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{filteredPoints.length} pontos disponíveis</span>
      </div>

      {/* Lista agrupada por formato */}
      <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-5 pr-1 pb-20 md:pb-2">
        {filteredPoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-brand-gray-500">
            <i className="ri-map-pin-off-line text-4xl opacity-40" />
            <p className="text-sm text-center">Nenhum ponto para os filtros selecionados.</p>
          </div>
        ) : (
          groups.map(({ tipo, points }) => {
            const groupIds = points.map((p) => p.id || p._id);
            const allGroupSelected = groupIds.every((id) => selectedPointIds.has(id));
            return (
              <div key={tipo}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{tipo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${isDark ? 'bg-white/10 text-brand-gray-300' : 'bg-neutral-100 text-neutral-600'}`}>
                      {points.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleGroup(points)}
                    className={`text-[11px] transition-colors py-1 px-2 ${isDark ? 'text-brand-gray-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
                  >
                    {allGroupSelected ? 'Desmarcar grupo' : 'Selecionar grupo'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {points.length > 30 ? (
                    <div className="col-span-full">
                      <FixedSizeList
                        height={Math.min(430, points.length * 94)}
                        itemCount={points.length}
                        itemSize={94}
                        width="100%"
                      >
                        {({ index, style }) => (
                          <div style={style} className="px-0.5">
                            {renderPointOption(points[index])}
                          </div>
                        )}
                      </FixedSizeList>
                    </div>
                  ) : (
                    points.map((point) => renderPointOption(point))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Botão iniciar — sticky na base em mobile, inline em desktop */}
      <div className={`fixed md:static bottom-0 left-0 right-0 z-20 md:z-auto px-4 pb-safe pt-3 md:p-0 md:mt-4 md:flex md:justify-end backdrop-blur-sm md:backdrop-blur-none border-t md:border-none ${isDark ? 'bg-black/85 border-white/10' : 'bg-white/90 border-neutral-200'}`}>
        <button
          type="button"
          onClick={onStart}
          disabled={selectedPointIds.size === 0}
          className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-orange px-8 py-3.5 md:py-3 text-sm font-bold text-white shadow-lg hover:bg-brand-orange/90 active:bg-brand-orange-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Play size={16} fill="currentColor" />
          Iniciar Apresentação
          {selectedPointIds.size > 0 && (
            <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
              {selectedPointIds.size}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Slide de transição entre formatos ───
function DividerSlide({ tipo, count, totaisTipo, points, isDark = true }) {
  const pointsWithCoords = useMemo(
    () => (Array.isArray(points) ? points : []).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))),
    [points],
  );

  return (
    <motion.div
      key={`divider-${tipo}`}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="h-full flex flex-col items-center justify-center text-center relative px-4"
    >
      <div className={`absolute inset-0 ${isDark ? 'bg-[radial-gradient(ellipse_at_center,rgba(254,92,43,0.2),transparent_62%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(254,92,43,0.08),transparent_62%)]'}`} />
      <div className="relative z-10 flex flex-col items-center">
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-orange">Formato</div>
        <h2 className={`slide-divider-heading mt-3 text-5xl md:text-7xl font-black tracking-tight leading-none ${isDark ? '' : 'text-neutral-900'}`}>{tipo}</h2>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-brand-orange/35 bg-brand-orange/15 px-6 py-2.5 text-xl font-bold text-brand-orange">
          {fmtInt(count)} {count === 1 ? 'ponto' : 'pontos'} selecionados
        </div>
        {totaisTipo && (
          <div className="slide-divider-stats mt-5 grid grid-cols-3 gap-8 text-center">
            <div>
              <div className={`text-2xl font-bold ${isDark ? '' : 'text-neutral-900'}`}>{fmtInt(totaisTipo.telas)}</div>
              <div className={`text-[11px] uppercase tracking-wide mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Pontos de Impacto</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${isDark ? '' : 'text-neutral-900'}`}>{fmtInt(totaisTipo.fluxo)}</div>
              <div className={`text-[11px] uppercase tracking-wide mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Fluxo / mês</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${isDark ? '' : 'text-neutral-900'}`}>{fmtMoney(totaisTipo.valor)}</div>
              <div className={`text-[11px] uppercase tracking-wide mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Investimento</div>
            </div>
          </div>
        )}

        <div className={`slide-divider-map mt-6 w-full max-w-4xl rounded-2xl border overflow-hidden ${isDark ? 'border-white/15 bg-black/40' : 'border-neutral-200 bg-neutral-50'}`}>
          {pointsWithCoords.length ? (
            <div className="h-[32vh] min-h-[220px]">
              <SmartMap pontos={pointsWithCoords} isDark={isDark} />
            </div>
          ) : (
            <div className="h-[32vh] min-h-[220px] flex items-center justify-center text-sm text-brand-gray-400">
              Sem coordenadas para mostrar o mapa deste formato.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Slide por ponto ───
function PointSlide({ slide, selectionLabel, typesLabel, isDark = true }) {
  const { point, infoOnLeft } = slide;
  const images = getPointDisplayImages(point);
  const [imageIndex, setImageIndex] = useState(0);
  const img = images[imageIndex] || getPrimaryPointMediaKitImage(point);
  const hasMultipleImages = images.length > 1;
  const focusCoords = getFocusCoords(point);
  const [showImageModal, setShowImageModal] = useState(false);
  const focusX = Number.isFinite(Number(point?.imagem_foco_x)) ? Number(point.imagem_foco_x) : 50;
  const focusY = Number.isFinite(Number(point?.imagem_foco_y)) ? Number(point.imagem_foco_y) : 50;

  useEffect(() => {
    setImageIndex(0);
  }, [point?.id, point?._id]);

  return (
    <motion.div
      key={slide.key}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="h-full relative"
    >
      <div className={`absolute inset-0 rounded-2xl overflow-hidden border ${isDark ? 'border-white/10 bg-black/40' : 'border-neutral-200 bg-white/60'}`}>
        {img ? (
          <img
            src={img}
            alt={point.nome}
            className={`absolute inset-0 h-full w-full object-cover scale-[1.06] blur-sm ${isDark ? 'opacity-35' : 'opacity-20'}`}
            style={{ objectPosition: `${focusX}% ${focusY}%` }}
            loading="lazy"
            width="1280"
            height="720"
          />
        ) : (
          <div className={`absolute inset-0 ${isDark ? 'bg-black/70' : 'bg-neutral-100'}`} />
        )}
        <div
          className={`absolute inset-0 ${
            infoOnLeft
              ? isDark
                ? 'bg-[linear-gradient(90deg,rgba(0,0,0,0.93)_0%,rgba(0,0,0,0.65)_35%,rgba(0,0,0,0.18)_72%,rgba(0,0,0,0.04)_100%)]'
                : 'bg-[linear-gradient(90deg,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.70)_35%,rgba(255,255,255,0.18)_72%,rgba(255,255,255,0.04)_100%)]'
              : isDark
                ? 'bg-[linear-gradient(270deg,rgba(0,0,0,0.93)_0%,rgba(0,0,0,0.65)_35%,rgba(0,0,0,0.18)_72%,rgba(0,0,0,0.04)_100%)]'
                : 'bg-[linear-gradient(270deg,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.70)_35%,rgba(255,255,255,0.18)_72%,rgba(255,255,255,0.04)_100%)]'
          }`}
        />
      </div>

      {img ? (
        <div
          className={`slide-img-panel absolute inset-y-4 z-[12] rounded-2xl border backdrop-blur-sm p-3 transition-all ${
            isDark
              ? 'border-white/20 bg-black/30 shadow-[0_14px_42px_rgba(0,0,0,0.38)] hover:bg-black/40 hover:border-white/35'
              : 'border-neutral-200 bg-white/30 shadow-[0_14px_42px_rgba(0,0,0,0.1)] hover:bg-white/50 hover:border-neutral-300'
          } ${infoOnLeft ? 'left-[31%] right-3' : 'left-3 right-[31%]'}`}
        >
          <div
            className={`h-full w-full rounded-xl flex items-center justify-center overflow-hidden ${isDark ? 'bg-black/20' : 'bg-neutral-100/40'}`}
            role="button"
            tabIndex={0}
            onClick={() => setShowImageModal(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setShowImageModal(true);
              }
            }}
          >
            <img
              src={img}
              alt={point.nome}
              className="h-full w-full object-cover"
              style={{ objectPosition: `${focusX}% ${focusY}%` }}
              loading="lazy"
              width="1280"
              height="720"
            />
          </div>
          <div className="absolute right-5 top-5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white/90">
            Ver foto em tela cheia
          </div>

          {hasMultipleImages ? (
            <>
              <button
                type="button"
                onClick={() => setImageIndex((prev) => (prev - 1 + images.length) % images.length)}
                className="absolute left-5 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition-colors hover:bg-black/60"
                aria-label="Foto anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => setImageIndex((prev) => (prev + 1) % images.length)}
                className="absolute right-5 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition-colors hover:bg-black/60"
                aria-label="Próxima foto"
              >
                <ChevronRight size={18} />
              </button>
              <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
                {images.map((_, idx) => (
                  <button
                    key={`dot-${point.id || point._id || 'point'}-${idx}`}
                    type="button"
                    onClick={() => setImageIndex(idx)}
                    className={`h-2.5 w-2.5 rounded-full transition-all ${idx === imageIndex ? 'bg-[#E8591A]' : 'bg-gray-300/40'}`}
                    aria-label={`Ir para foto ${idx + 1}`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div
        className={`slide-mini-map absolute bottom-3 z-20 h-[180px] w-[280px] rounded-xl border overflow-hidden ${
          isDark
            ? 'border-white/20 bg-black/75 shadow-[0_8px_30px_rgba(0,0,0,0.45)]'
            : 'border-neutral-200 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.1)]'
        } ${infoOnLeft ? 'right-3' : 'left-3'}`}
      >
        {focusCoords ? (
          <SmartMap pontos={[point]} isDark={isDark} focusCoords={focusCoords} />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-xs text-brand-gray-400 px-4 text-center">
            Sem coordenadas para mostrar este ponto no mapa.
          </div>
        )}
      </div>

      <div
        className={`slide-info-panel absolute inset-y-0 z-10 w-[360px] max-w-[48%] p-3 md:p-4 ${
          infoOnLeft ? 'left-0' : 'right-0'
        }`}
      >
        <div className={`slide-info-panel-inner h-full rounded-2xl border backdrop-blur-md p-5 flex flex-col ${isDark ? 'border-white/15 bg-black/65' : 'border-neutral-200 bg-white/85'}`}>
          <img src={isDark ? '/logo.png' : '/logo-light.png'} alt="Intermidia" className="slide-info-logo h-7 self-start mb-3 opacity-65" />
          <div className="text-[11px] uppercase tracking-wide text-brand-orange">
            Informações do ponto
          </div>
          <h3 className={`slide-point-title mt-1.5 text-2xl font-extrabold leading-tight ${isDark ? '' : 'text-neutral-900'}`}>{point.nome}</h3>
          <p className={`mt-1 text-[15px] ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
            {point.tipo || 'Sem tipo'} &bull; {point.cidade || 'Sem cidade'}
          </p>
          <div className={`slide-point-details mt-3.5 space-y-2 text-[18px] leading-[1.35] ${isDark ? 'text-brand-gray-200' : 'text-neutral-700'}`}>
            {point.endereco ? (
              <div>
                <span className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'}>Endereço: </span>
                {point.endereco}
              </div>
            ) : null}
            <div>
              <span className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'}>Público: </span>
              {point.publico || 'N/I'}
            </div>
            <div>
              <span className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'}>Fluxo: </span>
              {fmtInt(Number(point.fluxo) || 0)} / mês
            </div>
            <div>
              <span className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'}>Pontos de Impacto: </span>
              {fmtInt(Number(point.telas) || 0)}
            </div>
            <div>
              <span className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'}>Inserções: </span>
              {fmtInt(Number(point.insercoes) || 0)} / mês
            </div>
            <div>
              <span className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'}>Investimento: </span>
              <strong className={isDark ? 'text-white' : 'text-neutral-900'}>{fmtMoney(Number(point.preco) || 0)}</strong> / mês
            </div>
          </div>
          <div className={`slide-info-footer mt-auto pt-3 border-t text-[12px] space-y-0.5 ${isDark ? 'border-white/10 text-brand-gray-400' : 'border-neutral-200 text-neutral-500'}`}>
            <div>
              <span className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'}>Praça(s): </span>
              {selectionLabel}
            </div>
            <div>
              <span className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'}>Formato(s): </span>
              {typesLabel}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showImageModal && img ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md p-4 md:p-6 flex items-center justify-center overflow-hidden"
            onClick={() => setShowImageModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2 }}
              className="relative rounded-2xl border border-white/20 bg-black/55 p-2 md:p-3 max-h-[calc(100vh-56px)] max-w-[calc(100vw-32px)] md:max-h-[calc(100vh-80px)] md:max-w-[calc(100vw-80px)] overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="absolute -top-3 -right-3 h-9 w-9 rounded-full border border-white/30 bg-black/75 flex items-center justify-center text-white/90 hover:text-white"
                aria-label="Fechar imagem"
              >
                <X size={16} />
              </button>
              <img
                src={img}
                alt={point.nome}
                className="block h-auto w-auto max-h-[calc(100vh-120px)] max-w-[calc(100vw-64px)] md:max-h-[calc(100vh-140px)] md:max-w-[calc(100vw-120px)] object-contain rounded-xl mx-auto"
                style={{ objectPosition: `${focusX}% ${focusY}%` }}
                loading="lazy"
                width="1600"
                height="900"
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Hook: detecção de mobile ───
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ─── Slide de transição: versão MOBILE ───
function MobileDividerSlide({ tipo, count, totaisTipo, isDark = true }) {
  return (
    <motion.div
      key={`mob-div-${tipo}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="h-full flex flex-col items-center justify-center text-center px-6 relative overflow-hidden"
    >
      <div className={`absolute inset-0 ${isDark ? 'bg-[radial-gradient(ellipse_at_center,rgba(254,92,43,0.16),transparent_62%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(254,92,43,0.06),transparent_62%)]'}`} />
      <div className="relative z-10 w-full flex flex-col items-center">
        <div className="text-[11px] uppercase tracking-[0.24em] text-brand-orange mb-4">Formato</div>
        <h2 className={`text-[2.5rem] font-black tracking-tight leading-none mb-5 ${isDark ? '' : 'text-neutral-900'}`}>{tipo}</h2>
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-orange/35 bg-brand-orange/15 px-6 py-2.5 text-xl font-bold text-brand-orange mb-8">
          {fmtInt(count)} {count === 1 ? 'ponto' : 'pontos'}
        </div>
        {totaisTipo && (
          <div className="grid grid-cols-2 gap-3 w-full max-w-[288px]">
            <div className={`rounded-2xl border p-4 text-center ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-white border-neutral-200'}`}>
              <div className={`text-xl font-bold leading-tight ${isDark ? '' : 'text-neutral-900'}`}>{fmtInt(totaisTipo.fluxo)}</div>
              <div className={`text-[11px] uppercase tracking-wide mt-2 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Fluxo / mês</div>
            </div>
            <div className={`rounded-2xl border p-4 text-center ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-white border-neutral-200'}`}>
              <div className={`text-lg font-bold leading-tight ${isDark ? '' : 'text-neutral-900'}`}>{fmtMoney(totaisTipo.valor)}</div>
              <div className={`text-[11px] uppercase tracking-wide mt-2 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Investimento</div>
            </div>
          </div>
        )}
        <p className={`mt-8 text-[12px] flex items-center gap-1.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
          <i className="ri-gesture-line" style={{ fontSize: 14 }} />
          Deslize para ver os pontos
        </p>
      </div>
    </motion.div>
  );
}

// ─── Slide por ponto: versão MOBILE ───
function MobilePointSlide({ slide, selectionLabel, typesLabel, isDark = true }) {
  const { point } = slide;
  const images = getPointDisplayImages(point);
  const [imageIndex, setImageIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const img = images[imageIndex] || getPrimaryPointMediaKitImage(point);
  const focusX = Number.isFinite(Number(point?.imagem_foco_x)) ? Number(point.imagem_foco_x) : 50;
  const focusY = Number.isFinite(Number(point?.imagem_foco_y)) ? Number(point.imagem_foco_y) : 50;
  const hasMultipleImages = images.length > 1;
  const imgTouchStartX = useRef(null);

  useEffect(() => {
    setImageIndex(0);
    setExpanded(false);
  }, [point?.id, point?._id]);

  // Swipe entre fotos dentro da área de imagem
  const handleImgTouchStart = useCallback((e) => {
    imgTouchStartX.current = e.touches[0].clientX;
  }, []);
  const handleImgTouchEnd = useCallback((e) => {
    if (imgTouchStartX.current === null || !hasMultipleImages) return;
    const delta = e.changedTouches[0].clientX - imgTouchStartX.current;
    imgTouchStartX.current = null;
    if (Math.abs(delta) < 36) return;
    setImageIndex((i) => delta < 0 ? (i + 1) % images.length : (i - 1 + images.length) % images.length);
  }, [hasMultipleImages, images.length]);

  return (
    <motion.div
      key={slide.key}
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -32 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`h-full flex flex-col overflow-hidden rounded-2xl border ${isDark ? 'border-white/10' : 'border-neutral-200'}`}
    >
      {/* ── Imagem: 52% do espaço ── */}
      <div
        className={`relative flex-none overflow-hidden ${isDark ? 'bg-black/60' : 'bg-neutral-100'}`}
        style={{ height: '52%' }}
        onTouchStart={handleImgTouchStart}
        onTouchEnd={handleImgTouchEnd}
      >
        {img ? (
          <img
            src={img}
            alt={point.nome}
            className="w-full h-full object-cover"
            style={{ objectPosition: `${focusX}% ${focusY}%` }}
            loading="lazy"
            width="800"
            height="600"
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${isDark ? 'bg-white/[0.03]' : 'bg-neutral-50'}`}>
            <i className="ri-image-line text-5xl text-brand-gray-700" />
          </div>
        )}

        {/* Gradiente na base da imagem para transição suave */}
        <div className={`absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t pointer-events-none ${isDark ? 'from-[#0d0d0d] to-transparent' : 'from-white to-transparent'}`} />

        {/* Badge do formato */}
        <div className="absolute top-3 left-3">
          <span className={`rounded-full backdrop-blur-sm px-3 py-1 text-[11px] font-semibold border ${isDark ? 'bg-black/65 text-white border-white/20' : 'bg-white/80 text-neutral-800 border-neutral-200'}`}>
            {point.tipo || 'Ponto'}
          </span>
        </div>

        {/* Dots de múltiplas fotos */}
        {hasMultipleImages && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setImageIndex(i)}
                className={`rounded-full transition-all duration-200 ${
                  i === imageIndex ? 'w-5 h-[6px] bg-brand-orange' : 'w-[6px] h-[6px] bg-white/50'
                }`}
                aria-label={`Foto ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Info: 48% restante ── */}
      <div className={`flex-1 min-h-0 flex flex-col overflow-hidden ${isDark ? 'bg-[#0d0d0d]' : 'bg-white'}`}>

        {/* Nome e cidade */}
        <div className="px-4 pt-4 pb-3 flex-shrink-0">
          <h3 className={`text-[1.1rem] font-extrabold leading-snug ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {point.nome}
          </h3>
          <p className={`mt-1 text-[13px] flex items-center gap-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            <i className="ri-map-pin-2-line text-brand-orange flex-shrink-0" style={{ fontSize: 13 }} />
            {point.cidade || 'Sem cidade'}
          </p>
        </div>

        {/* ── 3 métricas principais em cards ── */}
        <div className="px-4 flex-shrink-0">
          <div className="grid grid-cols-3 gap-2">
            <div className={`rounded-xl border px-2 py-3 text-center ${isDark ? 'bg-white/[0.05] border-white/10' : 'bg-neutral-50 border-neutral-200'}`}>
              <div className="text-[1rem] font-black text-brand-orange leading-none">
                {fmtInt(Number(point.fluxo) || 0)}
              </div>
              <div className={`text-[10px] mt-1.5 uppercase tracking-wide leading-tight ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                Fluxo<br />/ mês
              </div>
            </div>
            <div className={`rounded-xl border px-2 py-3 text-center ${isDark ? 'bg-white/[0.05] border-white/10' : 'bg-neutral-50 border-neutral-200'}`}>
              <div className={`text-[1rem] font-black leading-none ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                {fmtInt(Number(point.telas) || 0)}
              </div>
              <div className={`text-[10px] mt-1.5 uppercase tracking-wide leading-tight ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                Pontos<br />Impacto
              </div>
            </div>
            <div className={`rounded-xl border px-2 py-3 text-center ${isDark ? 'bg-white/[0.05] border-white/10' : 'bg-neutral-50 border-neutral-200'}`}>
              <div className={`text-[0.875rem] font-black leading-none ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                {fmtMoney(Number(point.preco) || 0)}
              </div>
              <div className={`text-[10px] mt-1.5 uppercase tracking-wide leading-tight ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                Invest.<br />/ mês
              </div>
            </div>
          </div>
        </div>

        {/* ── Detalhes expansíveis ── */}
        <div className="mt-auto flex flex-col flex-shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className={`flex items-center justify-between px-4 py-3 text-[13px] border-t transition ${isDark ? 'text-brand-gray-400 border-white/[0.07] active:bg-white/[0.03]' : 'text-neutral-500 border-neutral-100 active:bg-neutral-50'}`}
          >
            <span>{expanded ? 'Ocultar detalhes' : 'Ver mais detalhes'}</span>
            <i className={`ri-arrow-${expanded ? 'up' : 'down'}-s-line`} style={{ fontSize: 16 }} />
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-2.5">
                  {point.endereco ? (
                    <div className={`flex items-start gap-2.5 text-[13px] ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                      <i className="ri-map-pin-line text-brand-orange flex-shrink-0 mt-0.5" style={{ fontSize: 14 }} />
                      <span>{point.endereco}</span>
                    </div>
                  ) : null}
                  {point.publico ? (
                    <div className={`flex items-start gap-2.5 text-[13px] ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                      <i className="ri-user-smile-line text-brand-orange flex-shrink-0 mt-0.5" style={{ fontSize: 14 }} />
                      <span>Público: {point.publico}</span>
                    </div>
                  ) : null}
                  {Number(point.insercoes) > 0 ? (
                    <div className={`flex items-start gap-2.5 text-[13px] ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                      <i className="ri-repeat-2-line text-brand-orange flex-shrink-0 mt-0.5" style={{ fontSize: 14 }} />
                      <span>{fmtInt(Number(point.insercoes))} inserções/mês</span>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
  isDark = true,
}) {
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState('lobby');
  const [selectedPointIds, setSelectedPointIds] = useState(new Set());
  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const autoPlayRef = useRef(null);
  const containerRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

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
      document.body.setAttribute('data-slides-active', '1');
    } else {
      document.body.removeAttribute('data-slides-active');
    }
    return () => document.body.removeAttribute('data-slides-active');
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
      result.push({ type: 'divider', key: `divider-${tipo}`, tipo, count: pts.length, totaisTipo, points: pts });
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
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setAutoPlay(false);
        setIndex((i) => Math.min(slides.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setAutoPlay(false);
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, slides.length]);

  // Auto-play: advance slides every 8 seconds (dividers 5s, points 8s)
  useEffect(() => {
    if (!autoPlay || phase !== 'presenting' || slides.length === 0) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
      return;
    }
    const active = slides[index];
    const delay = active?.type === 'divider' ? 5000 : 8000;
    autoPlayRef.current = setTimeout(() => {
      setIndex((i) => {
        if (i >= slides.length - 1) {
          setAutoPlay(false);
          return i;
        }
        return i + 1;
      });
    }, delay);
    return () => clearTimeout(autoPlayRef.current);
  }, [autoPlay, phase, index, slides]);

  // Stop autoplay when leaving presenting mode
  useEffect(() => {
    if (phase !== 'presenting') setAutoPlay(false);
  }, [phase]);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    // Only handle clear horizontal swipes (not scrolling)
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) {
      setAutoPlay(false);
      setIndex((i) => Math.min(slides.length - 1, i + 1));
    } else {
      setAutoPlay(false);
      setIndex((i) => Math.max(0, i - 1));
    }
  }, [slides.length]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const countsByTipo = useMemo(() => {
    const map = new Map();
    for (const p of selectedPoints) {
      const key = String(p?.tipo || '').trim();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [selectedPoints]);

  if (!open) return null;

  const active = slides[index] || null;
  const activePoint = active?.type === 'point' ? active.point : null;
  const activeTipoCount = activePoint ? (countsByTipo.get(String(activePoint.tipo || '').trim()) || 1) : 1;
  const activeTipoLabel = activePoint
    ? formatTipoLabel(activePoint.tipo, activeTipoCount)
    : formatTipoLabel(active?.tipo, active?.count || 1);
  const topViewingText = activePoint
    ? `Você está visualizando ${activeTipoLabel} de ${activePoint.cidade || 'Cidade não informada'}`
    : `Você está visualizando o formato ${activeTipoLabel}`;

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
    <div ref={containerRef} className={`fixed inset-0 z-[95] overflow-hidden ${isDark ? 'bg-black text-white' : 'bg-[#f4f5f7] text-neutral-900'}`}>
      <div className={`absolute inset-0 ${isDark ? 'bg-[radial-gradient(circle_at_20%_18%,rgba(254,92,43,0.22),transparent_34%)]' : 'bg-[radial-gradient(circle_at_20%_18%,rgba(254,92,43,0.08),transparent_34%)]'}`} />
      <div className="relative z-[1] h-full flex flex-col">
        {phase === 'lobby' ? (
          <>
            <button
              onClick={onClose}
              className={`absolute top-4 right-4 z-20 rounded-xl border p-2 ${isDark ? 'border-white/20 bg-black/40 text-white/70 hover:text-white' : 'border-neutral-300 bg-white/80 text-neutral-500 hover:text-neutral-900'}`}
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
              isDark={isDark}
            />
          </>
        ) : (
          <div className="h-full flex flex-col px-4 py-3 md:px-6 md:py-4">

            {/* ── CABEÇALHO: desktop = rico | mobile = mínimo ── */}

            {/* Desktop header (informações completas) */}
            <div className="hidden md:flex items-center justify-between gap-3 mb-3">
              <div className={`flex-1 rounded-xl border px-4 py-2.5 ${isDark ? 'border-white/15 bg-black/35' : 'border-neutral-200 bg-white/80'}`}>
                <div className="text-[10px] uppercase tracking-wide text-brand-orange">Apresentação ativa</div>
                <div className={`text-base font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>{topViewingText}</div>
                <div className={`mt-1 grid grid-cols-4 gap-x-3 gap-y-0.5 text-[11px] ${isDark ? 'text-brand-gray-300' : 'text-neutral-500'}`}>
                  <span>Pontos: <strong className={isDark ? 'text-white' : 'text-neutral-900'}>{fmtInt(totals.quantidade)}</strong></span>
                  <span>Pontos de Impacto: <strong className={isDark ? 'text-white' : 'text-neutral-900'}>{fmtInt(totals.telasTotal)}</strong></span>
                  <span>Fluxo: <strong className={isDark ? 'text-white' : 'text-neutral-900'}>{fmtInt(totals.fluxoTotal)}</strong></span>
                  <span>Invest.: <strong className={isDark ? 'text-white' : 'text-neutral-900'}>{fmtMoney(totals.valorTotal)}</strong></span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPhase('lobby')} className={`rounded-xl border px-3 py-1.5 text-xs ${isDark ? 'border-white/20 bg-black/35 text-white/70 hover:text-white' : 'border-neutral-300 bg-white/80 text-neutral-500 hover:text-neutral-900'}`}>
                  ← Seleção
                </button>
                <button
                  type="button"
                  onClick={() => setAutoPlay((v) => !v)}
                  className={`rounded-xl border px-3 py-1.5 text-xs flex items-center gap-1.5 transition-all ${
                    autoPlay
                      ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange'
                      : isDark ? 'border-white/20 bg-black/35 text-white/70 hover:text-white' : 'border-neutral-300 bg-white/80 text-neutral-500 hover:text-neutral-900'
                  }`}
                  title={autoPlay ? 'Pausar apresentação automática' : 'Iniciar apresentação automática'}
                >
                  {autoPlay ? <Pause size={13} /> : <Play size={13} />}
                  {autoPlay ? 'Pausar' : 'Automático'}
                </button>
                <button type="button" onClick={toggleFullscreen} className={`rounded-xl border p-2 ${isDark ? 'border-white/20 bg-black/35 text-white/70 hover:text-white' : 'border-neutral-300 bg-white/80 text-neutral-500 hover:text-neutral-900'}`} title={isFullscreen ? 'Sair do fullscreen' : 'Tela cheia'}>
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button onClick={onClose} className={`rounded-xl border p-2 ${isDark ? 'border-white/20 bg-black/35 text-white/75 hover:text-white' : 'border-neutral-300 bg-white/80 text-neutral-500 hover:text-neutral-900'}`}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Mobile header (mínimo: só o essencial) */}
            <div className="md:hidden flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setPhase('lobby')}
                className={`h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-xl border transition ${isDark ? 'border-white/20 bg-black/40 text-white/70 active:bg-white/10' : 'border-neutral-300 bg-white/80 text-neutral-500 active:bg-neutral-100'}`}
                aria-label="Voltar à seleção"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-brand-orange uppercase tracking-wide">
                  {active?.type === 'divider' ? 'Formato' : 'Ponto'}
                </div>
                <div className={`text-sm font-bold truncate leading-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                  {active?.type === 'divider' ? active.tipo : (active?.point?.nome ?? '—')}
                </div>
              </div>
              <button
                onClick={onClose}
                className={`h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-xl border transition ${isDark ? 'border-white/20 bg-black/40 text-white/75 active:bg-white/10' : 'border-neutral-300 bg-white/80 text-neutral-500 active:bg-neutral-100'}`}
                aria-label="Fechar apresentação"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── ÁREA DO SLIDE ── */}
            <div
              className={`flex-1 min-h-0 rounded-2xl md:rounded-3xl border p-2 md:p-4 overflow-hidden relative ${isDark ? 'border-white/15 bg-gradient-to-b from-white/[0.05] to-white/[0.02]' : 'border-neutral-200 bg-white shadow-sm'}`}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {!active ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-brand-gray-400">
                  <i className="ri-slideshow-line text-4xl opacity-40" />
                  <span className="text-sm">Nenhum ponto selecionado.</span>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {active.type === 'divider' ? (
                    isMobile ? (
                      <MobileDividerSlide
                        key={active.key}
                        tipo={active.tipo}
                        count={active.count}
                        totaisTipo={active.totaisTipo}
                        isDark={isDark}
                      />
                    ) : (
                      <DividerSlide
                        key={active.key}
                        tipo={active.tipo}
                        count={active.count}
                        totaisTipo={active.totaisTipo}
                        points={active.points}
                        isDark={isDark}
                      />
                    )
                  ) : isMobile ? (
                    <MobilePointSlide
                      key={active.key}
                      slide={active}
                      selectionLabel={selectionLabel}
                      typesLabel={typesLabel}
                      isDark={isDark}
                    />
                  ) : (
                    <PointSlide
                      key={active.key}
                      slide={active}
                      selectionLabel={selectionLabel}
                      typesLabel={typesLabel}
                      isDark={isDark}
                    />
                  )}
                </AnimatePresence>
              )}
            </div>

            {/* ── BARRA DE NAVEGAÇÃO ── */}
            <div className="mt-2.5 flex flex-col items-center gap-1.5 self-center w-full max-w-xs">
              <div className="flex items-center justify-between w-full gap-2">
                <button
                  type="button"
                  onClick={() => { setAutoPlay(false); setIndex((i) => Math.max(0, i - 1)); }}
                  disabled={index === 0}
                  className={`h-11 w-11 flex items-center justify-center rounded-full border disabled:opacity-30 transition ${isDark ? 'border-white/20 bg-black/40 text-white/70 hover:text-white active:bg-white/10' : 'border-neutral-300 bg-white/80 text-neutral-500 hover:text-neutral-900 active:bg-neutral-100'}`}
                  aria-label="Slide anterior"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => setAutoPlay((v) => !v)}
                  className={`h-9 w-9 flex items-center justify-center rounded-full transition-all ${
                    autoPlay
                      ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/30'
                      : isDark ? 'border border-white/20 bg-black/40 text-white/60 hover:text-white' : 'border border-neutral-300 bg-white/80 text-neutral-500 hover:text-neutral-900'
                  }`}
                  title={autoPlay ? 'Pausar automático' : 'Reproduzir automaticamente'}
                >
                  {autoPlay ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                </button>
                <span className={`text-xs uppercase tracking-[0.14em] min-w-[52px] text-center select-none ${isDark ? 'text-white/60' : 'text-neutral-500'}`}>
                  {slides.length ? `${index + 1} / ${slides.length}` : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => { setAutoPlay(false); setIndex((i) => Math.min(slides.length - 1, i + 1)); }}
                  disabled={index >= slides.length - 1}
                  className={`h-11 w-11 flex items-center justify-center rounded-full border disabled:opacity-30 transition ${isDark ? 'border-white/20 bg-black/40 text-white/70 hover:text-white active:bg-white/10' : 'border-neutral-300 bg-white/80 text-neutral-500 hover:text-neutral-900 active:bg-neutral-100'}`}
                  aria-label="Próximo slide"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              {/* Barra de progresso */}
              <div className={`w-full h-1 rounded-full ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}>
                <div
                  className="h-full rounded-full bg-brand-orange transition-all duration-300 ease-out"
                  style={{ width: slides.length > 0 ? `${((index + 1) / slides.length) * 100}%` : '0%' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
