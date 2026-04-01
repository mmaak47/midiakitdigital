import { memo, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, PlusCircle, Sparkles, Target } from 'lucide-react';
import CustomSelect from './CustomSelect';
import {
  SEGMENTOS,
  OBJETIVOS,
  getAudienceTagCatalog,
  getAvailabilityPresetOptions,
  suggestIdealPlan
} from '../lib/strategy';
import { fetchEntornoJobStatus, fetchEntornoScores } from '../lib/api';
import { getMunicipioCode, getPIBPerCapita, getPopulacao } from '../services/ibgeService';

// AUDITORIA IBGE (consumo)
// Este componente consome os dados via src/services/ibgeService.js.
// Fluxo:
// 1) getMunicipioCode(praca) -> codigo IBGE do municipio
// 2) getPopulacao(codigo) -> populacao municipal (agregado 4709)
// 3) getPIBPerCapita(codigo) -> PIB per capita municipal (agregado 5938)
// Exibicao:
// - Linha contextual abaixo dos filtros de configuracao (ETAPA 1).
// - Com cache em memoria por sessao para evitar consultas repetidas por cidade.

const DEFAULT_ENTORNO_RADIUS = 800;
const CITY_CONTEXT_CACHE = new Map();

function formatPopulacaoCompacta(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(1).replace('.', ',')}M`;
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(1).replace('.', ',')}k`;
  return new Intl.NumberFormat('pt-BR').format(Math.round(numeric));
}

function formatMoedaSemCentavos(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(numeric);
}

export default function StrategicPlanner({ pontos = [], publicos = [], cidades = [], onAddPlan, onSuggestionChange, isDark = true }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
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
  const [cityContext, setCityContext] = useState({
    loading: false,
    cityName: '',
    populacao: null,
    pibPerCapita: null
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

    const loadCityContext = async () => {
      const selectedCities = Array.isArray(form.cidade) ? form.cidade.filter(Boolean) : [];
      if (selectedCities.length !== 1) {
        setCityContext({ loading: false, cityName: '', populacao: null, pibPerCapita: null });
        return;
      }

      const cityName = selectedCities[0];
      if (CITY_CONTEXT_CACHE.has(cityName)) {
        const cached = CITY_CONTEXT_CACHE.get(cityName);
        setCityContext({
          loading: false,
          cityName,
          populacao: cached.populacao,
          pibPerCapita: cached.pibPerCapita
        });
        return;
      }

      setCityContext({ loading: true, cityName, populacao: null, pibPerCapita: null });

      const municipioCode = await getMunicipioCode(cityName);
      if (!active || !municipioCode) {
        if (active) setCityContext({ loading: false, cityName, populacao: null, pibPerCapita: null });
        return;
      }

      const [populacao, pibPerCapita] = await Promise.all([
        getPopulacao(municipioCode),
        getPIBPerCapita(municipioCode)
      ]);

      if (!active) return;

      if (populacao === null || pibPerCapita === null) {
        setCityContext({ loading: false, cityName, populacao: null, pibPerCapita: null });
        return;
      }

      const result = { populacao, pibPerCapita };
      CITY_CONTEXT_CACHE.set(cityName, result);
      setCityContext({ loading: false, cityName, populacao, pibPerCapita });
    };

    loadCityContext();

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

  useEffect(() => {
    onSuggestionChange?.(suggestion);
  }, [onSuggestionChange, suggestion]);

  const cityContextText = useMemo(() => {
    const pop = formatPopulacaoCompacta(cityContext.populacao);
    const pib = formatMoedaSemCentavos(cityContext.pibPerCapita);
    if (!cityContext.cityName || !pop || !pib) return '';
    return `${cityContext.cityName} · População: ${pop} · PIB per capita: ${pib}`;
  }, [cityContext]);

  return (
    <section className="space-y-4">
      <div className={`rounded-2xl border p-6 shadow-lg ${isDark ? 'border-white/10 bg-zinc-900 shadow-black/20' : 'border-neutral-200 bg-white shadow-neutral-200/70'}`}>
        <div className="mb-5">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8591A]">ETAPA 1</div>
          <div className="mt-1 flex items-center gap-2">
            <Sparkles size={18} className="text-[#E8591A]" />
            <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Configure sua campanha</h2>
          </div>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-3">
          <CustomSelect isDark={isDark} label="Segmento" value={form.segmento} onChange={(v) => setForm((s) => ({ ...s, segmento: v }))} options={SEGMENTOS} />
          <CustomSelect isDark={isDark} label="Praça" value={form.cidade} onChange={(v) => setForm((s) => ({ ...s, cidade: v }))} options={cidades} multiple placeholder="Selecionar uma ou mais praças" />
          <div>
            <label className={`text-[11px] uppercase tracking-wide font-semibold ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Investimento mensal</label>
            <input
              type="number"
              min={0}
              step={500}
              value={form.investimentoMensal}
              onChange={(e) => setForm((s) => ({ ...s, investimentoMensal: Number(e.target.value) || 0 }))}
              className={`mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none transition-colors focus:border-[#E8591A]/50 ${isDark ? 'bg-white/10 border border-white/15 text-white' : 'bg-neutral-100 border border-neutral-300 text-neutral-900'}`}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className={`mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-400 hover:text-white' : 'text-neutral-600 hover:text-neutral-900'}`}
        >
          <span>{showAdvanced ? 'Ocultar opções avançadas' : 'Personalizar mais'}</span>
        </button>

        {showAdvanced && (
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
            <CustomSelect isDark={isDark} label="Objetivo" value={form.objetivo} onChange={(v) => setForm((s) => ({ ...s, objetivo: v }))} options={OBJETIVOS} allowCustom customPlaceholder="Digite um objetivo personalizado" />
            <CustomSelect isDark={isDark} label="Público" value={form.publico} onChange={(v) => setForm((s) => ({ ...s, publico: v }))} options={publicos} multiple placeholder="Selecionar um ou mais públicos" />
            <CustomSelect isDark={isDark} label="Perfil do público" value={form.audienceTags} onChange={(v) => setForm((s) => ({ ...s, audienceTags: v }))} options={audienceTagOptions} multiple placeholder="Selecionar interesses" />
            <CustomSelect isDark={isDark} label="Disponibilidade" value={form.availabilityPreference} onChange={(v) => setForm((s) => ({ ...s, availabilityPreference: v }))} options={availabilityOptions} />
          </div>
        )}

        {cityContext.loading ? (
          <div className={`mb-4 flex items-center gap-2 text-sm ${isDark ? 'text-gray-400' : 'text-neutral-500'}`}>
            <Building2 size={14} className="text-[#E8591A]" />
            <span className={`h-4 w-48 animate-pulse rounded ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`} />
          </div>
        ) : cityContextText ? (
          <div className={`mb-4 flex items-center gap-2 text-sm ${isDark ? 'text-gray-400' : 'text-neutral-500'}`}>
            <Building2 size={14} className="text-[#E8591A]" />
            <span>{cityContextText}</span>
          </div>
        ) : null}

        <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-start">
          <div>
            <p className={`text-sm mb-3 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{suggestion.justificativa}</p>
            <div className={`mb-4 rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-400' : 'border-neutral-200 bg-neutral-50 text-neutral-600'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>Inteligência regional</span>
                {entorno.loading ? (
                  <span className="inline-flex items-center gap-1 text-brand-orange">
                    <Loader2 size={12} className="animate-spin" />
                    Atualizando recomendações
                  </span>
                ) : null}
              </div>
              <p className="mt-1">
                As sugestões já consideram fluxo e potencial da região para evitar pontos redundantes e melhorar o alcance da campanha.
              </p>
              {entorno.error && <p className="mt-1 text-red-300">Não foi possível atualizar a análise agora. Você ainda pode montar o plano normalmente.</p>}
            </div>
            <div className="flex flex-wrap gap-2.5 mb-1">
              {suggestion.pontos.slice(0, 8).map((p) => (
                <span key={p.id} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-orange/15 to-brand-orange/5 border border-brand-orange/30 text-xs font-medium text-brand-orange hover:border-brand-orange/60 transition-colors">
                  {p.nome}
                </span>
              ))}
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
      </div>

      <div className={`h-px w-full ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`} />

      <div className={`rounded-xl p-4 ${isDark ? 'bg-black/30' : 'bg-neutral-100 border border-neutral-200'}`}>
        <div className="mb-3">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8591A]">ETAPA 2 — Resumo da seleção</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 text-xs">
          <Metric label="Pontos" value={totals.quantidade} isDark={isDark} />
          <Metric label="Valor Total" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.valorTotal)} isDark={isDark} />
          <Metric label="Fluxo Total" value={new Intl.NumberFormat('pt-BR').format(totals.fluxoTotal)} isDark={isDark} />
          <Metric label="CPM Estimado" value={`R$ ${totals.cpmEstimado.toFixed(2)}`} isDark={isDark} />
          <Metric label="Reach Efetivo" value={`${suggestion.reachFrequency?.effectiveReachPct?.toFixed?.(1) ?? '0.0'}%`} isDark={isDark} />
          <Metric label="Freq Média" value={`${suggestion.reachFrequency?.avgFrequency?.toFixed?.(2) ?? '0.00'}x`} isDark={isDark} />
          <Metric label="GRPs" value={String(suggestion.reachFrequency?.grps ?? 0)} isDark={isDark} />
          <Metric label="Uso de Budget" value={`${suggestion.optimizer?.budgetUsagePct ?? 0}%`} isDark={isDark} />
        </div>
        <div className={`mt-4 flex items-center gap-2 text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
          <Target size={13} className="text-brand-orange" />
          Recomendação automática com base em objetivo, público, faixa de investimento e análise de entorno por segmento.
        </div>
      </div>
    </section>
  );
}

const Metric = memo(function Metric({ label, value, isDark = true }) {
  return (
    <div className={`rounded-xl border p-3 shadow-md ${isDark ? 'border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] shadow-black/10' : 'border-neutral-200 bg-white shadow-neutral-200/80'}`}>
      <div className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{label}</div>
      <div className={`text-sm font-bold mt-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>{value}</div>
    </div>
  );
});
