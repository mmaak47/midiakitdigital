import { memo } from 'react';
import { Wand2 } from 'lucide-react';

const ImpactSimulator = memo(function ImpactSimulator({ points = [], onAdd, isDark = true }) {
  const sorted = [...points]
    .sort((a, b) => (Number(b.fluxo) || 0) - (Number(a.fluxo) || 0))
    .slice(0, 2);

  const extraFluxo = sorted.reduce((sum, p) => sum + (Number(p.fluxo) || 0), 0);
  const extraValor = sorted.reduce((sum, p) => sum + (Number(p.preco) || 0), 0);

  return (
    <section className={`rounded-2xl border p-5 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-neutral-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Wand2 size={16} className="text-brand-orange" />
        <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? '' : 'text-neutral-800'}`}>Impact Simulator</h3>
      </div>

      {!sorted.length ? (
        <p className={`text-sm ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Sem sugestao no momento. Ajuste filtros para simular impacto adicional.</p>
      ) : (
        <>
          <p className={`text-sm mb-3 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
            Com mais {sorted.length} pontos de alto fluxo, sua campanha adiciona aproximadamente
            {' '}<strong>{new Intl.NumberFormat('pt-BR').format(extraFluxo)}</strong> impactos/mensais.
          </p>
          <p className={`text-xs mb-3 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
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
});

export default ImpactSimulator;
