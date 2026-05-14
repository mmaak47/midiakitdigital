import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle, ChevronDown, LayoutGrid, Map, Search, SlidersHorizontal, Sparkles, EyeOff } from 'lucide-react';
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
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('intermidia_theme') === 'dark';
  });
  const [searchParams] = useSearchParams();
  const initialCidade = searchParams.getAll('cidade');

  const [pontos, setPontos] = useState([]);
  const [allPontos, setAllPontos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ cidade: initialCidade, tipo: '', elevador_categoria: [], publico: [], search: '' });
  const [view, setView] = useState('grid');
  const [sortBy, setSortBy] = useState('relevancia'); // relevancia | preco-asc | preco-desc | telas-desc | nome-asc
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [plannerSuggestion, setPlannerSuggestion] = useState(null);
  const [showAutomatic, setShowAutomatic] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('intermidia_explorer_auto') === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('intermidia_explorer_auto', showAutomatic ? '1' : '0');
  }, [showAutomatic]);
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

  // Sort the filtered points
  const sortedPontos = useMemo(() => {
    if (!pontos.length) return pontos;
    const arr = [...pontos];
    switch (sortBy) {
      case 'preco-asc':
        return arr.sort((a, b) => (Number(a.preco) || 0) - (Number(b.preco) || 0));
      case 'preco-desc':
        return arr.sort((a, b) => (Number(b.preco) || 0) - (Number(a.preco) || 0));
      case 'telas-desc':
        return arr.sort((a, b) => (Number(b.telas) || 0) - (Number(a.telas) || 0));
      case 'nome-asc':
        return arr.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
      case 'relevancia':
      default:
        return arr;
    }
  }, [pontos, sortBy]);

  // Applied filters summary
  const appliedFilterChips = useMemo(() => {
    const chips = [];
    if (filters.search) chips.push({ key: 'search', label: `Busca: ${filters.search}`, remove: () => setFilters((f) => ({ ...f, search: '' })) });
    if (filters.cidade?.length) {
      filters.cidade.forEach((c) => {
        chips.push({ key: `cidade-${c}`, label: c, remove: () => setFilters((f) => ({ ...f, cidade: f.cidade.filter((x) => x !== c) })) });
      });
    }
    if (filters.tipo) chips.push({ key: 'tipo', label: filters.tipo, remove: () => setFilters((f) => ({ ...f, tipo: '' })) });
    const elvCats = Array.isArray(filters.elevador_categoria) ? filters.elevador_categoria : (filters.elevador_categoria ? [filters.elevador_categoria] : []);
    elvCats.forEach((cat) => chips.push({ key: `elv-${cat}`, label: cat, remove: () => setFilters((f) => ({ ...f, elevador_categoria: (Array.isArray(f.elevador_categoria) ? f.elevador_categoria : []).filter((c) => c !== cat) })) }));
    if (filters.publico?.length) {
      filters.publico.forEach((p) => {
        chips.push({ key: `publico-${p}`, label: p, remove: () => setFilters((f) => ({ ...f, publico: f.publico.filter((x) => x !== p) })) });
      });
    }
    return chips;
  }, [filters]);

  const clearAllFilters = useCallback(() => {
    setFilters({ cidade: [], tipo: '', elevador_categoria: [], publico: [], search: '' });
  }, []);

  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setShowSortMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSortMenu]);

  const sortOptions = [
    { value: 'relevancia', label: 'Relevância (padrão)' },
    { value: 'preco-asc', label: 'Menor preço' },
    { value: 'preco-desc', label: 'Maior preço' },
    { value: 'telas-desc', label: 'Mais telas' },
    { value: 'nome-asc', label: 'Nome (A-Z)' },
  ];
  const currentSortLabel = sortOptions.find((o) => o.value === sortBy)?.label || 'Ordenar';

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
          cidades={cidades}
        />

        {/* Main content */}
        <main ref={mainRef} className={`flex-1 overflow-y-auto transition-[margin] duration-300 ${favorites.length > 0 ? 'mr-80' : ''}`}>
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

            {!showAutomatic && (
              <section
                className={`rounded-2xl border p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                  isDark
                    ? 'border-brand-orange/30 bg-gradient-to-br from-brand-orange/10 via-white/[0.02] to-transparent'
                    : 'border-orange-200 bg-gradient-to-br from-orange-50 via-white to-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-brand-orange/15 flex items-center justify-center shrink-0">
                    <Sparkles size={20} className="text-brand-orange" />
                  </div>
                  <div>
                    <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Você quer uma campanha automática?</h2>
                    <p className={`text-sm mt-1 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                      Receba sugestões inteligentes, métricas de eficiência comercial, planejamento estratégico e pontos de impacto recomendados — tudo calculado a partir do seu inventário.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAutomatic(true)}
                  className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-orange hover:bg-brand-orange-hover transition-colors shadow-md shadow-brand-orange/30"
                >
                  <Sparkles size={16} /> Ativar campanha automática
                </button>
              </section>
            )}

            {showAutomatic && (
              <>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAutomatic(false)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      isDark
                        ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                    title="Ocultar planejamento automático"
                  >
                    <EyeOff size={12} /> Ocultar planejamento automático
                  </button>
                </div>

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
                      <CoverageMeter
                        coverage={coverage}
                        selectedCount={selectedForMetrics.length}
                        inventoryCount={cityInventory.length}
                        isDark={isDark}
                      />
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
                <RecommendationEngine pontos={allPontos} geoProfiles={geoProfiles} censusProfiles={censusProfiles} history={history} onApplyCombo={addFavorites} isDark={isDark} />
              </>
            )}
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
                Endereços de Mídia
              </h1>
              <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'text-brand-gray-500 bg-white/5' : 'text-neutral-500 bg-neutral-100 border border-neutral-200'}`}>
                {pontos.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
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

              <div className="relative" ref={sortMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowSortMenu((s) => !s)}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                    isDark
                      ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'
                      : 'bg-white border-neutral-200 text-neutral-700 hover:border-brand-orange/40 hover:text-[#C94A1A]'
                  }`}
                  title="Ordenar resultados"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
                  <span className="hidden sm:inline">{currentSortLabel}</span>
                  <ChevronDown size={12} className={`transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
                </button>
                {showSortMenu && (
                  <div className={`absolute right-0 mt-2 w-56 rounded-xl border shadow-lg z-20 overflow-hidden ${isDark ? 'bg-[#151515] border-white/10' : 'bg-white border-neutral-200'}`}>
                    {sortOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setSortBy(opt.value); setShowSortMenu(false); }}
                        className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between ${
                          sortBy === opt.value
                            ? (isDark ? 'bg-brand-orange/10 text-brand-orange' : 'bg-[#FFF0EA] text-[#C94A1A]')
                            : (isDark ? 'text-white/80 hover:bg-white/5' : 'text-neutral-700 hover:bg-neutral-50')
                        }`}
                      >
                        {opt.label}
                        {sortBy === opt.value && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Applied filters summary bar */}
          {appliedFilterChips.length > 0 && (
            <div className={`px-6 pt-3 pb-2 border-b flex flex-wrap items-center gap-2 ${
              isDark ? 'bg-brand-orange/[0.04] border-white/5' : 'bg-[#FFF8F3] border-neutral-200'
            }`}>
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-brand-orange' : 'text-[#C94A1A]'}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
                {appliedFilterChips.length} filtro{appliedFilterChips.length > 1 ? 's' : ''}
              </span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-neutral-400'}`}>·</span>
              <span className={`text-xs font-medium ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>
                {pontos.length} resultado{pontos.length !== 1 ? 's' : ''}
              </span>

              <div className="flex flex-wrap items-center gap-1.5 ml-1">
                {appliedFilterChips.slice(0, 6).map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.remove}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      isDark
                        ? 'bg-white/10 text-white/80 hover:bg-red-500/20 hover:text-red-300'
                        : 'bg-white text-neutral-700 border border-neutral-200 hover:border-red-300 hover:text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {chip.label}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                ))}
                {appliedFilterChips.length > 6 && (
                  <span className={`text-xs ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>+{appliedFilterChips.length - 6}</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => addFavorites(pontos)}
                disabled={pontos.length === 0}
                className={`ml-auto inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                  pontos.length === 0
                    ? (isDark ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed')
                    : (isDark
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100')
                }`}
                title={`Adicionar todos os ${pontos.length} pontos do filtro à proposta`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Adicionar todos ({pontos.length})
              </button>
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full text-white bg-brand-orange hover:bg-[#E85A25] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Limpar tudo
              </button>
            </div>
          )}

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
                <div className="text-brand-gray-600 mb-4 flex justify-center"><Search size={48} /></div>
                <h3 className="text-xl font-semibold text-brand-gray-300 mb-2">
                  Nenhum endereço encontrado
                </h3>
                <p className="text-brand-gray-500 text-sm">
                  Tente ajustar os filtros para ver mais resultados.
                </p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                {sortedPontos.map((ponto, i) => (
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
                  censusProfiles={censusProfiles}
                />
              </Suspense>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Point detail modal */}
      {selected && <PointModal ponto={selected} onClose={() => setSelected(null)} isDark={isDark} geoProfile={geoProfiles?.[selected.id]} censusProfile={censusProfiles?.[selected.id]} />}

      {/* Favorites bar */}
      <FavoritesBar isDark={isDark} showCommercialShare />
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
