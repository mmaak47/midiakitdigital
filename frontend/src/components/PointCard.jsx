import { motion } from 'framer-motion';
import { MapPin, Users, Monitor, Heart } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';

const typeBadgeClass = 'bg-brand-orange/12 text-brand-orange border-brand-orange/30';

export default function PointCard({ ponto, onSelect, index = 0 }) {
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const fav = isFavorite(ponto.id);

  const formatNumber = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
    return n.toString();
  };

  const formatCurrency = (n) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group relative bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/10 rounded-2xl overflow-hidden shadow-lg shadow-black/20 hover:shadow-2xl hover:shadow-brand-orange/5 hover:border-brand-orange/30 hover:bg-gradient-to-br hover:from-white/[0.08] hover:to-white/[0.02] transition-all duration-300 cursor-pointer"
      onClick={() => onSelect(ponto)}
    >
      {/* Image */}
      <div className="relative h-44 bg-brand-gray-900 overflow-hidden">
        {ponto.imagem ? (
          <img
            src={ponto.imagem}
            alt={ponto.nome}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-gray-900 to-brand-gray-800">
            <Monitor size={40} className="text-brand-gray-700" />
          </div>
        )}

        {/* Type badge */}
        <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-lg text-xs font-semibold border backdrop-blur-sm ${typeBadgeClass}`}>
          {ponto.tipo}
        </div>

        {/* Favorite button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            fav ? removeFavorite(ponto.id) : addFavorite(ponto);
          }}
          className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-sm transition-all duration-200 ${
            fav
              ? 'bg-brand-orange text-white'
              : 'bg-black/40 text-white/60 hover:text-white hover:bg-black/60'
          }`}
        >
          <Heart size={14} fill={fav ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-bold text-lg text-white mb-2 group-hover:text-brand-orange transition-colors line-clamp-2">
          {ponto.nome}
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-brand-gray-400 mb-3.5">
          <MapPin size={12} />
          {ponto.cidade}
        </div>

        {/* Tags */}
        <div className="flex items-center gap-3 text-xs text-brand-gray-500 mb-4 pb-3 border-b border-white/5">
          <span className="flex items-center gap-1.5 text-brand-gray-300">
            <Users size={13} className="text-brand-orange" />
            {ponto.publico}
          </span>
          <span className="flex items-center gap-1.5 text-brand-gray-300">
            <Monitor size={13} className="text-brand-orange" />
            {ponto.telas}T
          </span>
          <span className="text-brand-gray-400 ml-auto">{formatNumber(ponto.fluxo)}/mês</span>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <div className="text-lg font-bold font-heading text-white">{formatCurrency(ponto.preco)}</div>
            <div className="text-[11px] text-brand-gray-500 font-medium">mês</div>
          </div>
          <span className="text-xs text-brand-orange font-semibold group-hover:text-brand-orange-hover transition-colors flex items-center gap-1">
            Visualizar
            <span className="group-hover:translate-x-0.5 transition-transform">→</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}
