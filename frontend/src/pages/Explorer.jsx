import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, Map, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import FilterSidebar from '../components/FilterSidebar';
import PointCard from '../components/PointCard';
import PointModal from '../components/PointModal';
import SkeletonCard from '../components/SkeletonCard';
import SmartMap from '../components/SmartMap';
import FavoritesBar from '../components/FavoritesBar';
import StrategicPlanner from '../components/StrategicPlanner';
import CoverageMeter from '../components/CoverageMeter';
import CampaignMetrics from '../components/CampaignMetrics';
import CampaignScore from '../components/CampaignScore';
import RecommendationEngine from '../components/RecommendationEngine';
import ImpactSimulator from '../components/ImpactSimulator';
import { fetchPontos } from '../lib/api';
import { useFavorites } from '../context/FavoritesContext';
import { calculateCampaignScore, calculateCoverageLevel, campaignTotals } from '../lib/strategy';
import { computeCityBoundingBoxes } from '../lib/geo';

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
  const { favorites, addFavorites, history, registerView } = useFavorites();

  const cityInventory = allPontos.filter((p) => !filters.cidade.length || filters.cidade.includes(p.cidade));
  const coverage = calculateCoverageLevel(favorites, cityInventory);
  const totals = campaignTotals(favorites);
  const scoreInfo = calculateCampaignScore({
    selected: favorites,
    objective: 'cobertura regional',
    desiredPublico: filters.publico,
    cityInventory
  });

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
    fetchPontos().then(setAllPontos).catch(() => setAllPontos([]));
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

  const handleSelectPoint = (ponto) => {
    registerView(ponto);
    setSelected(ponto);
  };

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
        />

        {/* Main content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto pb-28">
          <div className="px-6 pt-4 space-y-4">
            <StrategicPlanner
              pontos={allPontos}
              cidades={cidades}
              publicos={publicos}
              onAddPlan={addFavorites}
            />

            <div className="grid xl:grid-cols-4 gap-4">
              <div className="xl:col-span-2">
                <CoverageMeter coverage={coverage} />
              </div>
              <CampaignScore scoreInfo={scoreInfo} />
              <ImpactSimulator points={cityInventory} onAdd={addFavorites} />
            </div>

            <CampaignMetrics totals={totals} />
            <RecommendationEngine history={history} onApplyCombo={addFavorites} />
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
                  <SkeletonCard key={i} />
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

              <SmartMap
                pontos={pontos}
                selectedId={selected?.id}
                onSelect={handleSelectPoint}
                onOpenDetails={handleSelectPoint}
                isDark={isDark}
                selectedCidades={filters.cidade}
                cityBounds={cityBounds}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Point detail modal */}
      {selected && <PointModal ponto={selected} onClose={() => setSelected(null)} isDark={isDark} />}

      {/* Favorites bar */}
      <FavoritesBar isDark={isDark} />
    </div>
  );
}
