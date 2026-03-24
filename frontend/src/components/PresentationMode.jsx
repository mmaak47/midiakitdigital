import { ChevronLeft, ChevronRight, Presentation } from 'lucide-react';
import { useState } from 'react';

export default function PresentationMode({ points = [], totals, onClose }) {
  const [index, setIndex] = useState(0);
  const current = points[index];

  if (!points.length) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white p-6 md:p-10 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Presentation size={18} className="text-brand-orange" />
            <h2 className="text-lg font-semibold">Modo apresentacao</h2>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/20 text-sm">Fechar</button>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 min-h-[420px]">
            <div className="text-xs uppercase tracking-wide text-brand-gray-500 mb-2">Ponto {index + 1} de {points.length}</div>
            <h3 className="text-3xl font-bold mb-2">{current.nome}</h3>
            <p className="text-brand-gray-400 mb-4">{current.cidade} • {current.tipo}</p>
            {(current.proposalSimulationPreview || current.simulacao_preview || current.imagem) && (
              <img
                src={current.proposalSimulationPreview || current.simulacao_preview || current.imagem}
                alt={current.nome}
                className="w-full max-h-[360px] object-cover rounded-xl border border-white/10"
              />
            )}
            <p className="text-sm text-brand-gray-300 mt-4">{current.endereco}</p>
          </section>

          <section className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-brand-gray-500 mb-1">Resumo geral</div>
              <div className="text-sm">Valor total: <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.valorTotal)}</strong></div>
              <div className="text-sm">Fluxo total: <strong>{new Intl.NumberFormat('pt-BR').format(totals.fluxoTotal)}</strong></div>
              <div className="text-sm">CPM: <strong>R$ {totals.cpmEstimado.toFixed(2)}</strong></div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between gap-3">
              <button onClick={() => setIndex((i) => Math.max(0, i - 1))} className="h-10 w-10 rounded-lg border border-white/15 flex items-center justify-center disabled:opacity-40" disabled={index === 0}>
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setIndex((i) => Math.min(points.length - 1, i + 1))} className="h-10 w-10 rounded-lg border border-white/15 flex items-center justify-center disabled:opacity-40" disabled={index === points.length - 1}>
                <ChevronRight size={16} />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
