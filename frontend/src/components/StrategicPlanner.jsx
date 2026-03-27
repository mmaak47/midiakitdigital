import { useEffect, useMemo, useState } from 'react';
import { Loader2, PlusCircle, Sparkles, Target } from 'lucide-react';
import CustomSelect from './CustomSelect';
import {
  SEGMENTOS,
  OBJETIVOS,
  getAudienceTagCatalog,
  getAvailabilityPresetOptions,
  suggestIdealPlan
} from '../lib/strategy';
import { fetchEntornoJobStatus, fetchEntornoScores } from '../lib/api';
import { fetchIbgeCityProfiles } from '../lib/ibge';

const DEFAULT_ENTORNO_RADIUS = 800;

export default function StrategicPlanner({ pontos = [], publicos = [], cidades = [], onAddPlan }) {
  const [form, setForm] = useState({
    segmento: 'clinica',
    objetivo: 'reconhecimento de marca',
    cidade: [],
    publico: [],
    audienceTags: [],
    availabilityPreference: 'all',
    investimentoMensal: 12000
  });
  const [entorno, setEntorno] = useState({
    loading: false,
    jobId: null,
    coverage: 0,
    scoresByPoint: {},
    updatedAt: null,
    error: ''
  });
  const [ibge, setIbge] = useState({
    loading: false,
    profiles: {},
    errors: {}
  });

  useEffect(() => {
    let active = true;
    let pollTimer = null;

    const loadScores = async (force = false) => {
      try {
        setEntorno((prev) => ({ ...prev, loading: true, error: '' }));
        const response = await fetchEntornoScores({
          segmento: form.segmento,
          cidade: form.cidade.length === 1 ? form.cidade[0] : '',
          raio: DEFAULT_ENTORNO_RADIUS,
          force
        });

        if (!active) return;

        const latest = response.metrics?.[0]?.updated_at || null;
        setEntorno((prev) => ({
          ...prev,
          loading: false,
          coverage: Number(response.coberturaCache || 0),
          scoresByPoint: response.byPoint || {},
          updatedAt: latest,
          jobId: response.job?.jobId || null,
          error: ''
        }));

        if (response.job?.jobId) {
          pollJob(response.job.jobId);
        }
      } catch (err) {
        if (!active) return;
        setEntorno((prev) => ({
          ...prev,
          loading: false,
          error: err.message || 'Erro ao consultar analise de entorno'
        }));
      }
    };

    const pollJob = (jobId) => {
      const poll = async () => {
        try {
          const job = await fetchEntornoJobStatus(jobId);
          if (!active) return;

          if (job.status === 'completed' || job.status === 'failed') {
            await loadScores(false);
            return;
          }

          pollTimer = setTimeout(poll, 3500);
        } catch {
          if (!active) return;
          pollTimer = setTimeout(poll, 5000);
        }
      };

      poll();
    };

    loadScores(false);

    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [form.segmento, form.cidade]);

  useEffect(() => {
    let active = true;

    const loadIbge = async () => {
      const selectedCities = Array.isArray(form.cidade) ? form.cidade.filter(Boolean) : [];
      if (!selectedCities.length) {
        setIbge({ loading: false, profiles: {}, errors: {} });
        return;
      }

      setIbge((prev) => ({ ...prev, loading: true }));

      try {
        const response = await fetchIbgeCityProfiles(selectedCities);
        if (!active) return;
        setIbge({
          loading: false,
          profiles: response.profiles || {},
          errors: response.errors || {}
        });
      } catch {
        if (!active) return;
        setIbge({
          loading: false,
          profiles: {},
          errors: { global: 'Falha ao carregar dados do IBGE.' }
        });
      }
    };

    loadIbge();

    return () => {
      active = false;
    };
  }, [form.cidade]);

  const suggestion = useMemo(() => suggestIdealPlan({
    pontos,
    cityInventory: pontos,
    cidade: form.cidade,
    publico: form.publico,
    audienceTags: form.audienceTags,
    availabilityPreference: form.availabilityPreference,
    objetivo: form.objetivo,
    segmento: form.segmento,
    investimentoMensal: form.investimentoMensal,
    entornoByPoint: entorno.scoresByPoint
  }), [pontos, form, entorno.scoresByPoint]);

  const audienceTagOptions = useMemo(() => getAudienceTagCatalog(pontos), [pontos]);
  const availabilityOptions = useMemo(() => getAvailabilityPresetOptions(), []);

  const totals = suggestion.totals;

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-6 shadow-lg shadow-black/20">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={18} className="text-brand-orange" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Sugestão de plano ideal</h2>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-7 gap-4 mb-5">
        <CustomSelect label="Segmento" value={form.segmento} onChange={(v) => setForm((s) => ({ ...s, segmento: v }))} options={SEGMENTOS} />
        <CustomSelect label="Objetivo" value={form.objetivo} onChange={(v) => setForm((s) => ({ ...s, objetivo: v }))} options={OBJETIVOS} allowCustom customPlaceholder="Digite um objetivo personalizado" />
        <CustomSelect label="Praça" value={form.cidade} onChange={(v) => setForm((s) => ({ ...s, cidade: v }))} options={cidades} multiple placeholder="Selecionar uma ou mais praças" />
        <CustomSelect label="Público" value={form.publico} onChange={(v) => setForm((s) => ({ ...s, publico: v }))} options={publicos} multiple placeholder="Selecionar um ou mais públicos" />
        <CustomSelect label="Audience tags" value={form.audienceTags} onChange={(v) => setForm((s) => ({ ...s, audienceTags: v }))} options={audienceTagOptions} multiple placeholder="Selecionar tags de audiência" />
        <CustomSelect label="Disponibilidade" value={form.availabilityPreference} onChange={(v) => setForm((s) => ({ ...s, availabilityPreference: v }))} options={availabilityOptions} />
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
          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-brand-gray-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold uppercase tracking-wide text-brand-gray-300">Análise de entorno</span>
              {entorno.loading && (
                <span className="inline-flex items-center gap-1 text-brand-orange">
                  <Loader2 size={12} className="animate-spin" />
                  Atualizando
                </span>
              )}
              {entorno.jobId && (
                <span className="rounded-full border border-brand-orange/30 bg-brand-orange/10 px-2 py-0.5 text-brand-orange">
                  Job #{entorno.jobId}
                </span>
              )}
            </div>
            <p className="mt-1">
              Cobertura do cache: {(entorno.coverage * 100).toFixed(0)}% dos pontos
              {entorno.updatedAt ? ` • atualizado em ${new Date(entorno.updatedAt).toLocaleString('pt-BR')}` : ''}
            </p>
            {entorno.error && <p className="mt-1 text-red-300">{entorno.error}</p>}
          </div>
          {form.cidade.length > 0 && (
            <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-brand-gray-400">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold uppercase tracking-wide text-brand-gray-300">Contexto territorial</span>
                {ibge.loading && (
                  <span className="inline-flex items-center gap-1 text-brand-orange">
                    <Loader2 size={12} className="animate-spin" />
                    Consultando IBGE
                  </span>
                )}
                <span className="rounded-full border border-brand-orange/30 bg-brand-orange/10 px-2 py-0.5 text-brand-orange">
                  Fonte: IBGE
                </span>
              </div>

              <div className="mt-2 space-y-1.5">
                {Object.values(ibge.profiles).map((profile) => (
                  <p key={`${profile.city}-${profile.ibgeCode || 'na'}`}>
                    {profile.city}: cod. {profile.ibgeCode || 'N/I'} • {profile.stateCode || '-'} • {profile.region || 'Região N/I'}
                  </p>
                ))}

                {Object.values(ibge.errors).map((error, index) => (
                  <p key={`ibge-error-${index}`} className="text-red-300">{error}</p>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2.5 mb-4">
            {suggestion.pontos.slice(0, 8).map((p) => (
              <span key={p.id} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-orange/15 to-brand-orange/5 border border-brand-orange/30 text-xs font-medium text-brand-orange hover:border-brand-orange/60 transition-colors">
                {p.nome}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 text-xs">
            <Metric label="Pontos" value={totals.quantidade} />
            <Metric label="Valor total" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.valorTotal)} />
            <Metric label="Fluxo total" value={new Intl.NumberFormat('pt-BR').format(totals.fluxoTotal)} />
            <Metric label="CPM estimado" value={`R$ ${totals.cpmEstimado.toFixed(2)}`} />
            <Metric label="Reach efetivo" value={`${suggestion.reachFrequency?.effectiveReachPct?.toFixed?.(1) ?? '0.0'}%`} />
            <Metric label="Freq média" value={`${suggestion.reachFrequency?.avgFrequency?.toFixed?.(2) ?? '0.00'}x`} />
            <Metric label="GRPs" value={String(suggestion.reachFrequency?.grps ?? 0)} />
            <Metric label="Uso de budget" value={`${suggestion.optimizer?.budgetUsagePct ?? 0}%`} />
          </div>
        </div>

        <button
          onClick={() => onAddPlan?.(suggestion.pontos)}
          disabled={!suggestion.pontos.length}
          className="orange-solid-btn inline-flex items-center justify-center gap-2 h-12 px-5 bg-gradient-to-r from-brand-orange to-brand-orange-hover text-white text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-brand-orange/50 transition-all disabled:opacity-60 disabled:shadow-none whitespace-nowrap"
        >
          <PlusCircle size={17} />
          Adicionar plano
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-brand-gray-500">
        <Target size={13} className="text-brand-orange" />
        Recomendação automática com base em objetivo, público, faixa de investimento e análise de entorno por segmento.
      </div>
    </section>
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
