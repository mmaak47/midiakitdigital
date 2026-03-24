import { Clock3 } from 'lucide-react';

export default function RecommendationEngine({ history = [], onApplyCombo }) {
  const combos = history
    .filter((item) => item.type === 'combo')
    .slice(-4)
    .reverse();

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Clock3 size={16} className="text-brand-orange" />
        <h3 className="text-sm font-semibold uppercase tracking-wider">Historico e recomendacoes futuras</h3>
      </div>

      {!combos.length && (
        <p className="text-sm text-brand-gray-500">Sem historico ainda. Ao montar planos, exibiremos combinacoes populares e recomendadas.</p>
      )}

      <div className="space-y-2">
        {combos.map((combo) => (
          <div key={combo.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-white">{combo.label || 'Combinacao popular'}</div>
              <div className="text-xs text-brand-gray-500">{combo.points?.length || 0} pontos • {combo.city || 'multiplas pracas'}</div>
            </div>
            <button
              onClick={() => onApplyCombo?.(combo.points || [])}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"
            >
              Aplicar
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
