import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getSegmentDisplayName } from '../lib/strategy';
import { getPrimaryPointScreenImage } from '../lib/pointImages';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const formatNumber = (value) => new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
const formatCostPerImpact = (value) => {
  const numeric = Number(value) || 0;
  if (!Number.isFinite(numeric) || numeric <= 0) return '-';
  if (numeric < 0.01) return `R$ ${numeric.toFixed(4).replace('.', ',')}`;
  return `R$ ${numeric.toFixed(2).replace('.', ',')}`;
};

function coverImage(points) {
  return points.find((p) => p.proposalSimulationPreview || p.simulacao_preview || getPrimaryPointScreenImage(p))?.proposalSimulationPreview
    || points.find((p) => p.proposalSimulationPreview || p.simulacao_preview || getPrimaryPointScreenImage(p))?.simulacao_preview
    || getPrimaryPointScreenImage(points.find((p) => p.proposalSimulationPreview || p.simulacao_preview || getPrimaryPointScreenImage(p)))
    || '/hero-bg.jpg';
}

export default function QuickPresentationMode({ points = [], totals = {}, segmento = '', clientName = '', pricingSummary, onClose }) {
  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [extraMetricIndex, setExtraMetricIndex] = useState(0);
  const slides = useMemo(() => {
    const cpm = Number(totals?.cpmEstimado) || 0;
    const originalTotal = pricingSummary?.originalTotal ?? totals?.valorTotal ?? 0;
    const finalTotal = pricingSummary?.finalTotal ?? totals?.valorTotal ?? 0;
    const ticketMedio = points.length ? finalTotal / points.length : 0;
    const custoPorImpacto = (Number(totals?.fluxoTotal) || 0) > 0 ? finalTotal / Number(totals.fluxoTotal) : 0;
    const pontosComEntorno = points.filter((point) => Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) > 0).length;

    const intro = {
      key: 'intro',
      title: clientName || 'Proposta Comercial',
      subtitle: `${getSegmentDisplayName(segmento)} • ${points.length} pontos estratégicos`,
      metrics: [
        { label: 'Fluxo total', value: formatNumber(totals?.fluxoTotal || 0) },
        { label: 'Valor Tabela', value: formatCurrency(originalTotal) },
        { label: 'Valor Negociado', value: formatCurrency(finalTotal) },
        { label: 'CPM', value: `R$ ${cpm.toFixed(2).replace('.', ',')}` }
      ],
      extraMetrics: [
        { label: 'Ticket médio', value: formatCurrency(ticketMedio) },
        { label: 'Custo por impacto', value: formatCostPerImpact(custoPorImpacto) },
        { label: 'Pontos com entorno', value: `${formatNumber(pontosComEntorno)} de ${formatNumber(points.length)}` },
        { label: 'Inserções totais', value: `Mínimo de ${formatNumber(totals?.insercoesTotal || 0)}` }
      ],
      image: coverImage(points)
    };

    const pointSlides = points.map((point) => {
      const scoreEntorno = Number(point?.entornoMetrics?.score_relevancia) || 0;
      const totalLocais = Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;
      const coords = Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng))
        ? `${Number(point.lat).toFixed(4)}, ${Number(point.lng).toFixed(4)}`
        : 'Não informado';

      return {
        key: `point-${point.id}`,
        title: point.nome || 'Ponto',
        subtitle: `${point.cidade || '-'} • ${point.tipo || '-'}`,
        metrics: [
          { label: 'Fluxo', value: `${formatNumber(point.fluxo || 0)}/mês` },
          { label: 'Inserções', value: `Mínimo de ${formatNumber(point.insercoes || 0)}` },
          { label: 'Pontos de Impacto', value: formatNumber(point.telas || 0) },
          { label: 'Valor Negociado', value: formatCurrency(point.preco || 0) }
        ],
        extraMetrics: [
          { label: 'Score do entorno', value: scoreEntorno ? scoreEntorno.toFixed(1).replace('.', ',') : '0,0' },
          { label: 'Locais aderentes', value: formatNumber(totalLocais) },
          { label: 'Público', value: point.publico || 'A/B' },
          { label: 'Coordenadas', value: coords }
        ],
        image: point.proposalSimulationPreview || point.simulacao_preview || getPrimaryPointScreenImage(point) || coverImage(points)
      };
    });

    return [intro, ...pointSlides];
  }, [points, totals, segmento, clientName, pricingSummary]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowRight') setIndex((current) => Math.min(slides.length - 1, current + 1));
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1));
      if (event.key === ' ') {
        event.preventDefault();
        setAutoplay((current) => !current);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length, onClose]);

  useEffect(() => {
    if (!autoplay) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => (current >= slides.length - 1 ? 0 : current + 1));
    }, 5500);
    return () => window.clearInterval(timer);
  }, [autoplay, slides.length]);

  useEffect(() => {
    setExtraMetricIndex(0);
  }, [index]);

  useEffect(() => {
    if (!slides.length) return undefined;
    const activeSlide = slides[index];
    if (!activeSlide?.extraMetrics?.length) return undefined;

    const timer = window.setInterval(() => {
      setExtraMetricIndex((current) => (current >= activeSlide.extraMetrics.length - 1 ? 0 : current + 1));
    }, 1750);

    return () => window.clearInterval(timer);
  }, [slides, index]);

  if (!slides.length) return null;
  const active = slides[index];
  const activeExtraMetric = active.extraMetrics?.[extraMetricIndex % Math.max(active.extraMetrics?.length || 1, 1)];

  return createPortal(
    <div data-theme="dark" className="fixed inset-0 z-[80] overflow-hidden bg-[#05060a] text-white">
      {/* Background statico (imagem do slide atual com overlay forte) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${active.key}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0"
        >
          <img src={active.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {/* Overlay para legibilidade — gradiente sutil, sem manchas que sujam o design */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#05060a]/95 via-[#05060a]/85 to-[#05060a]/70" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_85%_15%,rgba(254,92,43,0.18),transparent_55%)]" />
        </motion.div>
      </AnimatePresence>

      {/* Header fixo (logo + indicador + close) */}
      <div className="absolute top-0 inset-x-0 z-[3] flex items-center justify-between gap-4 px-6 md:px-12 py-5">
        <div className="flex items-center gap-3">
          <img src="/logo-deitado.png" alt="Intermidia" className="h-7 md:h-8 w-auto" />
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full bg-brand-orange px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_8px_24px_rgba(254,92,43,0.35)]">
            Pitch rápido
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white/70 backdrop-blur-sm">
            {index + 1} / {slides.length}
          </span>
          <button onClick={onClose} className="rounded-full border border-white/15 bg-white/[0.06] p-2 text-white/75 hover:bg-white/[0.12] hover:text-white transition-colors backdrop-blur-sm" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Conteúdo do slide */}
      <AnimatePresence mode="wait">
        <motion.section
          key={active.key}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-[2] flex h-full flex-col px-6 md:px-14 pt-24 pb-28 md:pt-28 md:pb-32"
        >
          <div className="mx-auto w-full max-w-6xl flex flex-col flex-1 gap-8">
            {/* Título */}
            <div className="space-y-3">
              <div className="h-1 w-14 rounded-full bg-brand-orange" />
              <h2 className="text-3xl md:text-6xl font-extrabold tracking-tight leading-[0.98] text-white">
                {active.title}
              </h2>
              <p className="text-base md:text-xl text-white/70 max-w-3xl">
                {active.subtitle}
              </p>
            </div>

            {/* Métricas principais — grid limpo, ar entre cards, sem boxes pesados */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {active.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-brand-orange/40 hover:bg-white/[0.06]"
                >
                  <div className="absolute -top-1 left-5 h-[2px] w-8 rounded-full bg-brand-orange opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/50">{metric.label}</div>
                  <div className="mt-2 text-2xl md:text-3xl font-bold leading-tight">{metric.value}</div>
                </div>
              ))}
            </div>

            {/* Métrica em destaque (rotaciona) */}
            {activeExtraMetric ? (
              <div className="mt-auto">
                <div className="inline-flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-sm">
                  <div className="h-10 w-1 rounded-full bg-brand-orange" />
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${active.key}-${activeExtraMetric.label}-${extraMetricIndex}`}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/50">{activeExtraMetric.label}</div>
                      <div className="text-xl md:text-2xl font-bold">{activeExtraMetric.value}</div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            ) : null}
          </div>
        </motion.section>
      </AnimatePresence>

      {/* Footer com navegação + barra de progresso fina */}
      <div className="absolute bottom-0 inset-x-0 z-[3] px-6 md:px-12 pb-5">
        {/* Barra de progresso */}
        <div className="mb-3 h-[2px] w-full bg-white/10 rounded-full overflow-hidden">
          <motion.div
            key={`progress-${index}-${autoplay}`}
            className="h-full bg-brand-orange"
            initial={{ width: `${(index / Math.max(slides.length - 1, 1)) * 100}%` }}
            animate={{ width: `${((index + 1) / slides.length) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => setIndex((c) => Math.max(0, c - 1))}
            disabled={index === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.10] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm"
          >
            <ChevronLeft size={16} />
            Anterior
          </button>

          <button
            onClick={() => setAutoplay((c) => !c)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
              autoplay
                ? 'bg-brand-orange text-white shadow-[0_8px_24px_rgba(254,92,43,0.35)] hover:bg-brand-orange-hover'
                : 'border border-white/20 bg-white/[0.04] text-white/70 hover:bg-white/[0.10] hover:text-white'
            }`}
          >
            {autoplay ? 'Auto • on' : 'Auto • off'}
          </button>

          <button
            onClick={() => setIndex((c) => Math.min(slides.length - 1, c + 1))}
            disabled={index === slides.length - 1}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-orange-hover disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_8px_24px_rgba(254,92,43,0.35)]"
          >
            Próximo
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
