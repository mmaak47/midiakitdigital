import { Gauge } from 'lucide-react';

export default function CoverageMeter({ coverage }) {
  if (!coverage) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-6 shadow-lg shadow-black/20">
      <div className="flex items-center gap-2 mb-5">
        <Gauge size={18} className="text-brand-orange" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-white">Camadas de cobertura e presenca</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ProgressCard title="Cobertura estimada da praca" value={coverage.coveragePct} />
        <ProgressCard title="Forca de presenca" value={coverage.presencePct} />
      </div>

      <div className="mt-5 rounded-xl border border-brand-orange/30 bg-gradient-to-r from-brand-orange/20 to-brand-orange/5 p-4">
        <div className="text-sm font-bold text-white flex items-center gap-2">⭐ Nivel: <span className="text-brand-orange">{coverage.nivel}</span></div>
        <p className="text-xs text-brand-gray-300 mt-2">{coverage.mensagem}</p>
        {coverage.faltamParaProximoNivel > 0 && (
          <p className="text-xs text-brand-gray-400 mt-2 font-medium">📈 +{coverage.faltamParaProximoNivel} ponto{coverage.faltamParaProximoNivel > 1 ? 's' : ''} = próximo nível</p>
        )}
      </div>
    </section>
  );
}

function ProgressCard({ title, value }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-4 shadow-md shadow-black/10">
      <div className="text-xs text-brand-gray-400 mb-3 font-semibold uppercase tracking-wide">{title}</div>
      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden mb-3 shadow-inner">
        <div className="h-full bg-gradient-to-r from-brand-orange to-brand-orange-hover shadow-lg shadow-brand-orange/50 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-2xl font-bold text-white">{pct.toFixed(1)}<span className="text-xs text-brand-gray-500 font-medium">%</span></div>
    </div>
  );
}
