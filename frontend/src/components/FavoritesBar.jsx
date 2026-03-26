import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ChevronUp, Trash2, FileText } from 'lucide-react';
import { useState } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import ProposalModal from './ProposalModal';

export default function FavoritesBar({ isDark = true }) {
  const { favorites, removeFavorite, clearFavorites, totalPreco, totalFluxo, totalTelas } = useFavorites();
  const [expanded, setExpanded] = useState(false);
  const [showProposal, setShowProposal] = useState(false);

  if (favorites.length === 0) return null;

  const formatCurrency = (n) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

  const formatNumber = (n) =>
    new Intl.NumberFormat('pt-BR').format(n);

  return (
    <>
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        className={`fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl border-t ${isDark ? 'bg-brand-dark/95 border-white/10' : 'bg-[#f1f2f4]/96 border-neutral-300'}`}
      >
        {/* Expanded list */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="max-w-6xl mx-auto px-6 py-4 space-y-2 max-h-60 overflow-y-auto">
                {favorites.map(p => (
                  <div key={p.id} className={`flex items-center justify-between rounded-xl px-4 py-3 ${isDark ? 'bg-white/[0.03] border border-white/5' : 'bg-white border border-neutral-200'}`}>
                    <div>
                      <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>{p.nome}</span>
                      <span className={`text-xs ml-2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{p.cidade} · {p.tipo}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-brand-orange">{formatCurrency(p.preco)}</span>
                      <button
                        onClick={() => removeFavorite(p.id)}
                        className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-500 hover:text-red-400' : 'hover:bg-neutral-100 text-neutral-500 hover:text-red-500'}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bar */}
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 group"
          >
            <div className="relative">
              <Heart size={20} className="text-brand-orange" fill="currentColor" />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand-orange rounded-full text-[10px] font-bold flex items-center justify-center">
                {favorites.length}
              </span>
            </div>
            <div className="text-left">
              <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                {favorites.length} ponto{favorites.length > 1 ? 's' : ''} selecionado{favorites.length > 1 ? 's' : ''}
              </div>
              <div className={`text-[11px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                {totalTelas} telas · {formatNumber(totalFluxo)} pessoas/mês
              </div>
            </div>
            <ChevronUp size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''} ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`} />
          </button>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Total mensal</div>
              <div className={`text-lg font-bold font-heading ${isDark ? 'text-white' : 'text-neutral-900'}`}>{formatCurrency(totalPreco)}</div>
            </div>

            <button
              onClick={() => setShowProposal(true)}
              className="orange-solid-btn flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-sm"
            >
              <FileText size={16} />
              <span className="hidden sm:inline">Gerar proposta</span>
              <span className="sm:hidden">Proposta</span>
            </button>

            <button
              onClick={clearFavorites}
              className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-500 hover:text-red-400' : 'hover:bg-neutral-100 text-neutral-500 hover:text-red-500'}`}
              title="Limpar seleção"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </motion.div>

      {showProposal && <ProposalModal onClose={() => setShowProposal(false)} isDark={isDark} />}
    </>
  );
}
