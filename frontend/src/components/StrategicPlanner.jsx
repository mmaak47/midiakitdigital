import { useMemo, useState } from 'react';
import { Sparkles, PlusCircle, Target } from 'lucide-react';
import { SEGMENTOS, OBJETIVOS, suggestIdealPlan } from '../lib/strategy';

export default function StrategicPlanner({ pontos = [], publicos = [], cidades = [], onAddPlan }) {
  const [form, setForm] = useState({
    segmento: 'clinica',
    objetivo: 'reconhecimento de marca',
    cidade: '',
    publico: '',
    investimentoMensal: 12000
  });

  const suggestion = useMemo(() => suggestIdealPlan({
    pontos,
    cidade: form.cidade,
    publico: form.publico,
    objetivo: form.objetivo,
    investimentoMensal: form.investimentoMensal
  }), [pontos, form]);

  const totals = suggestion.totals;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-brand-orange" />
        <h2 className="text-sm font-semibold uppercase tracking-wider">Sugestao de plano ideal</h2>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
        <SelectField label="Segmento" value={form.segmento} onChange={(v) => setForm((s) => ({ ...s, segmento: v }))} options={SEGMENTOS} />
        <SelectField label="Objetivo" value={form.objetivo} onChange={(v) => setForm((s) => ({ ...s, objetivo: v }))} options={OBJETIVOS} />
        <SelectField label="Praca" value={form.cidade} onChange={(v) => setForm((s) => ({ ...s, cidade: v }))} options={['', ...cidades]} emptyLabel="Todas" />
        <SelectField label="Publico" value={form.publico} onChange={(v) => setForm((s) => ({ ...s, publico: v }))} options={['', ...publicos]} emptyLabel="Todos" />
        <div>
          <label className="text-[11px] uppercase tracking-wide text-brand-gray-500">Investimento mensal</label>
          <input
            type="number"
            min={0}
            step={500}
            value={form.investimentoMensal}
            onChange={(e) => setForm((s) => ({ ...s, investimentoMensal: Number(e.target.value) || 0 }))}
            className="mt-1 w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-orange/40"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-start">
        <div>
          <p className="text-sm text-brand-gray-300 mb-3">{suggestion.justificativa}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {suggestion.pontos.slice(0, 8).map((p) => (
              <span key={p.id} className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-brand-gray-300">
                {p.nome}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <Metric label="Pontos" value={totals.quantidade} />
            <Metric label="Valor total" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.valorTotal)} />
            <Metric label="Fluxo total" value={new Intl.NumberFormat('pt-BR').format(totals.fluxoTotal)} />
            <Metric label="CPM estimado" value={`R$ ${totals.cpmEstimado.toFixed(2)}`} />
          </div>
        </div>

        <button
          onClick={() => onAddPlan?.(suggestion.pontos)}
          disabled={!suggestion.pontos.length}
          className="inline-flex items-center justify-center gap-2 h-11 px-4 bg-brand-orange text-white text-sm font-semibold rounded-xl hover:bg-brand-orange-hover transition-colors disabled:opacity-60"
        >
          <PlusCircle size={16} />
          Adicionar este plano a proposta
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-brand-gray-500">
        <Target size={13} className="text-brand-orange" />
        Recomendacao automatica com base em objetivo, publico e faixa de investimento.
      </div>
    </section>
  );
}

function SelectField({ label, value, onChange, options, emptyLabel }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wide text-brand-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-orange/40"
      >
        {options.map((opt) => (
          <option key={opt || '__empty'} value={opt}>{opt || emptyLabel || 'Selecione'}</option>
        ))}
      </select>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
      <div className="text-[10px] uppercase tracking-wide text-brand-gray-500">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
