import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, Building2, Tv, Monitor, Lightbulb, Sun, Columns3,
  ShoppingCart, Fuel, Search, X, SlidersHorizontal
} from 'lucide-react';
import { fetchPublicos } from '../lib/api';

const CIDADES = ['Londrina', 'Maringá', 'Balneário Camboriú', 'Itajaí'];
const TIPOS = [
  { value: 'Elevador', icon: Building2, help: 'Telas em elevadores residenciais e comerciais.' },
  { value: 'Tela Indoor', icon: Tv, help: 'Painéis em ambientes internos com fluxo constante.' },
  { value: 'Painel LED', icon: Monitor, help: 'Painel digital externo de alto impacto visual.' },
  { value: 'Totem Digital', icon: Columns3, help: 'Tela vertical digital em pontos de circulação.' },
  { value: 'Circuito Muffato', icon: ShoppingCart, help: 'Rede de telas em supermercados do grupo.' },
  { value: 'LED Posto', icon: Fuel, help: 'Mídia digital em postos de combustível.' },
  { value: 'Video Wall', icon: Monitor, help: 'Conjunto de telas formando um painel maior.' },
  { value: 'Backlight', icon: Lightbulb, help: 'Painel iluminado por trás, visível à noite.' },
  { value: 'Frontlight', icon: Sun, help: 'Painel iluminado por refletores frontais.' },
];

export default function FilterSidebar({ filters, setFilters, total, mobileOpen, setMobileOpen, isDark = true }) {
  const [publicos, setPublicos] = useState([]);

  useEffect(() => {
    fetchPublicos().then(setPublicos).catch(() => setPublicos([]));
  }, []);
  const hasFilters = filters.cidade.length || filters.tipo || filters.elevador_categoria || filters.publico.length || filters.search;

  const updateFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter(item => item !== value)
        : [...prev[key], value]
    }));
  };

  const toggleTipo = (value) => {
    setFilters((prev) => ({
      ...prev,
      tipo: prev.tipo === value ? '' : value,
      elevador_categoria: (prev.tipo === value || value !== 'Elevador') ? '' : prev.elevador_categoria
    }));
  };

  const clearAll = () => {
    setFilters({ cidade: [], tipo: '', elevador_categoria: '', publico: [], search: '' });
  };

  const content = (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} />
        <input
          type="text"
          placeholder="Buscar ponto..."
          value={filters.search}
          onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
          className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-brand-orange/40 transition-colors ${isDark ? 'bg-white/5 border border-white/10 text-white placeholder:text-brand-gray-500' : 'bg-neutral-100 border border-neutral-200 text-neutral-900 placeholder:text-neutral-400'}`}
        />
      </div>

      {/* Result count + clear */}
      <div className="flex items-center justify-between">
        <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
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
        <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
          Cidade
        </h3>
        <div className="space-y-1">
          {CIDADES.map(cidade => (
            <button
              key={cidade}
              onClick={() => updateFilter('cidade', cidade)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                filters.cidade.includes(cidade)
                  ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/20'
                  : isDark
                    ? 'text-brand-gray-300 hover:bg-white/5 border border-transparent'
                    : 'text-neutral-600 hover:bg-neutral-100 border border-transparent'
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
        <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
          Tipo
        </h3>
        <div className="space-y-1">
          {TIPOS.map(({ value, icon: Icon, help }) => (
            <button
              key={value}
              onClick={() => toggleTipo(value)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                filters.tipo === value
                  ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/20'
                  : isDark
                    ? 'text-brand-gray-300 hover:bg-white/5 border border-transparent'
                    : 'text-neutral-600 hover:bg-neutral-100 border border-transparent'
              }`}
            >
              <Icon size={14} />
              <span className="text-left">
                <span className="block">{value}</span>
                <span className={`block text-[11px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{help}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {filters.tipo === 'Elevador' && (
        <div>
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            Categoria do Elevador
          </h3>
          <div className="flex flex-wrap gap-2">
            {['Comercial', 'Residencial'].map((categoria) => (
              <button
                key={categoria}
                onClick={() => setFilters((prev) => ({
                  ...prev,
                  elevador_categoria: prev.elevador_categoria === categoria ? '' : categoria
                }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  filters.elevador_categoria === categoria
                    ? 'bg-brand-orange text-white'
                    : isDark
                      ? 'bg-white/5 text-brand-gray-400 hover:bg-white/10 border border-white/5'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 border border-neutral-200'
                }`}
              >
                {categoria}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Público */}
      {publicos.length > 0 && (
        <div>
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            Público
          </h3>
          <div className="flex flex-wrap gap-2">
            {publicos.map(p => (
              <button
                key={p}
                onClick={() => updateFilter('publico', p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  filters.publico.includes(p)
                    ? 'bg-brand-orange text-white'
                    : isDark
                      ? 'bg-white/5 text-brand-gray-400 hover:bg-white/10 border border-white/5'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 border border-neutral-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`hidden lg:block w-72 shrink-0 border-r p-6 overflow-y-auto h-full ${isDark ? 'border-white/5' : 'border-neutral-200 bg-white'}`}>
        <div className="flex items-center gap-2 mb-6">
          <SlidersHorizontal size={16} className="text-brand-orange" />
          <h2 className={`font-semibold text-sm uppercase tracking-wider ${isDark ? '' : 'text-neutral-700'}`}>Filtros</h2>
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
            className={`absolute left-0 top-0 bottom-0 w-80 border-r p-6 overflow-y-auto ${isDark ? 'bg-brand-dark border-white/10' : 'bg-white border-neutral-200'}`}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-brand-orange" />
                <h2 className={`font-semibold text-sm uppercase tracking-wider ${isDark ? '' : 'text-neutral-700'}`}>Filtros</h2>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-neutral-100'}`}
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
