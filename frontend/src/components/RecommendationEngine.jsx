import { memo, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Clock3, Gauge, Star, TrendingUp, Zap } from 'lucide-react';
import { computeScreenScore, SCREEN_SCORE_WEIGHTS } from '../lib/strategy';

/* ─── grade colour helpers ─── */
const GRADE_COLORS = {
  A: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', ring: 'ring-emerald-500/30', light: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  B: { bg: 'bg-sky-500/15', text: 'text-sky-400', ring: 'ring-sky-500/30', light: 'bg-sky-50 text-sky-700 ring-sky-200' },
  C: { bg: 'bg-amber-500/15', text: 'text-amber-400', ring: 'ring-amber-500/30', light: 'bg-amber-50 text-amber-700 ring-amber-200' },
  D: { bg: 'bg-red-500/15', text: 'text-red-400', ring: 'ring-red-500/30', light: 'bg-red-50 text-red-700 ring-red-200' },
};

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
  fluxo: 'Volume de fluxo de pessoas no local em relação ao máximo do inventário.',
  eficiencia: 'Relação custo-benefício: CPM (custo por mil impactos) e inserções por real investido.',
  entorno: 'Qualidade do entorno comercial (POIs relevantes para o segmento num raio de 800m).',
  geoaudience: 'Classificação do bairro: tipo de vizinhança, nível socioeconômico, densidade urbana.',
  census: 'Perfil demográfico IBGE + POIs locais: renda, educação, faixa etária da região.',
  formato: 'Qualidade e impacto do formato de mídia (elevador, painel LED, indoor, totem, etc.).',
  cobertura: 'Potencial de cobertura: relação entre preço e mediana do mercado.',
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

/* ─── small bar component ─── */
function DimBar({ label, value, weight, isDark, icon, desc }) {
  const pct = Math.max(0, Math.min(100, value));
  const color =
    pct >= 70 ? 'bg-emerald-500' : pct >= 45 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 text-xs" title={desc}>
      <span className="w-4 text-center">{icon}</span>
      <span className={`w-[5.5rem] truncate ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
        {label}
      </span>
      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}>
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-8 text-right tabular-nums font-medium ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>
        {pct}
      </span>
      <span className={`w-6 text-right ${isDark ? 'text-brand-gray-600' : 'text-neutral-400'}`}>
        {weight}%
      </span>
    </div>
  );
}

/* ─── score badge ─── */
function ScoreBadge({ score, grade, isDark, size = 'md' }) {
  const g = GRADE_COLORS[grade] || GRADE_COLORS.D;
  const sz = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-9 h-9 text-sm';
  return (
    <div
      className={`flex items-center justify-center rounded-xl font-bold ring-1 ${sz} ${
        isDark ? `${g.bg} ${g.text} ${g.ring}` : `${g.light}`
      }`}
    >
      {score}
    </div>
  );
}

/* ─── point row ─── */
function PointRow({ scored, rank, isDark, expanded, onToggle, onAdd }) {
  const { point, score, grade, breakdown } = scored;
  const g = GRADE_COLORS[grade] || GRADE_COLORS.D;
  const totalW = Object.values(SCREEN_SCORE_WEIGHTS).reduce((s, v) => s + v, 0);

  return (
    <div className={`rounded-xl border transition-colors ${isDark ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]' : 'border-neutral-200 bg-neutral-50 hover:bg-white'}`}>
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        onClick={onToggle}
      >
        <span className={`flex-shrink-0 w-5 text-center text-xs font-bold ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
          {rank}
        </span>
        <ScoreBadge score={score} grade={grade} isDark={isDark} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-neutral-800'}`}>
            {point.nome || point.endereco || `Ponto ${point.id}`}
          </div>
          <div className={`text-xs truncate ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
            {point.cidade} • {point.tipo} • R$ {Number(point.preco || 0).toLocaleString('pt-BR')}
          </div>
        </div>
        <span className={`flex-shrink-0 px-2 py-0.5 rounded-md text-xs font-bold ring-1 ${isDark ? `${g.bg} ${g.text} ${g.ring}` : g.light}`}>
          {grade}
        </span>
        {expanded ? <ChevronUp size={14} className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'} /> : <ChevronDown size={14} className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'} />}
      </button>

      {expanded && (
        <div className={`px-3 pb-3 pt-0 border-t ${isDark ? 'border-white/5' : 'border-neutral-100'}`}>
          <div className="pt-2 space-y-1.5">
            {Object.entries(breakdown).map(([key, val]) => (
              <DimBar
                key={key}
                label={DIM_LABELS[key] || key}
                value={val}
                weight={Math.round((SCREEN_SCORE_WEIGHTS[key] / totalW) * 100)}
                isDark={isDark}
                icon={DIM_ICONS[key] || '·'}
                desc={DIM_DESC[key] || ''}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd?.([point]); }}
            className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium bg-brand-orange/90 text-white hover:bg-brand-orange transition-colors"
          >
            + Adicionar ao plano
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── distribution mini chart ─── */
function GradeDistribution({ counts, total, isDark }) {
  const grades = ['A', 'B', 'C', 'D'];
  return (
    <div className="flex gap-1.5">
      {grades.map((g) => {
        const pct = total > 0 ? (counts[g] / total) * 100 : 0;
        const gc = GRADE_COLORS[g];
        return (
          <div key={g} className="flex-1 text-center">
            <div className={`rounded-lg py-1.5 text-xs font-bold ring-1 ${isDark ? `${gc.bg} ${gc.text} ${gc.ring}` : gc.light}`}>
              {g}
            </div>
            <div className={`mt-1 text-[10px] font-medium tabular-nums ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
              {counts[g]} <span className={isDark ? 'text-brand-gray-600' : 'text-neutral-400'}>({pct.toFixed(0)}%)</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
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
  const [showAll, setShowAll] = useState(false);

  /* ── Compute ScreenScore for every point ── */
  const scored = useMemo(() => {
    if (!pontos.length) return [];
    const maxFluxo = Math.max(1, ...pontos.map((p) => Number(p.fluxo) || 0));
    const prices = pontos.map((p) => Number(p.preco) || 0).filter((v) => v > 0).sort((a, b) => a - b);
    const medianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : 1;

    return pontos
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
  }, [pontos, geoProfiles, censusProfiles]);

  const gradeCounts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0, D: 0 };
    for (const s of scored) c[s.grade] = (c[s.grade] || 0) + 1;
    return c;
  }, [scored]);

  const avgScore = useMemo(() => {
    if (!scored.length) return 0;
    return Math.round(scored.reduce((s, v) => s + v.score, 0) / scored.length);
  }, [scored]);

  const topN = showAll ? scored : scored.slice(0, 6);

  /* ── History combos ── */
  const combos = history
    .filter((item) => item.type === 'combo')
    .slice(-4)
    .reverse();

  const hasData = scored.length > 0;

  return (
    <section className={`rounded-2xl border p-5 space-y-5 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-neutral-200 bg-white'}`}>
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2">
          <Gauge size={18} className="text-brand-orange" />
          <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? '' : 'text-neutral-800'}`}>
            ScreenScore — Ranking Inteligente
          </h3>
        </div>
        <p className={`mt-1.5 text-[11px] leading-relaxed ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
          Nota de 0 a 100 calculada com 7 dimensões: <strong>Tráfego</strong> (fluxo de pessoas), <strong>Eficiência</strong> (custo-benefício),
          {' '}<strong>Entorno</strong> (POIs relevantes), <strong>Geo-audiência</strong> (classificação do bairro), <strong>Demografia</strong> (IBGE Censo),
          {' '}<strong>Formato</strong> (tipo de mídia) e <strong>Cobertura</strong> (posicionamento de preço). Passe o mouse sobre cada barra para ver detalhes.
        </p>
      </div>

      {!hasData && (
        <p className={`text-sm ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
          Carregue pontos para visualizar o ScreenScore de cada tela e identificar as melhores oportunidades.
        </p>
      )}

      {hasData && (
        <>
          {/* ── Summary row ── */}
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3`}>
            <div className={`rounded-xl border px-3 py-2.5 text-center ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
              <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-neutral-800'}`}>{scored.length}</div>
              <div className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Pontos avaliados</div>
            </div>
            <div className={`rounded-xl border px-3 py-2.5 text-center ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
              <div className={`text-2xl font-bold ${avgScore >= 60 ? 'text-emerald-400' : avgScore >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                {avgScore}
              </div>
              <div className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Score médio</div>
            </div>
            <div className={`rounded-xl border px-3 py-2.5 text-center ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
              <div className={`text-2xl font-bold text-emerald-400`}>{gradeCounts.A}</div>
              <div className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Nota A</div>
            </div>
            <div className={`rounded-xl border px-3 py-2.5 text-center ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
              <div className={`text-2xl font-bold text-sky-400`}>{gradeCounts.A + gradeCounts.B}</div>
              <div className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>A + B</div>
            </div>
          </div>

          {/* ── Grade distribution ── */}
          <GradeDistribution counts={gradeCounts} total={scored.length} isDark={isDark} />

          {/* ── Top points list ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-brand-orange" />
              <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                Ranking por ScreenScore
              </span>
            </div>

            <div className="space-y-2">
              {topN.map((s, i) => (
                <PointRow
                  key={s.point.id}
                  scored={s}
                  rank={i + 1}
                  isDark={isDark}
                  expanded={expandedId === s.point.id}
                  onToggle={() => setExpandedId(expandedId === s.point.id ? null : s.point.id)}
                  onAdd={onApplyCombo}
                />
              ))}
            </div>

            {scored.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className={`mt-2 w-full py-2 rounded-xl text-xs font-medium border transition-colors ${isDark ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-brand-gray-400' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-600'}`}
              >
                {showAll ? `Mostrar top 6` : `Ver todos os ${scored.length} pontos`}
              </button>
            )}
          </div>
        </>
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
