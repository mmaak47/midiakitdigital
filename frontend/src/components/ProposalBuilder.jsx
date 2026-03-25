import AutoArgumentGenerator from './AutoArgumentGenerator';

export default function ProposalBuilder({
  clientName,
  city,
  publico,
  segmento,
  points,
  totals,
  pricingSummary,
  strategicText,
  simulationSummary,
  activePreviewPointId,
  onSelectPreview,
  onGenerate
}) {
  const formatCurrency = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
  const formatNumber = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const pontosComEntorno = points.filter((point) => Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) > 0).length;
  const cityLabel = Array.isArray(city) && city.length ? city.join(', ') : (city || 'Múltiplas praças');
  const publicoLabel = Array.isArray(publico) && publico.length ? publico.join(', ') : (publico || 'Públicos estratégicos');

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.045] to-white/[0.02] p-4 md:p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] mb-3 text-white">Revisão da proposta</h3>
        <div className="grid md:grid-cols-3 gap-2 text-sm text-brand-gray-300">
          <p>Cliente: <strong className="text-white">{clientName || 'Não informado'}</strong></p>
          <p>Cidade/praça: <strong className="text-white">{cityLabel}</strong></p>
          <p>Pontos selecionados: <strong className="text-white">{points.length}</strong></p>
        </div>
        <div className="mt-3 text-sm text-brand-gray-400">
          Segmento considerado: <strong className="text-white">{segmento || 'Não informado'}</strong> • Públicos priorizados: <strong className="text-white">{publicoLabel}</strong> • Pontos com entorno aderente disponível: <strong className="text-white">{pontosComEntorno}</strong>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] border-b border-white/10">
            <tr>
              <th className="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-gray-400">Ponto</th>
              <th className="text-left px-3 py-2.5 hidden lg:table-cell text-[11px] uppercase tracking-[0.12em] text-brand-gray-400">Simulação</th>
              <th className="text-left px-3 py-2.5 hidden md:table-cell text-[11px] uppercase tracking-[0.12em] text-brand-gray-400">Cidade</th>
              <th className="text-left px-3 py-2.5 hidden md:table-cell text-[11px] uppercase tracking-[0.12em] text-brand-gray-400">Tipo</th>
              <th className="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-gray-400">Valor</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                <td className="px-3 py-2.5 font-medium text-white">{p.nome}</td>
                <td className="px-3 py-2.5 hidden lg:table-cell">
                  {p.proposalSimulationPreview || p.simulacao_preview ? (
                    <button
                      type="button"
                      onClick={() => onSelectPreview?.(p.id)}
                      className={`rounded-lg border transition-all ${
                        activePreviewPointId === p.id
                          ? 'border-brand-orange shadow-[0_0_0_1px_rgba(254,92,43,0.45)]'
                          : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <img
                        src={p.proposalSimulationPreview || p.simulacao_preview}
                        alt={`Simulação ${p.nome}`}
                        className="w-24 h-14 rounded-lg object-cover"
                      />
                    </button>
                  ) : (
                    <span className="text-xs text-brand-gray-500">{p.proposalSimulationStatus || 'Sem simulação'}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-brand-gray-400">{p.cidade}</td>
                <td className="px-3 py-2.5 hidden md:table-cell text-brand-gray-400">{p.tipo}</td>
                <td className="px-3 py-2.5 text-right">
                  {p.discountPercent > 0 ? (
                    <div className="space-y-0.5">
                      <div className="text-xs text-brand-gray-500 line-through">{formatCurrency(p.precoOriginal)}</div>
                      <div className="text-brand-orange font-semibold">{formatCurrency(p.precoFinal)}</div>
                      <div className="text-[11px] text-green-300">-{p.discountPercent}%</div>
                    </div>
                  ) : (
                    <span className="text-brand-orange font-semibold">{formatCurrency(p.precoFinal ?? p.preco)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {pricingSummary?.hasDiscount && (
        <section className="grid sm:grid-cols-3 gap-3">
          <Stat label="Tabela cheia" value={formatCurrency(pricingSummary.originalTotal)} />
          <Stat label="Desconto aplicado" value={`- ${formatCurrency(pricingSummary.discountTotal)}`} />
          <Stat label="Total final" value={formatCurrency(pricingSummary.finalTotal)} />
        </section>
      )}

      {simulationSummary && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] mb-2">Simulação da campanha</h3>
          <p className="text-sm text-brand-gray-300">{simulationSummary}</p>
        </section>
      )}

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Valor total" value={formatCurrency(totals.valorTotal)} />
        <Stat label="Fluxo total" value={formatNumber(totals.fluxoTotal)} />
        <Stat label="CPM estimado" value={`R$ ${totals.cpmEstimado.toFixed(2)}`} />
        <Stat label="Ticket médio" value={formatCurrency(totals.ticketMedio)} />
      </section>

      <AutoArgumentGenerator argumentsList={strategicText} />

      <button
        onClick={onGenerate}
        className="w-full h-11 rounded-xl bg-brand-orange text-white font-semibold hover:bg-brand-orange-hover shadow-[0_10px_24px_rgba(254,92,43,0.28)]"
      >
        Gerar proposta
      </button>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-brand-gray-500">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}
