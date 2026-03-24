import { TrendingUp, CircleDollarSign, BarChart3, Layers } from 'lucide-react';

export default function CampaignMetrics({ totals }) {
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
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Metricas de eficiencia comercial</h3>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <card.icon size={16} className="text-brand-orange mb-2" />
            <div className="text-[11px] uppercase tracking-wide text-brand-gray-500">{card.label}</div>
            <div className="text-lg font-bold text-white mt-1">{card.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
