import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  MapPinned,
  Monitor,
  Presentation,
  Sparkles,
  Target,
  TrendingUp,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { buildAudienceQualification, buildEntornoSummary, getSegmentDisplayName } from '../lib/strategy';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const formatNumber = (value) => new Intl.NumberFormat('pt-BR').format(value || 0);

export default function PresentationMode({ points = [], totals, segmento, onClose }) {
  const [index, setIndex] = useState(0);
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

  const currentView = useMemo(() => {
    if (!current) return null;
    return {
      mediaUrl: current.proposalSimulationPreview || current.simulacao_preview || current.imagem,
      audience: buildAudienceQualification(current),
      entorno: buildEntornoSummary(current.entornoMetrics, segmento),
      segmentLabel: getSegmentDisplayName(segmento)
    };
  }, [current, segmento]);

  if (!points.length || !current || !currentView) return null;

  const completion = Math.round(((index + 1) / points.length) * 100);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#050505] px-4 py-5 text-white md:px-8 md:py-7">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(254,92,43,0.18),transparent_28%),radial-gradient(circle_at_82%_14%,rgba(255,255,255,0.09),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0))]" />

      <div className="relative mx-auto max-w-[1460px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-orange/30 bg-brand-orange/12 shadow-[0_12px_34px_rgba(254,92,43,0.22)]">
              <Presentation size={18} className="text-brand-orange" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <img src="/logo-deitado.png" alt="Intermidia" className="h-7 w-auto object-contain opacity-95" />
                <span className="rounded-full border border-brand-orange/25 bg-brand-orange/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-orange">
                  Apresentação comercial
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-gray-400">Narrativa visual, qualificação de público e entorno aderente por ponto.</p>
            </div>
          </div>

          <button onClick={onClose} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white">
            Fechar
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <AnimatePresence mode="wait">
            <motion.section
              key={current.id || index}
              initial={{ opacity: 0, y: 18, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.99 }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 md:p-5"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(254,92,43,0.15),transparent_56%)]" />

              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-brand-gray-500">Ponto {index + 1} de {points.length}</p>
                  <h3 className="mt-2 max-w-4xl text-3xl font-bold leading-[0.96] md:text-[42px]">{current.nome}</h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-brand-gray-300">
                    <span>{current.cidade}</span>
                    <span className="text-brand-gray-600">•</span>
                    <span>{current.tipo}</span>
                    <span className="text-brand-gray-600">•</span>
                    <span>{currentView.segmentLabel}</span>
                  </div>
                </div>

                <div className="min-w-[220px] max-w-[280px] rounded-2xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-brand-gray-500">
                    <span>Ritmo da apresentação</span>
                    <span>{completion}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-brand-orange to-[#ff8c64]"
                      initial={{ width: 0 }}
                      animate={{ width: `${completion}%` }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-brand-gray-400">Leitura comercial pensada para reunião com foco em impacto, contexto e aderência.</p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/35 min-h-[420px]">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(254,92,43,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.14))]" />
                    {currentView.mediaUrl ? (
                      <motion.img
                        key={currentView.mediaUrl}
                        src={currentView.mediaUrl}
                        alt={current.nome}
                        initial={{ opacity: 0, scale: 1.04 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                        className="relative z-[1] h-full w-full object-contain"
                      />
                    ) : (
                      <div className="relative z-[1] flex h-full min-h-[420px] flex-col items-center justify-center text-brand-gray-500">
                        <Monitor size={30} />
                        <p className="mt-2 text-sm">Sem imagem ou simulação para este ponto</p>
                      </div>
                    )}

                    <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-brand-gray-300 backdrop-blur-sm">
                      <Sparkles size={12} className="text-brand-orange" />
                      Visual principal da proposta
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <MetricCard icon={Target} label="Investimento" value={formatCurrency(current.preco || 0)} accent="orange" />
                    <MetricCard icon={TrendingUp} label="Fluxo mensal" value={formatNumber(current.fluxo || 0)} accent="white" />
                    <MetricCard icon={Monitor} label="Telas" value={formatNumber(current.telas || 0)} accent="white" />
                    <MetricCard icon={Users} label="Público" value={current.publico || 'A/B'} accent="orange" />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-brand-gray-300">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-brand-gray-500">Endereço</div>
                    <p className="mt-2 text-white">{current.endereco || 'Endereço não informado'}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <InsightCard
                    icon={Users}
                    eyebrow={currentView.audience.badge}
                    title={currentView.audience.headline}
                    description={currentView.audience.summary}
                    items={currentView.audience.bullets}
                  />

                  <InsightCard
                    icon={MapPinned}
                    eyebrow="Entorno aderente"
                    title={currentView.entorno.headline}
                    description={currentView.entorno.summary}
                    items={currentView.entorno.places.map((place) => `${place.name} • ${place.category} • ${place.distanceLabel}`)}
                    emptyMessage="Os locais próximos aparecerão aqui assim que o cache de entorno desse segmento estiver disponível."
                  />
                </div>
              </div>
            </motion.section>
          </AnimatePresence>

          <aside className="space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-brand-gray-500">Resumo geral da proposta</div>
                  <p className="mt-1 text-sm text-brand-gray-400">Indicadores executivos para defesa comercial.</p>
                </div>
                <img src="/logo.png" alt="Intermidia" className="h-9 w-auto object-contain opacity-90" />
              </div>

              <div className="mt-4 grid gap-3">
                <MiniStat label="Valor total" value={formatCurrency(totals.valorTotal || 0)} />
                <MiniStat label="Fluxo total" value={formatNumber(totals.fluxoTotal || 0)} />
                <MiniStat label="CPM estimado" value={`R$ ${(totals.cpmEstimado || 0).toFixed(2).replace('.', ',')}`} />
                <MiniStat label="Inserções" value={formatNumber(totals.insercoesTotal || 0)} />
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <button onClick={() => setIndex((i) => Math.max(0, i - 1))} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 transition-colors hover:bg-white/10 disabled:opacity-40" disabled={index === 0}>
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs uppercase tracking-[0.14em] text-brand-gray-400">Use ← → para navegar</span>
                <button onClick={() => setIndex((i) => Math.min(points.length - 1, i + 1))} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 transition-colors hover:bg-white/10 disabled:opacity-40" disabled={index === points.length - 1}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="max-h-[430px] space-y-2 overflow-y-auto rounded-[24px] border border-white/10 bg-white/[0.03] p-3">
              {points.map((point, idx) => {
                const thumb = point.proposalSimulationPreview || point.simulacao_preview || point.imagem;
                const active = idx === index;
                return (
                  <button
                    key={point.id}
                    type="button"
                    onClick={() => setIndex(idx)}
                    className={`w-full rounded-2xl border p-2.5 text-left transition-all ${
                      active
                        ? 'border-brand-orange bg-brand-orange/10 shadow-[0_14px_36px_rgba(254,92,43,0.16)]'
                        : 'border-white/10 bg-black/20 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="h-14 w-20 overflow-hidden rounded-xl border border-white/10 bg-black/35 shrink-0">
                        {thumb ? <img src={thumb} alt={point.nome} className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white">{point.nome}</p>
                        <p className="mt-1 truncate text-[11px] text-brand-gray-400">{point.cidade} • {point.tipo}</p>
                        <p className="mt-1 text-[11px] text-brand-gray-500">{point.publico || 'A/B'} • {formatCurrency(point.preco || 0)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, accent = 'white' }) {
  const accentClass = accent === 'orange' ? 'text-brand-orange' : 'text-white';

  return (
    <motion.div layout className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-brand-gray-500">
        <Icon size={12} className={accentClass} />
        {label}
      </div>
      <div className="mt-1.5 text-lg font-semibold text-white">{value}</div>
    </motion.div>
  );
}

function InsightCard({ icon: Icon, eyebrow, title, description, items = [], emptyMessage }) {
  const hasItems = items.length > 0;

  return (
    <motion.div layout className="rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-brand-orange/25 bg-brand-orange/12 text-brand-orange">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.14em] text-brand-gray-500">{eyebrow}</div>
          <h4 className="mt-1 text-base font-semibold text-white leading-snug">{title}</h4>
          <p className="mt-2 text-sm leading-relaxed text-brand-gray-300">{description}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {hasItems ? items.map((item) => (
          <div key={item} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-brand-gray-200">
            {item}
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-sm text-brand-gray-500">
            {emptyMessage}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-brand-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}