import { motion } from 'framer-motion';
import { MapPin, Users, Monitor, Heart } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import { getPrimaryPointScreenImage } from '../lib/pointImages';

const typeBadgeClass = 'bg-brand-orange/12 text-brand-orange border-brand-orange/30';

function getPointTypeLabel(ponto) {
  if (!ponto) return '';
  if (ponto.tipo === 'Elevador' && ponto.elevador_categoria) {
    return `Elevador - ${ponto.elevador_categoria}`;
  }
  return ponto.tipo || '';
}

export default function PointCard({ ponto, onSelect, index = 0, isDark = true }) {
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const fav = isFavorite(ponto.id);
  const displayImage = getPrimaryPointScreenImage(ponto);

  const formatNumber = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
    return n.toString();
  };

  const formatCurrency = (n) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  };

  const focusX = Number.isFinite(Number(ponto.imagem_foco_x)) ? Number(ponto.imagem_foco_x) : 50;
  const focusY = Number.isFinite(Number(ponto.imagem_foco_y)) ? Number(ponto.imagem_foco_y) : 50;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer ${isDark ? 'bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/10 shadow-lg shadow-black/20 hover:shadow-2xl hover:shadow-brand-orange/5 hover:border-brand-orange/30 hover:bg-gradient-to-br hover:from-white/[0.08] hover:to-white/[0.02]' : 'bg-white border border-neutral-200 shadow-sm hover:shadow-md hover:border-brand-orange/35'}`}
      onClick={() => onSelect(ponto)}
    >
      {/* Image */}
      <div className={`relative h-40 sm:h-44 md:h-48 overflow-hidden ${isDark ? 'bg-brand-gray-900' : 'bg-[#eef1f5]'}`}>
        {displayImage ? (
          <img
            src={displayImage}
            alt={ponto.nome}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            style={{ objectPosition: `${focusX}% ${focusY}%` }}
            loading="lazy"
            width="640"
            height="360"
          />
        ) : (
          <div className={`point-no-image w-full h-full flex items-center justify-center ${isDark ? 'bg-gradient-to-br from-brand-gray-900 to-brand-gray-800' : 'bg-gradient-to-br from-[#f4f6f9] to-[#eceff3]'}`}>
            <Monitor size={40} className={isDark ? 'text-brand-gray-700' : 'text-neutral-400'} />
          </div>
        )}

        {/* Type badge */}
        <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-lg text-xs font-semibold border backdrop-blur-sm ${typeBadgeClass}`}>
          {getPointTypeLabel(ponto)}
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
                : isDark ? 'bg-black/40 text-white/60 hover:text-white hover:bg-black/60' : 'bg-white/90 text-neutral-500 hover:text-neutral-800 hover:bg-white'
          }`}
        >
          <Heart size={14} fill={fav ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className={`font-bold text-lg mb-2 group-hover:text-brand-orange transition-colors line-clamp-2 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
          {ponto.nome}
        </h3>

        <div className={`flex items-center gap-1.5 text-xs mb-3.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
          <MapPin size={12} />
          {ponto.cidade}
        </div>

        {/* Tags */}
        <div className={`flex items-center gap-3 text-xs mb-4 pb-3 border-b ${isDark ? 'text-brand-gray-500 border-white/5' : 'text-neutral-500 border-neutral-200'}`}>
          <span className={`flex items-center gap-1.5 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
            <Users size={13} className="text-brand-orange" />
            {ponto.publico}
          </span>
          <span className={`flex items-center gap-1.5 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
            <Monitor size={13} className="text-brand-orange" />
            {ponto.telas}T
          </span>
          <span className={`ml-auto ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{formatNumber(ponto.fluxo)}/mês</span>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <div className={`text-lg font-bold font-heading ${isDark ? 'text-white' : 'text-neutral-900'}`}>{formatCurrency(ponto.preco)}</div>
            <div className={`text-[11px] font-medium ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>mês</div>
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
