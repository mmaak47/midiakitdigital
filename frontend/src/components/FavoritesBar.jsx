import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Trash2, FileText, X, ChevronRight, Link2, Send, Copy, Check, ExternalLink, Users } from 'lucide-react';
import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import { trackEvent } from '../lib/tracking';
import { createCommercialShareLink } from '../lib/api';

const ProposalModal = lazy(() => import('./ProposalModal'));

const SIDEBAR_WIDTH = 'w-80'; // 320px

export default function FavoritesBar({ isDark = true, showProposalCta = true, onShareFavorites = null, shareLoading = false, showCommercialShare = false, autoOpenProposal = false }) {
  const { favorites, removeFavorite, clearFavorites, totalPreco, totalFluxo, totalTelas, sidebarOpen, setSidebarOpen } = useFavorites();
  const [showProposal, setShowProposal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [discountMode, setDiscountMode] = useState('percent'); // 'percent' | 'fixed'
  const [discountValue, setDiscountValue] = useState('');

  // Auto-open ProposalModal when triggered via URL (e.g. vendedor click from WhatsApp)
  useEffect(() => {
    if (autoOpenProposal && favorites.length > 0 && !showProposal) {
      setShowProposal(true);
    }
  }, [autoOpenProposal, favorites.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand sidebar whenever a favorite is added
  useEffect(() => {
    if (favorites.length > 0) setSidebarOpen(true);
  }, [favorites.length, setSidebarOpen]);

  // Close sidebar on unmount
  useEffect(() => {
    return () => setSidebarOpen(false);
  }, [setSidebarOpen]);

  const collapsed = !sidebarOpen;
  const setCollapsed = (val) => setSidebarOpen(!val);

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
          className={`fixed right-0 top-1/2 -translate-y-1/2 z-[9995] flex items-center gap-2 pl-3 pr-2 py-3 rounded-l-xl border-l border-t border-b shadow-lg transition-colors ${isDark ? 'bg-brand-dark/95 border-white/10 hover:bg-white/10' : 'bg-white border-neutral-200 hover:bg-neutral-50 shadow-neutral-200'}`}
        >
          <Heart size={18} className="text-brand-orange" fill="currentColor" />
          <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-neutral-800'}`}>{favorites.length}</span>
          <ChevronRight size={14} className={`rotate-180 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} />
        </motion.button>
        {showProposal && <Suspense fallback={null}><ProposalModal onClose={() => setShowProposal(false)} isDark={isDark} /></Suspense>}
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
        className={`fixed top-16 right-0 bottom-0 ${SIDEBAR_WIDTH} z-[9995] flex flex-col border-l backdrop-blur-xl ${isDark ? 'bg-brand-dark/[0.97] border-white/10' : 'bg-white/[0.98] border-neutral-200 shadow-xl'}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Heart size={18} className="text-brand-orange" fill="currentColor" />
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-brand-orange rounded-full text-[10px] font-bold flex items-center justify-center text-white px-1">
                {favorites.length}
              </span>
            </div>
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              Meus favoritos
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { clearFavorites(); trackEvent('favorites_cleared', { count: favorites.length }); }}
              className={`p-1.5 rounded-lg transition-colors text-[11px] ${isDark ? 'hover:bg-white/10 text-brand-gray-500 hover:text-red-400' : 'hover:bg-neutral-100 text-neutral-400 hover:text-red-500'}`}
              title="Limpar favoritos"
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
          <span>{totalTelas} telas</span>
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

        {/* Footer — total + discount + CTA */}
        <div className={`px-4 py-4 border-t space-y-3 ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
          {/* Original total */}
          <div className="flex items-center justify-between">
            <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Subtotal mensal</span>
            <span className={`text-sm font-semibold ${discountValue ? (isDark ? 'text-brand-gray-500 line-through' : 'text-neutral-400 line-through') : (isDark ? 'text-white' : 'text-neutral-900')} ${!discountValue ? 'text-lg font-bold font-heading' : ''}`}>
              {formatCurrency(totalPreco)}
            </span>
          </div>

          {/* Discount controls */}
          {showCommercialShare && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-brand-gray-600' : 'text-neutral-400'}`}>Desconto</span>
                <div className={`flex rounded-md border overflow-hidden ml-auto ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
                  <button
                    onClick={() => setDiscountMode('percent')}
                    className={`px-2 py-0.5 text-[10px] font-bold transition-colors ${discountMode === 'percent' ? 'bg-brand-orange text-white' : isDark ? 'text-brand-gray-500 hover:bg-white/5' : 'text-neutral-500 hover:bg-neutral-50'}`}
                  >%</button>
                  <button
                    onClick={() => setDiscountMode('fixed')}
                    className={`px-2 py-0.5 text-[10px] font-bold transition-colors ${discountMode === 'fixed' ? 'bg-brand-orange text-white' : isDark ? 'text-brand-gray-500 hover:bg-white/5' : 'text-neutral-500 hover:bg-neutral-50'}`}
                  >R$</button>
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={discountValue}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.,]/g, '');
                  setDiscountValue(v);
                }}
                placeholder={discountMode === 'percent' ? 'Ex: 10' : 'Ex: 500'}
                className={`w-full px-3 py-2 rounded-lg border text-xs outline-none transition-colors ${
                  isDark
                    ? 'bg-white/[0.04] border-white/10 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/50'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/50'
                }`}
              />
            </div>
          )}

          {/* Final price with discount */}
          {(() => {
            const parsed = parseFloat(String(discountValue).replace(',', '.')) || 0;
            const discountAmount = discountMode === 'percent'
              ? totalPreco * Math.min(parsed, 100) / 100
              : Math.min(parsed, totalPreco);
            const finalPrice = Math.max(0, totalPreco - discountAmount);
            const hasDiscount = parsed > 0 && discountAmount > 0;

            return hasDiscount ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                    Desconto {discountMode === 'percent' ? `${parsed}%` : formatCurrency(discountAmount)}
                  </span>
                  <span className={`text-xs font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                    -{formatCurrency(discountAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>Investimento final</span>
                  <span className={`text-lg font-bold font-heading ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                    {formatCurrency(finalPrice)}
                  </span>
                </div>
              </div>
            ) : !showCommercialShare ? (
              null
            ) : null;
          })()}
          {onShareFavorites && (
            <button
              onClick={onShareFavorites}
              disabled={shareLoading}
              className={`w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold rounded-xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] text-sm mb-2 ${isDark ? 'bg-white/10 text-white border border-white/15 hover:bg-white/15' : 'bg-neutral-100 text-neutral-800 border border-neutral-200 hover:bg-neutral-200'}`}
            >
              {shareLoading ? (
                <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Gerando link...</>
              ) : (
                <><Link2 size={16} /> Compartilhar favoritos</>
              )}
            </button>
          )}
          {showCommercialShare && (
            <button
              onClick={() => setShowShareModal(true)}
              className={`w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold rounded-xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] text-sm mb-2 ${isDark ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'}`}
            >
              <Send size={16} />
              Enviar para cliente
            </button>
          )}
          {showProposalCta && (
            <button
              onClick={() => setShowProposal(true)}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] text-sm"
            >
              <FileText size={16} />
              Gerar proposta
            </button>
          )}
        </div>
      </motion.aside>

      {showProposal && <Suspense fallback={null}><ProposalModal onClose={() => setShowProposal(false)} isDark={isDark} /></Suspense>}

      {/* Commercial share modal */}
      <AnimatePresence>
        {showShareModal && (
          <CommercialShareModal
            isDark={isDark}
            favorites={favorites}
            totalPreco={totalPreco}
            discountMode={discountMode}
            discountValue={discountValue}
            onClose={() => setShowShareModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Commercial Share Modal ─── */
function CommercialShareModal({ isDark, favorites, totalPreco = 0, discountMode = 'percent', discountValue = '', onClose }) {
  const [clientName, setClientName] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = useCallback(async () => {
    const name = clientName.trim();
    if (!name) return setError('Informe o nome do cliente.');
    if (!favorites.length) return setError('Nenhum ponto selecionado.');
    setError('');
    setLoading(true);
    try {
      // Compute discount for the link
      const parsedDiscount = parseFloat(String(discountValue).replace(',', '.')) || 0;
      const discountData = parsedDiscount > 0 ? { mode: discountMode, value: parsedDiscount } : null;

      const result = await createCommercialShareLink({
        pointIds: favorites.map(p => p.id),
        clientName: name,
        discount: discountData,
      });
      const fullUrl = `${window.location.origin}${result.url}`;
      setGeneratedUrl(fullUrl);
      trackEvent('commercial_share_created', { count: favorites.length, client: name });
    } catch (err) {
      setError(err.message || 'Erro ao gerar link.');
    } finally {
      setLoading(false);
    }
  }, [clientName, favorites]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copie o link:', generatedUrl);
    }
  }, [generatedUrl]);

  const handleWhatsApp = useCallback(() => {
    const text = encodeURIComponent(
      `Olá ${clientName.trim()}! Preparamos uma seleção especial de ${favorites.length} ponto${favorites.length > 1 ? 's' : ''} de mídia OOH para você:\n\n${generatedUrl}\n\nAcesse o link para ver os detalhes e selecione os seus favoritos!`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }, [clientName, favorites.length, generatedUrl]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${isDark ? 'bg-[#0A0A0A] border-white/10' : 'bg-white border-neutral-200'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-blue-500/20' : 'bg-blue-50'}`}>
              <Send size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Enviar para cliente</h3>
              <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{favorites.length} ponto{favorites.length > 1 ? 's' : ''} selecionado{favorites.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-500' : 'hover:bg-neutral-100 text-neutral-400'}`}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!generatedUrl ? (
            <>
              {/* Client name input */}
              <div>
                <label className={`text-xs font-semibold mb-1.5 block ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                  Nome do cliente / empresa
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => { setClientName(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder="Ex: João Silva — Empresa ABC"
                  autoFocus
                  className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${
                    isDark
                      ? 'bg-white/[0.04] border-white/10 text-white placeholder:text-brand-gray-600 focus:border-blue-500/50'
                      : 'bg-neutral-50 border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-blue-400'
                  }`}
                />
              </div>

              {/* Points preview */}
              <div className={`rounded-xl border p-3 max-h-36 overflow-y-auto ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50'}`}>
                <div className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${isDark ? 'text-brand-gray-600' : 'text-neutral-400'}`}>
                  Pontos incluídos
                </div>
                <div className="space-y-1">
                  {favorites.map((p) => (
                    <div key={p.id} className={`flex items-center justify-between text-xs ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                      <span className="truncate mr-2">{p.nome}</span>
                      <span className="shrink-0 text-brand-orange font-medium">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(p.preco || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info text */}
              <p className={`text-[11px] ${isDark ? 'text-brand-gray-600' : 'text-neutral-400'}`}>
                O cliente verá os pontos selecionados com o nome dele e poderá escolher seus favoritos. Você será notificado quando ele responder.
              </p>

              {error && (
                <p className="text-red-400 text-xs">{error}</p>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={loading || !clientName.trim()}
                className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] ${
                  loading || !clientName.trim()
                    ? 'opacity-50 cursor-not-allowed bg-blue-500/50 text-white'
                    : 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20'
                }`}
              >
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando link...</>
                ) : (
                  <><Send size={15} /> Gerar link para {clientName.trim() || 'cliente'}</>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Success state */}
              <div className="text-center py-2">
                <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${isDark ? 'bg-green-500/20' : 'bg-green-50'}`}>
                  <Check size={24} className="text-green-400" />
                </div>
                <h4 className={`font-bold mb-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>Link gerado!</h4>
                <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                  Envie para <span className="font-semibold text-brand-orange">{clientName.trim()}</span>
                </p>
              </div>

              {/* URL display */}
              <div className={`flex items-center gap-2 rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                <input
                  type="text"
                  readOnly
                  value={generatedUrl}
                  className={`flex-1 text-xs bg-transparent outline-none select-all ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}
                  onClick={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  className={`shrink-0 p-2 rounded-lg transition-colors ${
                    copied
                      ? 'bg-green-500/20 text-green-400'
                      : isDark ? 'hover:bg-white/10 text-brand-gray-400' : 'hover:bg-neutral-200 text-neutral-500'
                  }`}
                  title="Copiar link"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <button
                  onClick={handleWhatsApp}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors"
                >
                  <i className="ri-whatsapp-line" style={{ fontSize: 16 }} />
                  Enviar pelo WhatsApp
                </button>
                <button
                  onClick={handleCopy}
                  className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm border transition-colors ${
                    isDark ? 'border-white/10 text-brand-gray-300 hover:bg-white/5' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {copied ? <><Check size={15} /> Copiado!</> : <><Copy size={15} /> Copiar link</>}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
