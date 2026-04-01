import { memo } from 'react';
import { Clock3 } from 'lucide-react';

const RecommendationEngine = memo(function RecommendationEngine({ history = [], onApplyCombo, isDark = true }) {
  const combos = history
    .filter((item) => item.type === 'combo')
    .slice(-4)
    .reverse();

  return (
    <section className={`rounded-2xl border p-5 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-neutral-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Clock3 size={16} className="text-brand-orange" />
        <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? '' : 'text-neutral-800'}`}>Historico e recomendacoes futuras</h3>
      </div>

      {!combos.length && (
        <p className={`text-sm ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Sem historico ainda. Ao montar planos, exibiremos combinacoes populares e recomendadas.</p>
      )}

      <div className="space-y-2">
        {combos.map((combo) => (
          <div key={combo.id} className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
            <div>
              <div className={`text-sm ${isDark ? 'text-white' : 'text-neutral-800'}`}>{combo.label || 'Combinacao popular'}</div>
              <div className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{combo.points?.length || 0} pontos • {combo.city || 'multiplas pracas'}</div>
            </div>
            <button
              onClick={() => onApplyCombo?.(combo.points || [])}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${isDark ? 'border-white/15 bg-white/[0.04] hover:bg-white/[0.08]' : 'border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700'}`}
            >
              Aplicar
            </button>
          </div>
        ))}
      </div>
    </section>
  );
});

export default RecommendationEngine;
