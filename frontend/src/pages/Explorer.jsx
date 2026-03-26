import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
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

export default function Explorer() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('intermidia_theme') !== 'light';
  });
  const [searchParams] = useSearchParams();
  const initialCidade = searchParams.getAll('cidade');

  const [pontos, setPontos] = useState([]);
  const [allPontos, setAllPontos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ cidade: initialCidade, tipo: '', publico: [], search: '' });
  const [view, setView] = useState('grid');
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

  const handleSelectPoint = (ponto) => {
    registerView(ponto);
    setSelected(ponto);
  };

  return (
    <div
      className={`min-h-screen ${isDark ? 'bg-black text-white' : 'commercial-light bg-[#f4f5f7] text-neutral-900'}`}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <Navbar commercial />

      <div className="pt-16 flex h-screen">
        <FilterSidebar
          filters={filters}
          setFilters={setFilters}
          total={pontos.length}
          mobileOpen={mobileFilters}
          setMobileOpen={setMobileFilters}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-28">
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
          <div className={`sticky top-0 z-10 backdrop-blur-xl border-b px-6 py-3 flex items-center justify-between ${isDark ? 'bg-black/80 border-white/5' : 'bg-white/90 border-neutral-200 shadow-sm'}`}>
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
                  view === 'grid'
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
                onClick={() => setView('map')}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  view === 'map'
                    ? 'bg-brand-orange text-white'
                    : isDark
                      ? 'text-brand-gray-400 hover:text-white'
                      : 'text-neutral-500 hover:text-neutral-900 hover:bg-white'
                }`}
                title="Visualização em mapa"
              >
                <Map size={16} />
              </button>
              <button
                onClick={() => setIsDark((prev) => !prev)}
                className={`p-2 rounded-lg transition-all duration-200 ${isDark ? 'text-brand-gray-400 hover:text-white hover:bg-white/10' : 'text-neutral-500 hover:text-neutral-900 hover:bg-white'}`}
                title={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
                aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              >
                <i className={isDark ? 'ri-sun-line' : 'ri-moon-line'} style={{ fontSize: 16 }} />
              </button>
            </div>
          </div>

          <div className="p-6">
            {view === 'grid' ? (
              <>
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
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="h-[calc(100vh-180px)]">
                <SmartMap
                  pontos={pontos}
                  selectedId={selected?.id}
                  onSelect={handleSelectPoint}
                  onOpenDetails={handleSelectPoint}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Point detail modal */}
      {selected && <PointModal ponto={selected} onClose={() => setSelected(null)} />}

      {/* Favorites bar */}
      <FavoritesBar />
    </div>
  );
}
