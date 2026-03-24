import AutoArgumentGenerator from './AutoArgumentGenerator';

export default function ProposalBuilder({
  clientName,
  city,
  points,
  totals,
  strategicText,
  simulationSummary,
  onGenerate
}) {
  const formatCurrency = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
  const formatNumber = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-2">Revisao da proposta</h3>
        <p className="text-sm text-brand-gray-300">Cliente: <strong>{clientName || 'Nao informado'}</strong></p>
        <p className="text-sm text-brand-gray-300">Cidade/praca: <strong>{city || 'Multiplas pracas'}</strong></p>
        <p className="text-sm text-brand-gray-300">Pontos selecionados: <strong>{points.length}</strong></p>
      </section>

      <section className="rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] border-b border-white/10">
            <tr>
              <th className="text-left px-3 py-2">Ponto</th>
              <th className="text-left px-3 py-2 hidden lg:table-cell">Simulação</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Cidade</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Tipo</th>
              <th className="text-right px-3 py-2">Valor</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id} className="border-b border-white/5">
                <td className="px-3 py-2">{p.nome}</td>
                <td className="px-3 py-2 hidden lg:table-cell">
                  {p.proposalSimulationPreview || p.simulacao_preview ? (
                    <img
                      src={p.proposalSimulationPreview || p.simulacao_preview}
                      alt={`Simulação ${p.nome}`}
                      className="w-20 h-12 rounded object-cover border border-white/10"
                    />
                  ) : (
                    <span className="text-xs text-brand-gray-500">{p.proposalSimulationStatus || 'Sem simulação'}</span>
                  )}
                </td>
                <td className="px-3 py-2 hidden md:table-cell text-brand-gray-400">{p.cidade}</td>
                <td className="px-3 py-2 hidden md:table-cell text-brand-gray-400">{p.tipo}</td>
                <td className="px-3 py-2 text-right text-brand-orange font-semibold">{formatCurrency(p.preco)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {simulationSummary && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-2">Simulação da campanha</h3>
          <p className="text-sm text-brand-gray-300">{simulationSummary}</p>
        </section>
      )}

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Valor total" value={formatCurrency(totals.valorTotal)} />
        <Stat label="Fluxo total" value={formatNumber(totals.fluxoTotal)} />
        <Stat label="CPM estimado" value={`R$ ${totals.cpmEstimado.toFixed(2)}`} />
        <Stat label="Insercoes totais" value={formatNumber(totals.insercoesTotal)} />
      </section>

      <AutoArgumentGenerator argumentsList={strategicText} />

      <button
        onClick={onGenerate}
        className="w-full h-11 rounded-xl bg-brand-orange text-white font-semibold hover:bg-brand-orange-hover"
      >
        Gerar proposta
      </button>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-wide text-brand-gray-500">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
