import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getSegmentDisplayName } from '../lib/strategy';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const formatNumber = (value) => new Intl.NumberFormat('pt-BR').format(Number(value) || 0);

function coverImage(points) {
  return points.find((p) => p.proposalSimulationPreview || p.simulacao_preview || p.imagem)?.proposalSimulationPreview
    || points.find((p) => p.proposalSimulationPreview || p.simulacao_preview || p.imagem)?.simulacao_preview
    || points.find((p) => p.proposalSimulationPreview || p.simulacao_preview || p.imagem)?.imagem
    || '/hero-bg.jpg';
}

export default function QuickPresentationMode({ points = [], totals = {}, segmento = '', clientName = '', pricingSummary, onClose }) {
  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const slides = useMemo(() => {
    const cpm = Number(totals?.cpmEstimado) || 0;
    const originalTotal = pricingSummary?.originalTotal ?? totals?.valorTotal ?? 0;
    const finalTotal = pricingSummary?.finalTotal ?? totals?.valorTotal ?? 0;

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
      image: coverImage(points)
    };

    const pointSlides = points.map((point) => ({
      key: `point-${point.id}`,
      title: point.nome || 'Ponto',
      subtitle: `${point.cidade || '-'} • ${point.tipo || '-'}`,
      metrics: [
        { label: 'Fluxo', value: `${formatNumber(point.fluxo || 0)}/mês` },
        { label: 'Inserções', value: `Mínimo de ${formatNumber(point.insercoes || 0)}` },
        { label: 'Telas', value: formatNumber(point.telas || 0) },
        { label: 'Valor Negociado', value: formatCurrency(point.preco || 0) }
      ],
      image: point.proposalSimulationPreview || point.simulacao_preview || point.imagem || coverImage(points)
    }));

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

  if (!slides.length) return null;
  const active = slides[index];

  return (
    <div className="fixed inset-0 z-[80] bg-black text-white">
      <AnimatePresence mode="wait">
        <motion.section
          key={active.key}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.99 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <img src={active.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(0,0,0,0.92)_8%,rgba(0,0,0,0.75)_44%,rgba(0,0,0,0.58)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(254,92,43,0.23),transparent_36%)]" />

          <div className="relative z-[1] flex h-full flex-col px-8 py-8 md:px-14 md:py-12">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src="/logo-deitado.png" alt="Intermidia" className="h-9 w-auto opacity-95" />
                <span className="rounded-full border border-brand-orange/35 bg-brand-orange/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-orange">
                  Pitch rápido
                </span>
              </div>
              <button onClick={onClose} className="rounded-full border border-white/20 bg-black/35 p-2 text-white/70 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="mt-12 max-w-5xl">
              <h2 className="text-4xl font-extrabold leading-[0.95] md:text-6xl">{active.title}</h2>
              <p className="mt-4 text-lg text-white/80 md:text-2xl">{active.subtitle}</p>
            </div>

            <div className="mt-auto grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {active.metrics.map((metric) => (
                <div key={metric.label} className="rounded-3xl border border-white/20 bg-white/[0.08] px-5 py-5 backdrop-blur-sm">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-white/65">{metric.label}</div>
                  <div className="mt-2 text-3xl font-bold md:text-4xl">{metric.value}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.section>
      </AnimatePresence>

      <div className="absolute bottom-4 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/20 bg-black/45 px-3 py-2 backdrop-blur">
        <button onClick={() => setIndex((current) => Math.max(0, current - 1))} className="rounded-full p-1 text-white/70 hover:text-white" aria-label="Anterior">
          <ChevronLeft size={18} />
        </button>
        <span className="text-xs uppercase tracking-[0.14em] text-white/70">{index + 1}/{slides.length}</span>
        <button onClick={() => setIndex((current) => Math.min(slides.length - 1, current + 1))} className="rounded-full p-1 text-white/70 hover:text-white" aria-label="Próximo">
          <ChevronRight size={18} />
        </button>
        <button onClick={() => setAutoplay((current) => !current)} className="rounded-full border border-white/20 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-white/70 hover:text-white">
          {autoplay ? 'Auto' : 'Manual'}
        </button>
      </div>
    </div>
  );
}
