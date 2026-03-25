import { ChevronLeft, ChevronRight, Monitor, Presentation, Target, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function PresentationMode({ points = [], totals, onClose }) {
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

  if (!points.length) return null;

  const mediaUrl = current.proposalSimulationPreview || current.simulacao_preview || current.imagem;
  const completion = Math.round(((index + 1) / points.length) * 100);

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white p-4 md:p-8 overflow-y-auto">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-orange/15 border border-brand-orange/30 flex items-center justify-center">
              <Presentation size={18} className="text-brand-orange" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Modo apresentação comercial</h2>
              <p className="text-xs text-brand-gray-400">Navegue ponto a ponto com contexto estratégico e visual principal</p>
            </div>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/20 text-sm hover:bg-white/10">Fechar</button>
        </div>

        <div className="grid xl:grid-cols-[1fr_360px] gap-5">
          <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-4 md:p-5 min-h-[580px] flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-brand-gray-500">Ponto {index + 1} de {points.length}</p>
                <h3 className="text-2xl md:text-3xl font-bold mt-1">{current.nome}</h3>
                <p className="text-brand-gray-400 mt-1">{current.cidade} • {current.tipo}</p>
              </div>
              <div className="min-w-[170px]">
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-orange" style={{ width: `${completion}%` }} />
                </div>
                <p className="text-[11px] text-brand-gray-500 mt-1 text-right">{completion}% da apresentação</p>
              </div>
            </div>

            <div className="flex-1 rounded-xl border border-white/10 bg-black/35 overflow-hidden min-h-[300px]">
              {mediaUrl ? (
                <img
                  src={mediaUrl}
                  alt={current.nome}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-brand-gray-500">
                  <Monitor size={28} />
                  <p className="text-sm mt-2">Sem imagem/simulação para este ponto</p>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-3 mt-4">
              <MetricCard icon={Target} label="Investimento" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(current.preco || 0)} />
              <MetricCard icon={TrendingUp} label="Fluxo mensal" value={new Intl.NumberFormat('pt-BR').format(current.fluxo || 0)} />
              <MetricCard icon={Monitor} label="Telas" value={new Intl.NumberFormat('pt-BR').format(current.telas || 0)} />
            </div>

            <p className="text-sm text-brand-gray-300 mt-3">{current.endereco || 'Endereço não informado'}</p>
          </section>

          <section className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-brand-gray-500 mb-2 uppercase tracking-wide">Resumo geral da proposta</div>
              <div className="text-sm">Valor total: <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.valorTotal || 0)}</strong></div>
              <div className="text-sm">Fluxo total: <strong>{new Intl.NumberFormat('pt-BR').format(totals.fluxoTotal || 0)}</strong></div>
              <div className="text-sm">CPM: <strong>R$ {(totals.cpmEstimado || 0).toFixed(2)}</strong></div>
              <div className="text-sm">Inserções: <strong>{new Intl.NumberFormat('pt-BR').format(totals.insercoesTotal || 0)}</strong></div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between gap-3">
              <button onClick={() => setIndex((i) => Math.max(0, i - 1))} className="h-10 w-10 rounded-lg border border-white/15 flex items-center justify-center disabled:opacity-40" disabled={index === 0}>
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-brand-gray-400">Use ← → para navegar</span>
              <button onClick={() => setIndex((i) => Math.min(points.length - 1, i + 1))} className="h-10 w-10 rounded-lg border border-white/15 flex items-center justify-center disabled:opacity-40" disabled={index === points.length - 1}>
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2 max-h-[360px] overflow-y-auto">
              {points.map((point, idx) => {
                const thumb = point.proposalSimulationPreview || point.simulacao_preview || point.imagem;
                const active = idx === index;
                return (
                  <button
                    key={point.id}
                    type="button"
                    onClick={() => setIndex(idx)}
                    className={`w-full text-left rounded-lg border p-2 transition-all ${
                      active ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10 bg-black/20 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex gap-2.5">
                      <div className="w-16 h-12 rounded-md border border-white/10 bg-black/30 overflow-hidden shrink-0">
                        {thumb ? <img src={thumb} alt={point.nome} className="w-full h-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{point.nome}</p>
                        <p className="text-[11px] text-brand-gray-400 truncate">{point.cidade} • {point.tipo}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="text-[10px] uppercase tracking-wide text-brand-gray-500 flex items-center gap-1.5">
        <Icon size={12} />
        {label}
      </div>
      <div className="text-base font-semibold mt-1">{value}</div>
    </div>
  );
}
