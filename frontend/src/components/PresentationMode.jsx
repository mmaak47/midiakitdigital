import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  MapPinned,
  Monitor,
  Presentation,
  QrCode,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Circle, CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { buildAudienceQualification, buildEntornoSummary, getSegmentDisplayName } from '../lib/strategy';
import { getPrimaryPointScreenImage } from '../lib/pointImages';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const formatNumber = (value) => new Intl.NumberFormat('pt-BR').format(value || 0);

export default function PresentationMode({
  points = [], totals, segmento, clientName = '', pricingSummary, onClose,
  clientMode = false,
  proposalToken = null,
  autoAdvance = false,
  autoAdvanceSeconds = 20,
}) {
  const [index, setIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState({});
  const [showQR, setShowQR] = useState(false);
  const current = points[index];

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(points.length - 1, i + 1));
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [points.length, onClose]);

  useEffect(() => {
    if (!autoAdvance) return;
    const id = setInterval(() => {
      setIndex((i) => (i < points.length - 1 ? i + 1 : i));
    }, autoAdvanceSeconds * 1000);
    return () => clearInterval(id);
  }, [autoAdvance, autoAdvanceSeconds, points.length]);

  const currentView = useMemo(() => {
    if (!current) return null;
    const lat = Number(current.lat);
    const lng = Number(current.lng);
    const pointCoords = Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : null;
    const nearbyCoords = Array.isArray(current?.entornoMetrics?.places)
      ? current.entornoMetrics.places
        .filter((place) => Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng)))
        .slice(0, 20)
        .map((place) => ({
          lat: Number(place.lat),
          lng: Number(place.lng),
          name: place.name || 'Local',
          distance: Number(place.distance) || 0
        }))
      : [];
    const relevantPlacesCount = Number(current?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;
    const hasEntornoData = relevantPlacesCount > 0;

    return {
      mediaUrl: current.proposalSimulationPreview || current.simulacao_preview || getPrimaryPointScreenImage(current),
      audience: buildAudienceQualification(current),
      entorno: buildEntornoSummary(current.entornoMetrics, segmento),
      hasEntornoData,
      segmentLabel: getSegmentDisplayName(segmento),
      radiusMeters: Number(current?.entornoMetrics?.raio_m) || 800,
      geo: {
        point: pointCoords,
        nearby: nearbyCoords
      }
    };
  }, [current, segmento]);

  if (!points.length || !current || !currentView) return null;

  const completion = Math.round(((index + 1) / points.length) * 100);
  const readText = (key, fallback) => edits[key] ?? fallback;
  const writeText = (key, value) => setEdits((currentEdits) => ({ ...currentEdits, [key]: value }));

  return createPortal(
    <div data-theme="light" className="fixed inset-0 z-[60] overflow-y-auto bg-[#ECEFF3] text-gray-900" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
      <div className="relative mx-auto max-w-[1480px] px-6 md:px-10 py-6 md:py-8">
        {/* HEADER */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.08)] px-4 py-3">
          <div className="flex items-center gap-4">
            <img src="/logo-light.png" alt="Intermidia" className="h-7 w-auto object-contain" />
            <div className="hidden sm:block h-7 w-px bg-gray-200" />
            <div className="hidden sm:flex items-center gap-2">
              <span className="rounded-full bg-brand-orange px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_4px_14px_rgba(254,92,43,0.30)]">
                Apresentação comercial
              </span>
              {clientName ? (
                <span className="text-sm text-gray-600">para <span className="text-gray-900 font-semibold">{clientName}</span></span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden md:inline-flex items-center rounded-full bg-gray-100 border border-gray-200 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-gray-600">
              {String(index + 1).padStart(2, '0')} / {String(points.length).padStart(2, '0')}
            </span>
            {proposalToken && (
              <button
                onClick={() => setShowQR(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                title="QR code para o cliente"
              >
                <QrCode size={15} />
                QR
              </button>
            )}
            {!clientMode && (
              <button
                onClick={() => setEditMode((v) => !v)}
                className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                  editMode
                    ? 'bg-brand-orange text-white shadow-[0_8px_24px_rgba(254,92,43,0.30)] hover:bg-brand-orange-hover'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {editMode ? 'Concluir' : 'Editar textos'}
              </button>
            )}
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white p-2 text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* PROGRESSO */}
        <div className="mb-6 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-bold">Slide</span>
          <div className="relative flex-1 h-[3px] bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 bg-brand-orange"
              initial={false}
              animate={{ width: `${completion}%` }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            />
            {autoAdvance && (
              <motion.div
                key={`auto-${index}`}
                className="absolute inset-y-0 left-0 bg-brand-orange/40"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: autoAdvanceSeconds, ease: 'linear' }}
              />
            )}
          </div>
          <span className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-bold">{completion}%</span>
        </div>

        {/* MAIN GRID */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <AnimatePresence mode="wait">
            <motion.section
              key={current.id || index}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5"
            >
              {/* HERO */}
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                {/* Visual */}
                <div className="relative overflow-hidden rounded-[20px] border border-gray-200/70 bg-gray-100 aspect-[16/10] lg:aspect-auto lg:min-h-[460px] shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-15px_rgba(0,0,0,0.1)]">
                  {currentView.mediaUrl ? (
                    <motion.img
                      key={currentView.mediaUrl}
                      src={currentView.mediaUrl}
                      alt={current.nome}
                      initial={{ opacity: 0, scale: 1.03 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-gray-400">
                      <Monitor size={32} />
                      <p className="mt-2 text-sm">Sem visual disponível</p>
                    </div>
                  )}
                  <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-gray-700 border border-gray-200/70 shadow-sm font-bold">
                    <Sparkles size={11} className="text-brand-orange" />
                    Visual da campanha
                  </div>
                </div>

                {/* Identidade + métricas chave */}
                <div className="flex flex-col justify-between gap-5">
                  <div className="rounded-[20px] bg-white border border-gray-200/70 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-15px_rgba(0,0,0,0.1)]">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-brand-orange font-bold">
                      Ponto {index + 1} de {points.length}
                    </p>
                    <EditableText
                      editMode={editMode}
                      value={readText(`point-${current.id}-name`, current.nome)}
                      onChange={(v) => writeText(`point-${current.id}-name`, v)}
                      className="mt-3 text-2xl md:text-3xl xl:text-4xl font-extrabold leading-[1.05] tracking-tight text-gray-900"
                      multiline
                    />
                    <div className="mt-3 h-[2px] w-12 bg-brand-orange rounded-full" />
                    <EditableText
                      editMode={editMode}
                      value={readText(`point-${current.id}-meta`, `${current.cidade} • ${current.tipo} • ${currentView.segmentLabel}`)}
                      onChange={(v) => writeText(`point-${current.id}-meta`, v)}
                      className="mt-3 text-sm text-gray-600"
                    />
                  </div>

                  {/* Métricas em destaque */}
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard icon={Target} label="Valor Negociado" value={formatCurrency(current.preco || 0)} accent="orange" />
                    <MetricCard icon={Users} label="Público" value={current.publico || 'A/B'} accent="white" />
                    <MetricCard icon={TrendingUp} label="Fluxo mensal" value={formatNumber(current.fluxo || 0)} accent="white" />
                    <MetricCard icon={Monitor} label="Pontos de Impacto" value={formatNumber(current.telas || 0)} accent="white" />
                  </div>

                  {/* Endereço */}
                  <div className="rounded-2xl bg-white border border-gray-200/70 px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400 font-bold">Endereço</div>
                    <EditableText
                      editMode={editMode}
                      value={readText(`point-${current.id}-address`, current.endereco || 'Endereço não informado')}
                      onChange={(v) => writeText(`point-${current.id}-address`, v)}
                      className="mt-1.5 text-sm text-gray-800 leading-snug font-medium"
                      multiline
                    />
                    {current.clientDistanceKm ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-brand-orange font-bold">
                        <MapPinned size={11} />
                        Cliente a {current.clientDistanceKm.toFixed(1).replace('.', ',')} km
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* INSIGHTS */}
              <div className="grid gap-5 lg:grid-cols-2">
                <InsightCard
                  icon={Users}
                  eyebrow={readText(`audience-${current.id}-eyebrow`, currentView.audience.badge)}
                  title={readText(`audience-${current.id}-title`, currentView.audience.headline)}
                  description={readText(`audience-${current.id}-description`, currentView.audience.summary)}
                  items={currentView.audience.bullets.map((item, i) => readText(`audience-${current.id}-item-${i}`, item))}
                  editMode={editMode}
                  onEdit={(field, value, itemIndex) => {
                    const key = field === 'item'
                      ? `audience-${current.id}-item-${itemIndex}`
                      : `audience-${current.id}-${field}`;
                    writeText(key, value);
                  }}
                />

                {currentView.hasEntornoData ? (
                  <InsightCard
                    icon={MapPinned}
                    eyebrow={readText(`entorno-${current.id}-eyebrow`, 'Entorno aderente')}
                    title={readText(`entorno-${current.id}-title`, currentView.entorno.headline)}
                    description={readText(`entorno-${current.id}-description`, currentView.entorno.summary)}
                    items={currentView.entorno.places.map((place, i) => readText(`entorno-${current.id}-item-${i}`, `${place.name} • ${place.category} • ${place.distanceLabel}`))}
                    emptyMessage="Os locais próximos aparecerão aqui assim que o cache de entorno desse segmento estiver disponível."
                    editMode={editMode}
                    onEdit={(field, value, itemIndex) => {
                      const key = field === 'item'
                        ? `entorno-${current.id}-item-${itemIndex}`
                        : `entorno-${current.id}-${field}`;
                      writeText(key, value);
                    }}
                  />
                ) : null}

                {currentView.hasEntornoData ? (
                  <div className="lg:col-span-2">
                    <GeoRadiusMapCard
                      title="Mapa geográfico de evidências"
                      radiusMeters={currentView.radiusMeters}
                      point={currentView.geo.point}
                      places={currentView.geo.nearby}
                      fallbackPlaces={currentView.entorno.places}
                    />
                  </div>
                ) : null}
              </div>

              {/* NAVEGAÇÃO */}
              <div className="flex items-center justify-between gap-4 pt-2">
                <button
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  <ChevronLeft size={16} />
                  Anterior
                </button>

                <span className="hidden sm:inline-flex text-[10px] uppercase tracking-[0.18em] text-gray-500 font-bold">
                  Use ← → para navegar
                </span>

                <button
                  onClick={() => setIndex((i) => Math.min(points.length - 1, i + 1))}
                  disabled={index === points.length - 1}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(254,92,43,0.30)] transition-colors hover:bg-brand-orange-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Próximo
                  <ChevronRight size={16} />
                </button>
              </div>
            </motion.section>
          </AnimatePresence>

          {/* SIDEBAR */}
          <aside className="space-y-5">
            {/* Resumo */}
            <div className="rounded-[20px] bg-white border border-gray-200/70 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-15px_rgba(0,0,0,0.1)]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400 font-bold">Resumo da proposta</div>
                <EditableText
                  editMode={editMode}
                  value={readText('summary-copy', clientName ? `Indicadores executivos para ${clientName}.` : 'Indicadores executivos da campanha.')}
                  onChange={(v) => writeText('summary-copy', v)}
                  className="mt-1.5 text-sm text-gray-700 leading-snug"
                  multiline
                />
              </div>

              {/* Valor em destaque */}
              <div className="mt-5 rounded-2xl bg-brand-orange p-4 shadow-[0_12px_32px_rgba(254,92,43,0.30)]">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white font-bold">Valor Negociado</div>
                <div className="mt-1 text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  {formatCurrency(pricingSummary?.finalTotal ?? totals.valorTotal ?? 0)}
                </div>
                {!clientMode && pricingSummary?.hasDiscount && pricingSummary.originalTotal !== pricingSummary.finalTotal ? (
                  <div className="mt-2 text-xs font-medium text-white">
                    Tabela: <span className="line-through opacity-90">{formatCurrency(pricingSummary.originalTotal || 0)}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2">
                <MiniStat label="Fluxo total" value={formatNumber(totals.fluxoTotal || 0)} />
                <MiniStat label="CPM estimado" value={`R$ ${(totals.cpmEstimado || 0).toFixed(2).replace('.', ',')}`} />
                <MiniStat label="Inserções" value={formatNumber(totals.insercoesTotal || 0)} />
              </div>
            </div>

            {/* Thumbnails */}
            <div className="rounded-[20px] bg-white border border-gray-200/70 p-3 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-15px_rgba(0,0,0,0.1)]">
              <div className="px-2 pt-1 pb-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.18em] text-gray-400 font-bold">Pontos da campanha</span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-mono font-bold">
                  {String(index + 1).padStart(2, '0')}/{String(points.length).padStart(2, '0')}
                </span>
              </div>
              <div className="max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
                {points.map((point, idx) => {
                  const thumb = point.proposalSimulationPreview || point.simulacao_preview || getPrimaryPointScreenImage(point);
                  const active = idx === index;
                  return (
                    <button
                      key={point.id}
                      type="button"
                      onClick={() => setIndex(idx)}
                      className={`group relative w-full rounded-xl p-2 text-left transition-all ${
                        active
                          ? 'bg-brand-orange/10 ring-1 ring-brand-orange'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      {active && (
                        <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-orange" />
                      )}
                      <div className="flex gap-3 pl-2">
                        <div className="h-12 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 shrink-0">
                          {thumb ? <img src={thumb} alt={point.nome} className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-gray-900">{point.nome}</p>
                          <p className="mt-0.5 truncate text-[11px] text-gray-500">{point.cidade} • {point.tipo}</p>
                          <p className={`mt-0.5 text-[11px] font-bold ${active ? 'text-brand-orange' : 'text-gray-700'}`}>
                            {formatCurrency(point.preco || 0)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* QR overlay */}
      {showQR && proposalToken && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70]" onClick={() => setShowQR(false)}>
          <div className="bg-white border border-gray-200 rounded-3xl p-6 text-center shadow-2xl max-w-xs w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-gray-900">Ver proposta no celular</p>
              <button onClick={() => setShowQR(false)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="bg-white p-3 rounded-2xl inline-block mb-4 border border-gray-100">
              <QRCodeSVG
                value={`${window.location.origin}/p/${proposalToken}`}
                size={200}
                bgColor="#ffffff"
                fgColor="#111111"
              />
            </div>
            <p className="text-xs text-gray-500">Escaneie para ver a proposta no celular</p>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

function MetricCard({ icon: Icon, label, value, accent = 'white' }) {
  const isOrange = accent === 'orange';
  return (
    <motion.div
      layout
      className={`rounded-2xl p-3.5 transition-colors ${
        isOrange
          ? 'bg-brand-orange text-white shadow-[0_8px_24px_rgba(254,92,43,0.25)]'
          : 'bg-white border border-gray-200/70 hover:border-gray-300 shadow-[0_1px_0_rgba(0,0,0,0.02)]'
      }`}
    >
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] font-bold leading-none ${
        isOrange ? 'text-white' : 'text-gray-400'
      }`}>
        <Icon size={11} className="shrink-0" />
        {label}
      </div>
      <div className={`mt-2 text-xl font-bold tracking-tight ${isOrange ? 'text-white' : 'text-gray-900'}`}>{value}</div>
    </motion.div>
  );
}

function InsightCard({ icon: Icon, eyebrow, title, description, items = [], emptyMessage, editMode = false, onEdit }) {
  const hasItems = items.length > 0;

  return (
    <motion.div layout className="rounded-[20px] bg-white border border-gray-200/70 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-15px_rgba(0,0,0,0.1)] hover:border-gray-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange text-white shadow-[0_6px_18px_rgba(254,92,43,0.25)] shrink-0">
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <EditableText editMode={editMode} value={eyebrow} onChange={(v) => onEdit?.('eyebrow', v)} className="text-[10px] uppercase tracking-[0.18em] text-brand-orange font-bold" />
          <EditableText editMode={editMode} value={title} onChange={(v) => onEdit?.('title', v)} className="mt-1 text-base md:text-lg font-bold text-gray-900 leading-snug" multiline />
          <EditableText editMode={editMode} value={description} onChange={(v) => onEdit?.('description', v)} className="mt-2 text-sm leading-relaxed text-gray-600" multiline />
        </div>
      </div>

      {hasItems ? (
        <ul className="mt-4 space-y-2">
          {items.map((item, i) => (
            <li key={`${item}-${i}`} className="flex gap-2.5 text-sm text-gray-700 leading-snug">
              <span className="mt-2 h-1 w-1 rounded-full bg-brand-orange shrink-0" />
              <EditableText editMode={editMode} value={item} onChange={(v) => onEdit?.('item', v, i)} className="text-sm text-gray-700 flex-1" multiline />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-400 bg-gray-50">
          {emptyMessage}
        </div>
      )}
    </motion.div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-2.5">
      <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500 font-bold">{label}</span>
      <span className="text-sm font-bold text-gray-900 tracking-tight">{value}</span>
    </div>
  );
}

function FitGeoBounds({ point, places = [], radiusMeters }) {
  const map = useMap();

  useEffect(() => {
    if (!point) return;
    const coords = [
      L.latLng(point.lat, point.lng),
      ...places.map((place) => L.latLng(place.lat, place.lng))
    ];

    if (coords.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [28, 28], maxZoom: 16 });
      return;
    }

    map.setView([point.lat, point.lng], radiusMeters >= 1500 ? 13 : 14);
  }, [map, point, places, radiusMeters]);

  return null;
}

function GeoRadiusMapCard({ title, radiusMeters, point, places = [], fallbackPlaces = [] }) {
  if (!point) {
    return <RadiusRadarCard title={title} radiusMeters={radiusMeters} places={fallbackPlaces} />;
  }

  return (
    <motion.div layout className="rounded-[20px] bg-white border border-gray-200/70 p-4 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-15px_rgba(0,0,0,0.1)]">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gray-400 font-bold">
        <Building2 size={14} className="text-brand-orange" />
        {title}
      </div>

      <div className="mt-3 h-[240px] overflow-hidden rounded-2xl border border-gray-200">
        <MapContainer
          center={[point.lat, point.lng]}
          zoom={14}
          className="h-full w-full"
          zoomControl={false}
          attributionControl={false}
          style={{ background: '#f4f5f7' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains={['a', 'b', 'c', 'd']}
          />
          <FitGeoBounds point={point} places={places} radiusMeters={radiusMeters} />

          <Circle
            center={[point.lat, point.lng]}
            radius={Math.max(100, Number(radiusMeters) || 800)}
            pathOptions={{ color: '#FE5C2B', fillColor: '#FE5C2B', fillOpacity: 0.10, weight: 1.4 }}
          />

          <CircleMarker
            center={[point.lat, point.lng]}
            radius={7}
            pathOptions={{ color: '#ffffff', fillColor: '#FE5C2B', fillOpacity: 1, weight: 2 }}
          />

          {places.map((place, index) => (
            <CircleMarker
              key={`${place.name}-${index}`}
              center={[place.lat, place.lng]}
              radius={4}
              pathOptions={{ color: '#525252', fillColor: '#737373', fillOpacity: 0.85, weight: 1 }}
            />
          ))}
        </MapContainer>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        Raio analisado: <span className="font-bold text-gray-800">{formatRadius(Math.max(100, Number(radiusMeters) || 800))}</span>
      </p>
    </motion.div>
  );
}

function RadiusRadarCard({ title, radiusMeters, places = [] }) {
  const baseRadius = Math.max(Number(radiusMeters) || 800, 1);
  const dots = places.slice(0, 4).map((place, idx) => {
    const distanceMeters = toMeters(place.distanceLabel);
    const normalized = Math.min(distanceMeters / baseRadius, 1);
    const ringRadius = 28 + normalized * 70;
    const angle = (idx / Math.max(places.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...place,
      x: 110 + Math.cos(angle) * ringRadius,
      y: 110 + Math.sin(angle) * ringRadius
    };
  });

  return (
    <motion.div layout className="rounded-[20px] bg-white border border-gray-200/70 p-4 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-15px_rgba(0,0,0,0.1)]">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gray-400 font-bold">
        <Building2 size={14} className="text-brand-orange" />
        {title}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <svg viewBox="0 0 220 220" className="h-[160px] w-[160px] shrink-0">
          <circle cx="110" cy="110" r="84" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
          <circle cx="110" cy="110" r="58" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
          <circle cx="110" cy="110" r="32" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
          <circle cx="110" cy="110" r="9" fill="rgba(254,92,43,0.9)">
            <animate attributeName="r" values="9;11;9" dur="2.2s" repeatCount="indefinite" />
          </circle>
          {dots.map((dot, idx) => (
            <g key={`${dot.name}-${idx}`}>
              <line x1="110" y1="110" x2={dot.x} y2={dot.y} stroke="rgba(254,92,43,0.30)" strokeWidth="1" />
              <circle cx={dot.x} cy={dot.y} r="4" fill="#FE5C2B" />
            </g>
          ))}
        </svg>

        <div className="min-w-0">
          <p className="text-sm text-gray-700">Raio analisado: <span className="font-bold text-gray-900">{formatRadius(baseRadius)}</span></p>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            Representação visual dos locais aderentes ao segmento mais próximos deste ponto.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function toMeters(distanceLabel) {
  if (!distanceLabel) return 0;
  const source = String(distanceLabel).replace(',', '.').toLowerCase();
  const numeric = Number.parseFloat(source);
  if (!Number.isFinite(numeric)) return 0;
  if (source.includes('km')) return numeric * 1000;
  return numeric;
}

function formatRadius(radiusMeters) {
  if (radiusMeters >= 1000) {
    return `${(radiusMeters / 1000).toFixed(1).replace('.', ',')} km`;
  }
  return `${Math.round(radiusMeters)} m`;
}

function EditableText({ editMode, value, onChange, className, multiline = false }) {
  if (!editMode) {
    return <div className={className}>{value}</div>;
  }

  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className={`${className} w-full rounded-lg border border-brand-orange/35 bg-white px-2 py-2 outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange/30`}
      />
    );
  }

  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${className} w-full rounded-lg border border-brand-orange/35 bg-white px-2 py-2 outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange/30`}
    />
  );
}