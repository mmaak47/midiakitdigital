import { Gauge } from 'lucide-react';

export default function CoverageMeter({ coverage }) {
  if (!coverage) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Gauge size={16} className="text-brand-orange" />
        <h3 className="text-sm font-semibold uppercase tracking-wider">Camadas de cobertura e presenca</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ProgressCard title="Cobertura estimada da praca" value={coverage.coveragePct} />
        <ProgressCard title="Forca de presenca" value={coverage.presencePct} />
      </div>

      <div className="mt-4 rounded-xl border border-brand-orange/25 bg-brand-orange/10 p-3">
        <div className="text-sm font-semibold text-white">Nivel atual: {coverage.nivel}</div>
        <p className="text-xs text-brand-gray-300 mt-1">{coverage.mensagem}</p>
        {coverage.faltamParaProximoNivel > 0 && (
          <p className="text-xs text-brand-gray-500 mt-1">Com mais {coverage.faltamParaProximoNivel} ponto(s), voce sobe de nivel.</p>
        )}
      </div>
    </section>
  );
}

function ProgressCard({ title, value }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs text-brand-gray-500 mb-2">{title}</div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-2">
        <div className="h-full bg-brand-orange" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-lg font-bold">{pct.toFixed(1)}%</div>
    </div>
  );
}
