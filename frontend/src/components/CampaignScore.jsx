import { memo } from 'react';
import { Award, BarChart3, Crosshair, Radio, RefreshCw, CircleDollarSign, Map } from 'lucide-react';

const PILAR_META = {
  qualidade: { label: 'Qualidade dos Pontos', Icon: Crosshair },
  alcance: { label: 'Alcance', Icon: Radio },
  frequencia: { label: 'Frequência', Icon: RefreshCw },
  eficiencia: { label: 'Eficiência de Custo', Icon: CircleDollarSign },
  cobertura: { label: 'Cobertura Estratégica', Icon: Map },
};

function PilarBar({ label, Icon, value, isDark }) {
  const pct = Math.max(0, Math.min(100, value * 10));
  const color = value >= 7.5 ? 'bg-emerald-500' : value >= 5 ? 'bg-brand-orange' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-4 text-center flex items-center justify-center"><Icon size={12} className="text-brand-orange" /></span>
      <span className={`w-[7rem] truncate ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{label}</span>
      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}>
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-7 text-right tabular-nums font-medium ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{value.toFixed(1)}</span>
    </div>
  );
}

const CampaignScore = memo(function CampaignScore({ scoreInfo, isDark = true }) {
  if (!scoreInfo) return null;

  const breakdown = scoreInfo.breakdown;

  return (
    <section className={`rounded-2xl border p-6 shadow-lg ${isDark ? 'border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] shadow-black/20' : 'border-neutral-200 bg-white shadow-neutral-200/50'}`}>
      <div className="flex items-center gap-2 mb-4">
        <Award size={18} className="text-brand-orange" />
        <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-neutral-800'}`}>Qualidade da campanha</h3>
      </div>

      <div className="flex items-end gap-3 mb-3">
        <div className="text-5xl font-bold font-heading text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-orange-hover">{scoreInfo.score.toFixed(1)}</div>
        <div className={`text-base font-semibold mb-2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>/ 10</div>
      </div>
      <p className={`mb-4 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
        Quanto maior, melhor o equilíbrio entre alcance, frequência e aderência ao público
      </p>

      {breakdown && (
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 size={12} className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Pilares da avaliação</span>
          </div>
          {Object.entries(PILAR_META).map(([key, meta]) => (
            breakdown[key] != null && (
              <PilarBar
                key={key}
                label={meta.label}
                Icon={meta.Icon}
                value={breakdown[key]}
                isDark={isDark}
              />
            )
          ))}
        </div>
      )}

      <p className={`text-sm leading-relaxed ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{scoreInfo.explanation}</p>
    </section>
  );
});

export default CampaignScore;
