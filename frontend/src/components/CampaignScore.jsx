import { memo } from 'react';
import { Award } from 'lucide-react';

const CampaignScore = memo(function CampaignScore({ scoreInfo, isDark = true }) {
  if (!scoreInfo) return null;

  return (
    <section className={`rounded-2xl border p-6 shadow-lg ${isDark ? 'border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] shadow-black/20' : 'border-neutral-200 bg-white shadow-neutral-200/50'}`}>
      <div className="flex items-center gap-2 mb-4">
        <Award size={18} className="text-brand-orange" />
        <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-neutral-800'}`}>Qualidade da seleção</h3>
      </div>

      <div className="flex items-end gap-3 mb-3">
        <div className="text-5xl font-bold font-heading text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-orange-hover">{scoreInfo.score.toFixed(1)}</div>
        <div className={`text-base font-semibold mb-2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>/ 10</div>
      </div>
      <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
        Quanto maior, melhor o equilíbrio entre alcance, frequência e aderência ao público
      </p>
      <p className={`text-sm leading-relaxed ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{scoreInfo.explanation}</p>
    </section>
  );
});

export default CampaignScore;
