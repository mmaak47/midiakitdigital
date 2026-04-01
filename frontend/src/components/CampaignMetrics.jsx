import { memo } from 'react';
import { TrendingUp, CircleDollarSign, BarChart3, Layers } from 'lucide-react';

const CampaignMetrics = memo(function CampaignMetrics({ totals, isDark = true }) {
  if (!totals) return null;

  const formatCurrency = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
  const formatNumber = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);

  const cards = [
    { icon: TrendingUp, label: 'Fluxo total estimado', value: formatNumber(totals.fluxoTotal) },
    { icon: CircleDollarSign, label: 'Valor mensal total', value: formatCurrency(totals.valorTotal) },
    { icon: BarChart3, label: 'CPM estimado', value: `R$ ${totals.cpmEstimado.toFixed(2)}` },
    { icon: Layers, label: 'Custo por ponto', value: formatCurrency(totals.custoPorPonto) },
    { icon: TrendingUp, label: 'Media de fluxo por ponto', value: formatNumber(totals.mediaFluxoPorPonto) },
  ];

  return (
    <section className={`rounded-2xl border p-6 shadow-lg ${isDark ? 'border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] shadow-black/20' : 'border-neutral-200 bg-white shadow-neutral-200/50'}`}>
      <h3 className={`text-sm font-bold uppercase tracking-wider mb-5 flex items-center gap-2 ${isDark ? 'text-white' : 'text-neutral-800'}`}>
        📊 Metricas de eficiencia comercial
      </h3>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={`group rounded-xl border p-4 shadow-md hover:border-brand-orange/20 transition-all duration-300 ${isDark ? 'border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] shadow-black/10 hover:from-white/[0.08] hover:to-white/[0.02]' : 'border-neutral-200 bg-neutral-50 shadow-neutral-200/30 hover:bg-neutral-100'}`}>
            <card.icon size={18} className="text-brand-orange mb-2 group-hover:scale-110 transition-transform" />
            <div className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{card.label}</div>
            <div className={`text-lg font-bold mt-2 ${isDark ? 'text-white' : 'text-neutral-800'}`}>{card.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
});

export default CampaignMetrics;
