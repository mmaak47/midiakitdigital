import { motion } from 'framer-motion';
import {
  MapPin, Building2, Tv, UtensilsCrossed, Croissant, Route,
  Search, X, SlidersHorizontal
} from 'lucide-react';

const CIDADES = ['Londrina', 'Maringá', 'Balneário Camboriú', 'Itajaí'];
const TIPOS = [
  { value: 'Elevador', icon: Building2 },
  { value: 'LED', icon: Tv },
  { value: 'Restaurante', icon: UtensilsCrossed },
  { value: 'Padaria', icon: Croissant },
  { value: 'Via Pública', icon: Route },
];
const PUBLICOS = ['A', 'B', 'A/B'];

export default function FilterSidebar({ filters, setFilters, total, mobileOpen, setMobileOpen }) {
  const hasFilters = filters.cidade || filters.tipo || filters.publico || filters.search;

  const updateFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: prev[key] === value ? '' : value
    }));
  };

  const clearAll = () => {
    setFilters({ cidade: '', tipo: '', publico: '', search: '' });
  };

  const content = (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-500" />
        <input
          type="text"
          placeholder="Buscar ponto..."
          value={filters.search}
          onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
          className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-brand-gray-500 focus:outline-none focus:border-brand-orange/40 transition-colors"
        />
      </div>

      {/* Result count + clear */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-brand-gray-500">
          {total} ponto{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
        </span>
        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-xs text-brand-orange hover:text-brand-orange-hover transition-colors"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Cidades */}
      <div>
        <h3 className="text-xs font-semibold text-brand-gray-400 uppercase tracking-wider mb-3">
          Cidade
        </h3>
        <div className="space-y-1">
          {CIDADES.map(cidade => (
            <button
              key={cidade}
              onClick={() => updateFilter('cidade', cidade)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                filters.cidade === cidade
                  ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/20'
                  : 'text-brand-gray-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              <MapPin size={14} />
              {cidade}
            </button>
          ))}
        </div>
      </div>

      {/* Tipo */}
      <div>
        <h3 className="text-xs font-semibold text-brand-gray-400 uppercase tracking-wider mb-3">
          Tipo
        </h3>
        <div className="space-y-1">
          {TIPOS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => updateFilter('tipo', value)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                filters.tipo === value
                  ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/20'
                  : 'text-brand-gray-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon size={14} />
              {value}
            </button>
          ))}
        </div>
      </div>

      {/* Público */}
      <div>
        <h3 className="text-xs font-semibold text-brand-gray-400 uppercase tracking-wider mb-3">
          Público
        </h3>
        <div className="flex gap-2">
          {PUBLICOS.map(p => (
            <button
              key={p}
              onClick={() => updateFilter('publico', p)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                filters.publico === p
                  ? 'bg-brand-orange text-white'
                  : 'bg-white/5 text-brand-gray-400 hover:bg-white/10 border border-white/5'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-72 shrink-0 border-r border-white/5 p-6 overflow-y-auto h-full">
        <div className="flex items-center gap-2 mb-6">
          <SlidersHorizontal size={16} className="text-brand-orange" />
          <h2 className="font-semibold text-sm uppercase tracking-wider">Filtros</h2>
        </div>
        {content}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 lg:hidden"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 25 }}
            className="absolute left-0 top-0 bottom-0 w-80 bg-brand-dark border-r border-white/10 p-6 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-brand-orange" />
                <h2 className="font-semibold text-sm uppercase tracking-wider">Filtros</h2>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            {content}
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
