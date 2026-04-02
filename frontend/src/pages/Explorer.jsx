import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle, ChevronDown, LayoutGrid, Map, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import FilterSidebar from '../components/FilterSidebar';
import PointCard from '../components/PointCard';
import PointModal from '../components/PointModal';
import SkeletonCard from '../components/SkeletonCard';
import FavoritesBar from '../components/FavoritesBar';
import StrategicPlanner from '../components/StrategicPlanner';
import CoverageMeter from '../components/CoverageMeter';
import CampaignMetrics from '../components/CampaignMetrics';
import CampaignScore from '../components/CampaignScore';
import RecommendationEngine from '../components/RecommendationEngine';
import ImpactSimulator from '../components/ImpactSimulator';
import { fetchPontos, fetchGeoAudienceProfiles, fetchCensusProfiles } from '../lib/api';
import { useFavorites } from '../context/FavoritesContext';
import { calculateCampaignScore, calculateCoverageLevel, campaignTotals } from '../lib/strategy';
import { computeCityBoundingBoxes } from '../lib/geo';

const SmartMap = lazy(() => import('../components/SmartMap'));

export default function Explorer() {
  const mainRef = useRef(null);
  const resultsAnchorRef = useRef(null);
  const filtersInitializedRef = useRef(false);
  const pendingResultsScrollRef = useRef(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('intermidia_theme') !== 'light';
  });
  const [searchParams] = useSearchParams();
  const initialCidade = searchParams.getAll('cidade');

  const [pontos, setPontos] = useState([]);
  const [allPontos, setAllPontos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ cidade: initialCidade, tipo: '', elevador_categoria: '', publico: [], search: '' });
  const [view, setView] = useState('grid');
  const [showMapModal, setShowMapModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [plannerSuggestion, setPlannerSuggestion] = useState(null);
  const { favorites, addFavorites, history, registerView } = useFavorites();
  const [geoProfiles, setGeoProfiles] = useState(null);
  const [censusProfiles, setCensusProfiles] = useState(null);

  const selectedForMetrics = useMemo(() => {
    if (favorites.length) return favorites;
    return selected ? [selected] : [];
  }, [favorites, selected]);

  const cityInventory = useMemo(
    () => allPontos.filter((p) => !filters.cidade.length || filters.cidade.includes(p.cidade)),
    [allPontos, filters.cidade],
  );
  const coverage = useMemo(
    () => calculateCoverageLevel(selectedForMetrics, cityInventory),
    [selectedForMetrics, cityInventory],
  );
  const totals = useMemo(() => campaignTotals(selectedForMetrics), [selectedForMetrics]);
  const scoreInfo = useMemo(() => calculateCampaignScore({
    selected: selectedForMetrics,
    objective: 'cobertura regional',
    desiredPublico: filters.publico,
    cityInventory
  }), [selectedForMetrics, filters.publico, cityInventory]);

  const publicos = Array.from(new Set(allPontos.map((p) => p.publico).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cidades = Array.from(new Set(allPontos.map((p) => p.cidade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cityBounds = useMemo(() => computeCityBoundingBoxes(allPontos), [allPontos]);

  const loadPontos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPontos(filters);
      setPontos(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(loadPontos, 200);
    return () => clearTimeout(timer);
  }, [loadPontos]);

  useEffect(() => {
    Promise.all([
      fetchPontos(),
      fetchGeoAudienceProfiles().catch(() => ({ profiles: {} })),
      fetchCensusProfiles().catch(() => ({ profiles: [] }))
    ]).then(([data, geo, census]) => {
      setAllPontos(data);
      setGeoProfiles(geo?.profiles || null);
      const censusMap = {};
      if (Array.isArray(census?.profiles)) {
        for (const p of census.profiles) {
          if (p?.ponto_id) censusMap[p.ponto_id] = p;
        }
      }
      setCensusProfiles(Object.keys(censusMap).length ? censusMap : null);
    }).catch(() => setAllPontos([]));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('intermidia_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true;
      return;
    }

    pendingResultsScrollRef.current = true;
  }, [filters]);

  useEffect(() => {
    if (loading || !pendingResultsScrollRef.current) return;

    const mainElement = mainRef.current;
    const anchorElement = resultsAnchorRef.current;
    if (!mainElement || !anchorElement) return;

    const mainRect = mainElement.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();
    const nextTop = anchorRect.top - mainRect.top + mainElement.scrollTop - 12;

    mainElement.scrollTo({
      top: Math.max(0, nextTop),
      behavior: 'smooth'
    });

    pendingResultsScrollRef.current = false;
  }, [loading, pontos.length]);

  const handleSelectPoint = useCallback((ponto) => {
    registerView(ponto);
    setSelected(ponto);
  }, [registerView]);

  return (
    <div
      className={`min-h-screen ${isDark ? 'bg-black text-white' : 'commercial-light bg-[#f4f5f7] text-neutral-900'}`}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <Navbar commercial isDark={isDark} onToggleTheme={() => setIsDark((prev) => !prev)} />

      <div className="pt-16 flex h-screen">
        <FilterSidebar
          filters={filters}
          setFilters={setFilters}
          total={pontos.length}
          mobileOpen={mobileFilters}
          setMobileOpen={setMobileFilters}
          isDark={isDark}
        />

        {/* Main content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto pb-28">
          <div className="px-6 pt-4 space-y-4">
            <section className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-white'}`}>
              <div className="grid gap-2 md:grid-cols-3">
                {[
                  { title: '1. Escolha sua cidade', done: filters.cidade.length > 0 },
                  { title: '2. Selecione os pontos', done: favorites.length > 0 },
                  { title: '3. Receba sua proposta', done: history.length > 0 }
                ].map((step) => (
                  <div
                    key={step.title}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${step.done ? (isDark ? 'border-brand-orange/40 bg-brand-orange/10 text-brand-orange' : 'border-orange-300 bg-orange-50 text-orange-700') : isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-600'}`}
                  >
                    {step.title}
                  </div>
                ))}
              </div>
            </section>

            {!favorites.length && (
              <section className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-white'}`}>
                <p className={`text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>
                  Comece escolhendo sua cidade e orçamento. Em seguida, adicione pontos para montar sua campanha e gerar uma proposta personalizada.
                </p>
              </section>
            )}

            <StrategicPlanner
              pontos={allPontos}
              cidades={cidades}
              publicos={publicos}
              onAddPlan={addFavorites}
              onSuggestionChange={setPlannerSuggestion}
              isDark={isDark}
            />

            <div className={`h-px w-full ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`} />

            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#E8591A]">ETAPA 3 — Análise</div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <CoverageMeter coverage={coverage} isDark={isDark} />
                </div>
                <div className="space-y-4">
                  <CampaignScore scoreInfo={scoreInfo} isDark={isDark} />
                  <ImpactSimulator points={cityInventory} onAdd={addFavorites} isDark={isDark} />
                </div>
              </div>
            </div>

            <MarketBenchmarksPanel suggestion={plannerSuggestion} isDark={isDark} />

            <div className={`h-px w-full ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`} />

            <CampaignMetrics totals={totals} isDark={isDark} />
            <RecommendationEngine history={history} onApplyCombo={addFavorites} isDark={isDark} />
          </div>

          {/* Toolbar */}
          <div ref={resultsAnchorRef} className={`sticky top-0 z-10 backdrop-blur-xl border-b px-6 py-3 flex items-center justify-between ${isDark ? 'bg-black/80 border-white/5' : 'bg-white/90 border-neutral-200 shadow-sm'}`}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileFilters(true)}
                className={`lg:hidden p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-neutral-100'}`}
              >
                <SlidersHorizontal size={18} />
              </button>
              <h1 className="text-lg font-semibold">
                Pontos de Mídia
              </h1>
              <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'text-brand-gray-500 bg-white/5' : 'text-neutral-500 bg-neutral-100 border border-neutral-200'}`}>
                {pontos.length}
              </span>
            </div>

            <div className={`flex items-center gap-1 rounded-xl p-1 ${isDark ? 'bg-white/5' : 'bg-neutral-100 border border-neutral-200'}`}>
              <button
                onClick={() => setView('grid')}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  !showMapModal
                    ? 'bg-brand-orange text-white'
                    : isDark
                      ? 'text-brand-gray-400 hover:text-white'
                      : 'text-neutral-500 hover:text-neutral-900 hover:bg-white'
                }`}
                title="Visualização em grade"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setShowMapModal(true)}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  showMapModal
                    ? 'bg-brand-orange text-white'
                    : isDark
                      ? 'text-brand-gray-400 hover:text-white'
                      : 'text-neutral-500 hover:text-neutral-900 hover:bg-white'
                }`}
                title="Abrir mapa"
              >
                <Map size={16} />
              </button>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonCard key={i} isDark={isDark} />
                ))}
              </div>
            ) : pontos.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-20"
              >
                <div className="text-brand-gray-600 text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold text-brand-gray-300 mb-2">
                  Nenhum ponto encontrado
                </h3>
                <p className="text-brand-gray-500 text-sm">
                  Tente ajustar os filtros para ver mais resultados.
                </p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                {pontos.map((ponto, i) => (
                  <PointCard
                    key={ponto.id}
                    ponto={ponto}
                    onSelect={handleSelectPoint}
                    index={i}
                    isDark={isDark}
                    geoProfile={geoProfiles?.[ponto.id]}
                    censusProfile={censusProfiles?.[ponto.id]}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <AnimatePresence>
        {showMapModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] flex items-center justify-center p-4"
            onClick={() => setShowMapModal(false)}
          >
            <div className={`absolute inset-0 ${isDark ? 'bg-black/70 backdrop-blur-sm' : 'bg-white/45 backdrop-blur-sm'}`} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className={`relative w-full max-w-[1400px] h-[84vh] rounded-2xl border overflow-hidden ${isDark ? 'bg-[#0b0b0b] border-white/10' : 'bg-white border-neutral-200 shadow-xl'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowMapModal(false)}
                className={`absolute top-3 right-3 z-[700] h-9 w-9 flex items-center justify-center rounded-lg border ${isDark ? 'border-white/15 bg-black/45 text-white hover:bg-black/65' : 'border-neutral-300 bg-white/95 text-neutral-700 hover:bg-neutral-100'}`}
                aria-label="Fechar mapa"
              >
                <i className="ri-close-line" style={{ fontSize: 16 }} />
              </button>

              <Suspense fallback={<div className={`h-full w-full ${isDark ? 'bg-black' : 'bg-white'} flex items-center justify-center text-sm ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Carregando mapa...</div>}>
                <SmartMap
                  pontos={pontos}
                  selectedId={selected?.id}
                  onSelect={handleSelectPoint}
                  onOpenDetails={handleSelectPoint}
                  isDark={isDark}
                  selectedCidades={filters.cidade}
                  cityBounds={cityBounds}
                />
              </Suspense>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Point detail modal */}
      {selected && <PointModal ponto={selected} onClose={() => setSelected(null)} isDark={isDark} geoProfile={geoProfiles?.[selected.id]} censusProfile={censusProfiles?.[selected.id]} />}

      {/* Favorites bar */}
      <FavoritesBar isDark={isDark} />
    </div>
  );
}

function MarketBenchmarksPanel({ suggestion, isDark = true }) {
  const [expanded, setExpanded] = useState(false);

  const metrics = useMemo(() => {
    const totals = suggestion?.totals || {};
    const rf = suggestion?.reachFrequency || {};

    const cpm = Number(totals.cpmEstimado || 0);
    const freq = Number(rf.avgFrequency || 0);
    const reach = Number(rf.effectiveReachPct || 0);
    const grps = Number(rf.grps || 0);

    return [
      {
        key: 'cpm',
        label: 'Custo por mil pessoas impactadas',
        benchmark: 'R$ 8 - R$ 35',
        status: cpm > 0 ? (cpm >= 8 && cpm <= 35 ? 'ok' : 'warn') : 'none',
      },
      {
        key: 'freq',
        label: 'Frequência média',
        benchmark: '3x-7x por 4 semanas',
        status: freq > 0 ? (freq >= 3 ? 'ok' : 'warn') : 'none',
      },
      {
        key: 'reach',
        label: 'Alcance estimado',
        benchmark: '5%-15% do mercado local',
        status: reach > 0 ? (reach >= 5 ? 'ok' : 'warn') : 'none',
      },
      {
        key: 'grps',
        label: 'Impacto estimado da campanha',
        benchmark: '50 GRPs / 4 semanas',
        status: grps > 0 ? (grps >= 50 ? 'ok' : 'warn') : 'none',
      },
      {
        key: 'viewability',
        label: 'Viewability (DOOH)',
        benchmark: '100% share-of-time na janela',
        status: 'none',
      },
      {
        key: 'dwell',
        label: 'Dwell time indoor',
        benchmark: '3-8 minutos em média',
        status: 'none',
      },
      {
        key: 'recall',
        label: 'Brand recall (OOH)',
        benchmark: '38%-47% recall espontâneo',
        status: 'none',
      },
    ];
  }, [suggestion]);

  return (
    <section className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50'}`}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`inline-flex items-center gap-2 text-sm ${isDark ? 'text-gray-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-800'}`}
      >
        <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        ▼ Insights avançados de mídia (para especialistas)
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {metrics.map((metric) => (
                <div key={metric.key} className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-white'}`}>
                  <div className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-neutral-500'}`}>{metric.label}</div>
                  <div className={`mt-1 text-base font-semibold ${isDark ? 'text-white' : 'text-neutral-800'}`}>{metric.benchmark}</div>
                  {metric.status === 'ok' ? (
                    <div className="mt-2 inline-flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle size={12} />
                      Dentro do benchmark
                    </div>
                  ) : null}
                  {metric.status === 'warn' ? (
                    <div className="mt-2 inline-flex items-center gap-1 text-xs text-[#E8591A]">
                      <AlertCircle size={12} />
                      Abaixo do recomendado
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className={`mt-4 text-xs ${isDark ? 'text-gray-500' : 'text-neutral-500'}`}>
              Fontes: OAAA, WOO - World Out of Home Organization, CENP-Meios 2024
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
