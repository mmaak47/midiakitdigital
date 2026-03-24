import { motion } from 'framer-motion';
import { X, FileText, MapPin, Monitor, Users, TrendingUp, Download } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';

export default function ProposalModal({ onClose }) {
  const { favorites, totalPreco, totalFluxo, totalTelas } = useFavorites();

  const formatCurrency = (n) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

  const formatNumber = (n) =>
    new Intl.NumberFormat('pt-BR').format(n);

  const cidades = [...new Set(favorites.map(p => p.cidade))];
  const totalInsercoes = favorites.reduce((sum, p) => sum + (p.insercoes || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-brand-dark border border-white/10 rounded-2xl"
        onClick={e => e.stopPropagation()}
        id="proposal-content"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/60 hover:text-white transition-all"
        >
          <X size={18} />
        </button>

        <div className="p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <FileText size={24} className="text-brand-orange" />
            <h2 className="text-2xl font-bold text-white">Proposta de Mídia</h2>
          </div>
          <p className="text-brand-gray-400 text-sm mb-8">
            Plano personalizado — Intermidia OOH & DOOH
          </p>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[
              { icon: MapPin, label: 'Pontos', value: favorites.length },
              { icon: Monitor, label: 'Telas', value: totalTelas },
              { icon: Users, label: 'Alcance/mês', value: formatNumber(totalFluxo) },
              { icon: TrendingUp, label: 'Inserções/mês', value: formatNumber(totalInsercoes) }
            ].map(item => (
              <div key={item.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center">
                <item.icon size={18} className="text-brand-orange mx-auto mb-2" />
                <div className="text-lg font-bold font-heading text-white">{item.value}</div>
                <div className="text-[10px] text-brand-gray-500 uppercase tracking-wider">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-brand-gray-400 uppercase tracking-wider mb-2">
              Cobertura por cidade
            </h3>
            <div className="flex flex-wrap gap-2">
              {cidades.map(c => (
                <span key={c} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-brand-gray-300">
                  {c} ({favorites.filter(p => p.cidade === c).length} pontos)
                </span>
              ))}
            </div>
          </div>

          {/* Points table */}
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-brand-gray-400 uppercase tracking-wider mb-3">
              Pontos selecionados
            </h3>
            <div className="border border-white/5 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-white/5">
                    <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs">Ponto</th>
                    <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs hidden md:table-cell">Cidade</th>
                    <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs hidden md:table-cell">Tipo</th>
                    <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs">Telas</th>
                    <th className="text-right px-4 py-3 text-brand-gray-400 font-medium text-xs">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {favorites.map((p, i) => (
                    <tr key={p.id} className={`border-b border-white/5 ${i % 2 ? 'bg-white/[0.01]' : ''}`}>
                      <td className="px-4 py-3 text-white font-medium">{p.nome}</td>
                      <td className="px-4 py-3 text-brand-gray-400 hidden md:table-cell">{p.cidade}</td>
                      <td className="px-4 py-3 text-brand-gray-400 hidden md:table-cell">{p.tipo}</td>
                      <td className="px-4 py-3 text-brand-gray-400">{p.telas}</td>
                      <td className="px-4 py-3 text-brand-orange font-semibold text-right">{formatCurrency(p.preco)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total */}
          <div className="bg-brand-orange/5 border border-brand-orange/20 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-brand-gray-400 mb-1">Investimento mensal total</div>
                <div className="text-3xl font-bold font-heading text-white">{formatCurrency(totalPreco)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-brand-gray-400 mb-1">Alcance estimado</div>
                <div className="text-2xl font-bold font-heading text-brand-orange">{formatNumber(totalFluxo)}</div>
                <div className="text-xs text-brand-gray-500">pessoas/mês</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
            >
              <Download size={18} />
              Exportar / Imprimir
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3.5 bg-white/5 border border-white/10 text-white font-medium rounded-xl hover:bg-white/10 transition-all"
            >
              Fechar
            </button>
          </div>

          {/* Footer note */}
          <p className="text-center text-[10px] text-brand-gray-600 mt-6">
            Proposta gerada automaticamente pelo Mídia Kit Digital da Intermidia.
            Valores sujeitos a negociação. Consulte condições comerciais.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
