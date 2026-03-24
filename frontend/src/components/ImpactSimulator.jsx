import { Wand2 } from 'lucide-react';

export default function ImpactSimulator({ points = [], onAdd }) {
  const sorted = [...points]
    .sort((a, b) => (Number(b.fluxo) || 0) - (Number(a.fluxo) || 0))
    .slice(0, 2);

  const extraFluxo = sorted.reduce((sum, p) => sum + (Number(p.fluxo) || 0), 0);
  const extraValor = sorted.reduce((sum, p) => sum + (Number(p.preco) || 0), 0);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Wand2 size={16} className="text-brand-orange" />
        <h3 className="text-sm font-semibold uppercase tracking-wider">Impact Simulator</h3>
      </div>

      {!sorted.length ? (
        <p className="text-sm text-brand-gray-500">Sem sugestao no momento. Ajuste filtros para simular impacto adicional.</p>
      ) : (
        <>
          <p className="text-sm text-brand-gray-300 mb-3">
            Com mais {sorted.length} pontos de alto fluxo, sua campanha adiciona aproximadamente
            {' '}<strong>{new Intl.NumberFormat('pt-BR').format(extraFluxo)}</strong> impactos/mensais.
          </p>
          <p className="text-xs text-brand-gray-500 mb-3">
            Investimento adicional estimado: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(extraValor)}
          </p>
          <button
            onClick={() => onAdd?.(sorted)}
            className="px-3 py-2 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-hover"
          >
            Adicionar sugestao de upsell
          </button>
        </>
      )}
    </section>
  );
}
