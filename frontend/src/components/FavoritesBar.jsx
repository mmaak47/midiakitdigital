import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ShoppingCart, Trash2, FileText, X, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import ProposalModal from './ProposalModal';

const SIDEBAR_WIDTH = 'w-80'; // 320px

export default function FavoritesBar({ isDark = true }) {
  const { favorites, removeFavorite, clearFavorites, totalPreco, totalFluxo, totalTelas } = useFavorites();
  const [collapsed, setCollapsed] = useState(false);
  const [showProposal, setShowProposal] = useState(false);

  const formatCurrency = (n) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

  const formatNumber = (n) =>
    new Intl.NumberFormat('pt-BR').format(n);

  if (favorites.length === 0) return null;

  /* Collapsed — floating tab on the right edge */
  if (collapsed) {
    return (
      <>
        <motion.button
          initial={{ x: 60 }}
          animate={{ x: 0 }}
          exit={{ x: 60 }}
          onClick={() => setCollapsed(false)}
          className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-2 pl-3 pr-2 py-3 rounded-l-xl border-l border-t border-b shadow-lg transition-colors ${isDark ? 'bg-brand-dark/95 border-white/10 hover:bg-white/10' : 'bg-white border-neutral-200 hover:bg-neutral-50 shadow-neutral-200'}`}
        >
          <ShoppingCart size={18} className="text-brand-orange" />
          <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-neutral-800'}`}>{favorites.length}</span>
          <ChevronRight size={14} className={`rotate-180 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} />
        </motion.button>
        {showProposal && <ProposalModal onClose={() => setShowProposal(false)} isDark={isDark} />}
      </>
    );
  }

  return (
    <>
      <motion.aside
        initial={{ x: 320 }}
        animate={{ x: 0 }}
        exit={{ x: 320 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`fixed top-16 right-0 bottom-0 ${SIDEBAR_WIDTH} z-40 flex flex-col border-l backdrop-blur-xl ${isDark ? 'bg-brand-dark/[0.97] border-white/10' : 'bg-white/[0.98] border-neutral-200 shadow-xl'}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <ShoppingCart size={18} className="text-brand-orange" />
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-brand-orange rounded-full text-[10px] font-bold flex items-center justify-center text-white px-1">
                {favorites.length}
              </span>
            </div>
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              Meu plano
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearFavorites}
              className={`p-1.5 rounded-lg transition-colors text-[11px] ${isDark ? 'hover:bg-white/10 text-brand-gray-500 hover:text-red-400' : 'hover:bg-neutral-100 text-neutral-400 hover:text-red-500'}`}
              title="Limpar tudo"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-500' : 'hover:bg-neutral-100 text-neutral-400'}`}
              title="Recolher"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <div className={`px-4 py-2.5 border-b text-[11px] flex items-center justify-between ${isDark ? 'border-white/5 text-brand-gray-500' : 'border-neutral-100 text-neutral-500'}`}>
          <span>{totalTelas} pontos de impacto</span>
          <span>·</span>
          <span>{formatNumber(totalFluxo)} pessoas/mês</span>
        </div>

        {/* Items list — scrollable */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {favorites.map((p) => (
            <div
              key={p.id}
              className={`group flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition-colors ${isDark ? 'hover:bg-white/[0.04] border border-transparent hover:border-white/5' : 'hover:bg-neutral-50 border border-transparent hover:border-neutral-100'}`}
            >
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-medium truncate ${isDark ? 'text-white' : 'text-neutral-800'}`}>
                  {p.nome}
                </div>
                <div className={`text-[10px] mt-0.5 truncate ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                  {p.cidade} · {p.tipo}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[11px] font-semibold text-brand-orange whitespace-nowrap">
                  {formatCurrency(p.preco)}
                </span>
                <button
                  onClick={() => removeFavorite(p.id)}
                  className={`p-1 rounded transition-all opacity-0 group-hover:opacity-100 ${isDark ? 'hover:bg-white/10 text-brand-gray-500 hover:text-red-400' : 'hover:bg-neutral-100 text-neutral-400 hover:text-red-500'}`}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer — total + CTA */}
        <div className={`px-4 py-4 border-t space-y-3 ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Total mensal</span>
            <span className={`text-lg font-bold font-heading ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              {formatCurrency(totalPreco)}
            </span>
          </div>
          <button
            onClick={() => setShowProposal(true)}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] text-sm"
          >
            <FileText size={16} />
            Gerar proposta
          </button>
        </div>
      </motion.aside>

      {showProposal && <ProposalModal onClose={() => setShowProposal(false)} isDark={isDark} />}
    </>
  );
}
