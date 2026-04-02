import { memo, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, MapPin, Sparkles, Star, Target, TrendingUp, Zap } from 'lucide-react';
import { computeScreenScore, SCREEN_SCORE_WEIGHTS } from '../lib/strategy';

/* ─── Constants ─── */
const MIN_SCORE = 65;           // pontos abaixo disso NÃO aparecem
const MAX_RECOMMENDATIONS = 10; // curadoria premium — máximo visível

/* ─── Qualitative labels (cliente NUNCA vê números brutos) ─── */
function getQualityLabel(score) {
  if (score >= 85) return { text: 'Alta afinidade com o público', icon: Star, color: 'text-emerald-400', lightColor: 'text-emerald-700' };
  if (score >= 75) return { text: 'Boa oportunidade de impacto', icon: Zap, color: 'text-sky-400', lightColor: 'text-sky-700' };
  return { text: 'Local estratégico para este público', icon: Target, color: 'text-amber-400', lightColor: 'text-amber-700' };
}

/* highlight tags — pick 2-3 strongest dimensions to explain WHY */
function getHighlights(breakdown) {
  const DIM_POSITIVE = {
    fluxo: 'Alto fluxo de pessoas',
    eficiencia: 'Excelente custo-benefício',
    entorno: 'Entorno comercial forte',
    geoaudience: 'Bairro com perfil qualificado',
    census: 'Região com perfil demográfico alinhado',
    formato: 'Formato de alto impacto',
    cobertura: 'Ótimo posicionamento de preço',
  };
  return Object.entries(breakdown)
    .filter(([, v]) => v >= 55)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([key]) => DIM_POSITIVE[key] || key);
}

/* ─── Recommendation card ─── */
function RecommendationCard({ scored, isDark, onAdd, expanded, onToggle }) {
  const { point, score, breakdown } = scored;
  const quality = getQualityLabel(score);
  const QIcon = quality.icon;
  const highlights = getHighlights(breakdown);

  return (
    <div className={`rounded-xl border transition-colors ${isDark ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
      <button
        type="button"
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
        onClick={onToggle}
      >
        {/* Quality icon */}
        <div className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-brand-orange/10' : 'bg-orange-50'}`}>
          <QIcon size={16} className="text-brand-orange" />
        </div>

        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-neutral-800'}`}>
            {point.nome || point.endereco || `Ponto ${point.id}`}
          </div>
          <div className={`text-xs mt-0.5 ${isDark ? quality.color : quality.lightColor}`}>
            {quality.text}
          </div>
          <div className={`text-[11px] mt-1 truncate ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
            <MapPin size={10} className="inline -mt-px mr-0.5" />
            {point.cidade} • {point.tipo}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <span className={`text-xs font-medium ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
            R$ {Number(point.preco || 0).toLocaleString('pt-BR')}
          </span>
          {expanded
            ? <ChevronUp size={14} className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'} />
            : <ChevronDown size={14} className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'} />}
        </div>
      </button>

      {expanded && (
        <div className={`px-4 pb-4 pt-0 border-t ${isDark ? 'border-white/5' : 'border-neutral-100'}`}>
          {/* Why this screen — positive highlights */}
          {highlights.length > 0 && (
            <div className="pt-3 flex flex-wrap gap-1.5">
              {highlights.map((h) => (
                <span
                  key={h}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium ${
                    isDark
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  <Sparkles size={9} />
                  {h}
                </span>
              ))}
            </div>
          )}

          {/* Dimension bars — only show dimensions ≥ 50 (hide weak ones) */}
          <div className="pt-3 space-y-1.5">
            {Object.entries(breakdown)
              .filter(([, v]) => v >= 50)
              .sort(([, a], [, b]) => b - a)
              .map(([key, val]) => {
                const pct = Math.max(0, Math.min(100, val));
                return (
                  <div key={key} className="flex items-center gap-2 text-xs" title={DIM_DESC[key]}>
                    <span className="w-4 text-center">{DIM_ICONS[key] || '·'}</span>
                    <span className={`w-[5.5rem] truncate ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                      {DIM_LABELS[key] || key}
                    </span>
                    <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}>
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd?.([point]); }}
            className="mt-3 w-full py-2 rounded-lg text-xs font-semibold bg-brand-orange text-white hover:bg-brand-orange/90 transition-colors"
          >
            + Adicionar ao plano
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Dimension metadata (used in expanded details) ─── */
const DIM_LABELS = {
  fluxo: 'Tráfego',
  eficiencia: 'Eficiência',
  entorno: 'Entorno',
  geoaudience: 'Geo-audiência',
  census: 'Demografia',
  formato: 'Formato',
  cobertura: 'Cobertura',
};

const DIM_DESC = {
  fluxo: 'Volume de fluxo de pessoas no local.',
  eficiencia: 'Custo-benefício: CPM e inserções por real.',
  entorno: 'Qualidade do entorno comercial no raio de 800m.',
  geoaudience: 'Perfil socioeconômico do bairro.',
  census: 'Perfil demográfico IBGE da região.',
  formato: 'Qualidade e impacto do formato de mídia.',
  cobertura: 'Posicionamento de preço vs. mercado.',
};

const DIM_ICONS = {
  fluxo: '🚶',
  eficiencia: '💰',
  entorno: '📍',
  geoaudience: '🏘️',
  census: '👥',
  formato: '📺',
  cobertura: '📡',
};

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT — Sales-first recommendation engine
   ═══════════════════════════════════════════════════════════════ */
const RecommendationEngine = memo(function RecommendationEngine({
  pontos = [],
  geoProfiles = null,
  censusProfiles = null,
  history = [],
  onApplyCombo,
  isDark = true,
}) {
  const [expandedId, setExpandedId] = useState(null);

  /* ── Compute & filter ── */
  const { recommended, totalScored } = useMemo(() => {
    if (!pontos.length) return { recommended: [], totalScored: 0 };
    const maxFluxo = Math.max(1, ...pontos.map((p) => Number(p.fluxo) || 0));
    const prices = pontos.map((p) => Number(p.preco) || 0).filter((v) => v > 0).sort((a, b) => a - b);
    const medianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : 1;

    const all = pontos
      .map((point) => {
        const result = computeScreenScore(point, {
          geoProfile: geoProfiles?.[point.id] || null,
          censusProfile: censusProfiles?.[point.id] || null,
          entornoMetrics: null,
          maxFluxo,
          medianPrice,
        });
        return { point, ...result };
      })
      .sort((a, b) => b.score - a.score);

    // Regra 1: score mínimo — ocultar telas fracas
    const filtered = all.filter((s) => s.score >= MIN_SCORE);
    // Regra 2: máximo de recomendações — curadoria premium
    return { recommended: filtered.slice(0, MAX_RECOMMENDATIONS), totalScored: all.length };
  }, [pontos, geoProfiles, censusProfiles]);

  /* ── History combos ── */
  const combos = history
    .filter((item) => item.type === 'combo')
    .slice(-4)
    .reverse();

  const noData = totalScored === 0;
  const noGoodOptions = totalScored > 0 && recommended.length === 0;

  return (
    <section className={`rounded-2xl border p-5 space-y-4 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-neutral-200 bg-white'}`}>
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-brand-orange" />
        <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? '' : 'text-neutral-800'}`}>
          Telas Recomendadas
        </h3>
        {recommended.length > 0 && (
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
            {recommended.length} {recommended.length === 1 ? 'oportunidade' : 'oportunidades'}
          </span>
        )}
      </div>

      {/* ── Empty state: loading ── */}
      {noData && (
        <p className={`text-sm ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
          Selecione uma cidade para ver as melhores oportunidades de mídia para sua campanha.
        </p>
      )}

      {/* ── Empty state: no good options ── */}
      {noGoodOptions && (
        <div className={`rounded-xl border p-5 text-center ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-neutral-50'}`}>
          <div className={`text-3xl mb-2`}>🔍</div>
          <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-neutral-800'}`}>
            Não encontramos telas ideais para este público nesta região.
          </p>
          <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
            Sugerimos ampliar o raio da campanha ou ajustar o público-alvo para encontrar melhores oportunidades.
          </p>
        </div>
      )}

      {/* ── Recommendations list ── */}
      {recommended.length > 0 && (
        <div className="space-y-2">
          {recommended.map((s) => (
            <RecommendationCard
              key={s.point.id}
              scored={s}
              isDark={isDark}
              expanded={expandedId === s.point.id}
              onToggle={() => setExpandedId(expandedId === s.point.id ? null : s.point.id)}
              onAdd={onApplyCombo}
            />
          ))}
        </div>
      )}

      {/* ── Add all recommendations at once ── */}
      {recommended.length > 1 && (
        <button
          type="button"
          onClick={() => onApplyCombo?.(recommended.map((s) => s.point))}
          className={`w-full py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
            isDark
              ? 'border-brand-orange/30 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20'
              : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
          }`}
        >
          Adicionar todas as {recommended.length} telas recomendadas ao plano
        </button>
      )}

      {/* ── History section ── */}
      {combos.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock3 size={14} className="text-brand-orange" />
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
              Histórico de combinações
            </span>
          </div>
          <div className="space-y-2">
            {combos.map((combo) => (
              <div key={combo.id} className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                <div>
                  <div className={`text-sm ${isDark ? 'text-white' : 'text-neutral-800'}`}>{combo.label || 'Combinação popular'}</div>
                  <div className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{combo.points?.length || 0} pontos • {combo.city || 'múltiplas praças'}</div>
                </div>
                <button
                  onClick={() => onApplyCombo?.(combo.points || [])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${isDark ? 'border-white/15 bg-white/[0.04] hover:bg-white/[0.08]' : 'border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700'}`}
                >
                  Aplicar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
});

export default RecommendationEngine;
