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
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-6 shadow-lg shadow-black/20">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={18} className="text-brand-orange" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Sugestao de plano ideal</h2>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4 mb-5">
        <SelectField label="Segmento" value={form.segmento} onChange={(v) => setForm((s) => ({ ...s, segmento: v }))} options={SEGMENTOS} />
        <SelectField label="Objetivo" value={form.objetivo} onChange={(v) => setForm((s) => ({ ...s, objetivo: v }))} options={OBJETIVOS} />
        <SelectField label="Praca" value={form.cidade} onChange={(v) => setForm((s) => ({ ...s, cidade: v }))} options={['', ...cidades]} emptyLabel="Todas" />
        <SelectField label="Publico" value={form.publico} onChange={(v) => setForm((s) => ({ ...s, publico: v }))} options={['', ...publicos]} emptyLabel="Todos" />
        <div>
          <label className="text-[11px] uppercase tracking-wide text-brand-gray-500 font-semibold">Investimento mensal</label>
          <input
            type="number"
            min={0}
            step={500}
            value={form.investimentoMensal}
            onChange={(e) => setForm((s) => ({ ...s, investimentoMensal: Number(e.target.value) || 0 }))}
            className="mt-1 w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-orange/40 transition-colors"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-start">
        <div>
          <p className="text-sm text-brand-gray-300 mb-3">{suggestion.justificativa}</p>
          <div className="flex flex-wrap gap-2.5 mb-4">
            {suggestion.pontos.slice(0, 8).map((p) => (
              <span key={p.id} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-orange/15 to-brand-orange/5 border border-brand-orange/30 text-xs font-medium text-brand-orange hover:border-brand-orange/60 transition-colors">
                {p.nome}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Metric label="Pontos" value={totals.quantidade} />
            <Metric label="Valor total" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.valorTotal)} />
            <Metric label="Fluxo total" value={new Intl.NumberFormat('pt-BR').format(totals.fluxoTotal)} />
            <Metric label="CPM estimado" value={`R$ ${totals.cpmEstimado.toFixed(2)}`} />
          </div>
        </div>

        <button
          onClick={() => onAddPlan?.(suggestion.pontos)}
          disabled={!suggestion.pontos.length}
          className="inline-flex items-center justify-center gap-2 h-12 px-5 bg-gradient-to-r from-brand-orange to-brand-orange-hover text-white text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-brand-orange/50 transition-all disabled:opacity-60 disabled:shadow-none whitespace-nowrap"
        >
          <PlusCircle size={17} />
          Adicionar plano
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
      <label className="text-[11px] uppercase tracking-wide text-brand-gray-500 font-semibold">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-orange/40 transition-colors"
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
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-3 shadow-md shadow-black/10">
      <div className="text-[10px] uppercase tracking-wider text-brand-gray-500 font-semibold">{label}</div>
      <div className="text-sm font-bold text-white mt-1">{value}</div>
    </div>
  );
}
