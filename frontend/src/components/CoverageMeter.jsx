import { memo } from 'react';
import { Gauge, Star, TrendingUp, MousePointerClick } from 'lucide-react';

const CoverageMeter = memo(function CoverageMeter({ coverage, selectedCount = 0, inventoryCount = 0, isDark = true }) {
  if (!coverage) return null;

  const isEmpty = (selectedCount || 0) === 0;

  return (
    <section className={`rounded-2xl border p-6 shadow-lg ${isDark ? 'border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] shadow-black/20' : 'border-neutral-200 bg-white shadow-neutral-200/50'}`}>
      <div className="flex items-center gap-2 mb-5">
        <Gauge size={18} className="text-brand-orange" />
        <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-neutral-800'}`}>Camadas de cobertura e presenca</h3>
      </div>

      {isEmpty ? (
        <div className={`rounded-xl border-2 border-dashed p-6 flex flex-col items-center text-center gap-3 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-neutral-50'}`}>
          <div className="w-12 h-12 rounded-full bg-brand-orange/10 flex items-center justify-center">
            <MousePointerClick size={22} className="text-brand-orange" />
          </div>
          <div>
            <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-neutral-800'}`}>Selecione pontos para calcular cobertura</div>
            <p className={`text-xs mt-1 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
              {inventoryCount > 0
                ? `Há ${inventoryCount} ponto${inventoryCount > 1 ? 's' : ''} disponíve${inventoryCount > 1 ? 'is' : 'l'} no inventário desta praça. Adicione aos favoritos para ver % de cobertura, força de presença e nível estratégico.`
                : 'Aplique filtros e adicione pontos aos favoritos para ver as métricas de cobertura.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <ProgressCard title="Cobertura estimada da praca" value={coverage.coveragePct} isDark={isDark} />
            <ProgressCard title="Forca de presenca" value={coverage.presencePct} isDark={isDark} />
          </div>

          <div className="mt-5 rounded-xl border border-brand-orange/30 bg-gradient-to-r from-brand-orange/20 to-brand-orange/5 p-4">
            <div className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-neutral-800'}`}><Star size={14} className="text-brand-orange" /> Nivel: <span className="text-brand-orange">{coverage.nivel}</span></div>
            <p className={`text-xs mt-2 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{coverage.mensagem}</p>
            {coverage.faltamParaProximoNivel > 0 && (
              <p className={`text-xs mt-2 font-medium flex items-center gap-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}><TrendingUp size={12} className="text-brand-orange" /> +{coverage.faltamParaProximoNivel} ponto{coverage.faltamParaProximoNivel > 1 ? 's' : ''} = próximo nível</p>
            )}
          </div>
        </>
      )}
    </section>
  );
});

const ProgressCard = memo(function ProgressCard({ title, value, isDark = true }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={`rounded-xl border p-4 shadow-md ${isDark ? 'border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] shadow-black/10' : 'border-neutral-200 bg-neutral-50 shadow-neutral-200/30'}`}>
      <div className={`text-xs mb-3 font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{title}</div>
      <div className={`h-2.5 rounded-full overflow-hidden mb-3 shadow-inner ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}>
        <div className="h-full bg-gradient-to-r from-brand-orange to-brand-orange-hover shadow-lg shadow-brand-orange/50 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-neutral-800'}`}>{pct.toFixed(1)}<span className={`text-xs font-medium ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>%</span></div>
    </div>
  );
});

export default CoverageMeter;
