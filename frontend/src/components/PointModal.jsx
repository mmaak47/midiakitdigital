import { motion, AnimatePresence } from 'framer-motion';
import {
  X, MapPin, Clock, Users, Monitor, Play, RotateCcw, Hash,
  DollarSign, Heart, Building2
} from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';

export default function PointModal({ ponto, onClose }) {
  if (!ponto) return null;

  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const fav = isFavorite(ponto.id);

  const formatCurrency = (n) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

  const formatNumber = (n) =>
    new Intl.NumberFormat('pt-BR').format(n);

  const details = [
    { icon: MapPin, label: 'Endereço', value: ponto.endereco },
    { icon: Clock, label: 'Horário', value: ponto.horario },
    { icon: Users, label: 'Fluxo mensal', value: formatNumber(ponto.fluxo) + ' pessoas' },
    { icon: Hash, label: 'Inserções mensais', value: formatNumber(ponto.insercoes) },
    { icon: Play, label: 'Tempo do anúncio', value: ponto.tempo },
    { icon: RotateCcw, label: 'Loop', value: ponto.loop },
    { icon: Monitor, label: 'Veiculação', value: ponto.veiculacao },
    { icon: Monitor, label: 'Quantidade de telas', value: ponto.telas },
    { icon: Users, label: 'Público', value: `Classe ${ponto.publico}` },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-brand-dark border border-white/10 rounded-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/60 hover:text-white transition-all backdrop-blur-sm"
          >
            <X size={18} />
          </button>

          <div className="flex flex-col lg:flex-row">
            {/* Image */}
            <div className="lg:w-1/2 relative h-64 lg:h-auto lg:min-h-[500px] bg-brand-gray-900">
              {ponto.imagem ? (
                <img
                  src={ponto.imagem}
                  alt={ponto.nome}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-gray-900 to-brand-gray-800">
                  <Building2 size={64} className="text-brand-gray-700" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="lg:w-1/2 p-6 lg:p-8">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <span className="inline-block px-2.5 py-1 rounded-lg bg-brand-orange/10 text-brand-orange text-xs font-medium mb-3">
                    {ponto.tipo}
                  </span>
                  <h2 className="text-2xl lg:text-3xl font-bold text-white">
                    {ponto.nome}
                  </h2>
                </div>
              </div>

              <p className="text-brand-gray-400 text-sm flex items-center gap-1.5 mb-6">
                <MapPin size={14} />
                {ponto.cidade}
              </p>

              {ponto.descricao && (
                <p className="text-brand-gray-400 text-sm leading-relaxed mb-6 pb-6 border-b border-white/5">
                  {ponto.descricao}
                </p>
              )}

              {/* Details grid */}
              <div className="space-y-3 mb-8">
                {details.map(({ icon: Icon, label, value }) => (
                  value && (
                    <div key={label} className="flex items-start gap-3">
                      <Icon size={16} className="text-brand-orange mt-0.5 shrink-0" />
                      <div>
                        <div className="text-[11px] text-brand-gray-500 uppercase tracking-wider">{label}</div>
                        <div className="text-sm text-white">{value}</div>
                      </div>
                    </div>
                  )
                ))}
              </div>

              {/* Price */}
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={16} className="text-brand-orange" />
                  <span className="text-xs text-brand-gray-500 uppercase tracking-wider">Investimento mensal</span>
                </div>
                <div className="text-3xl font-bold text-white">
                  {formatCurrency(ponto.preco)}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => fav ? removeFavorite(ponto.id) : addFavorite(ponto)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all duration-200 ${
                    fav
                      ? 'bg-brand-orange text-white hover:bg-brand-orange-hover'
                      : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                  }`}
                >
                  <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
                  {fav ? 'No seu plano' : 'Adicionar ao plano'}
                </button>
              </div>

              {/* Coordinates */}
              {ponto.lat && ponto.lng && (
                <div className="mt-4 text-[11px] text-brand-gray-600">
                  Coordenadas: {ponto.lat}, {ponto.lng}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
