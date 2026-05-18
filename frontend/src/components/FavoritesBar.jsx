import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Trash2, FileText, X, ChevronRight, Link2, Send, Copy, Check, ExternalLink, Users, Mic, Square, Play, Pause, Loader2, Volume2, Megaphone, ArrowLeft } from 'lucide-react';
import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import { trackEvent } from '../lib/tracking';
import { createCommercialShareLink, createBroadcastShareLink, uploadVendedorAudio, deleteVendedorAudio, sendShareWhatsApp, fetchCurrentUser } from '../lib/api';

const ProposalModal = lazy(() => import('./ProposalModal'));

const SIDEBAR_WIDTH = 'w-80'; // 320px

export default function FavoritesBar({ isDark = true, showProposalCta = true, onShareFavorites = null, shareLoading = false, showCommercialShare = false, autoOpenProposal = false, title = 'Meus favoritos' }) {
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
              {title}
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
            onClose={(wasLinkGenerated) => { setShowShareModal(false); if (wasLinkGenerated) clearFavorites(); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Audio Recorder Hook ─── */
function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      // Microfone negado — silencioso
    }
  }, [audioUrl]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const clearRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl('');
    setDuration(0);
  }, [audioUrl]);

  return { recording, audioBlob, audioUrl, duration, startRecording, stopRecording, clearRecording };
}

/* ─── Inline Audio Player ─── */
function MiniAudioPlayer({ src, isDark, label = 'Áudio' }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); }
    else { audioRef.current.play().catch(() => {}); }
    setPlaying(!playing);
  };

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-neutral-200 bg-neutral-50'}`}>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} preload="metadata" />
      <button type="button" onClick={toggle} className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-brand-orange/20 text-brand-orange hover:bg-brand-orange/30' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`}>
        {playing ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
      </button>
      <span className={`text-xs truncate ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{label}</span>
    </div>
  );
}

/* ─── Audio Section (shared between both modes) ─── */
function AudioSection({ isDark, vendedorAudioUrl, setVendedorAudioUrl, setError }) {
  const [audioUploading, setAudioUploading] = useState(false);
  const audioFileRef = useRef(null);
  const { recording, audioBlob, audioUrl: recAudioUrl, duration, startRecording, stopRecording, clearRecording } = useAudioRecorder();
  const formatDuration = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleUploadAudio = useCallback(async (blob) => {
    if (!blob) return;
    setAudioUploading(true);
    try {
      const file = blob instanceof File ? blob : new File([blob], 'audio.webm', { type: blob.type || 'audio/webm' });
      const result = await uploadVendedorAudio(file);
      setVendedorAudioUrl(result.audio_url);
      clearRecording();
    } catch (err) {
      setError(err.message || 'Erro ao enviar áudio.');
    } finally {
      setAudioUploading(false);
    }
  }, [clearRecording, setVendedorAudioUrl, setError]);

  const handleFileAudioUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) handleUploadAudio(file);
    if (e.target) e.target.value = '';
  }, [handleUploadAudio]);

  const handleRemoveAudio = useCallback(async () => {
    try { await deleteVendedorAudio(); setVendedorAudioUrl(null); } catch { /* ignore */ }
  }, [setVendedorAudioUrl]);

  return (
    <div className={`rounded-xl border p-3 space-y-2.5 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 size={14} className="text-brand-orange" />
          <span className={`text-xs font-semibold ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>Áudio personalizado</span>
        </div>
        {vendedorAudioUrl && (
          <button type="button" onClick={handleRemoveAudio} className={`text-[10px] underline ${isDark ? 'text-brand-gray-500 hover:text-red-400' : 'text-neutral-400 hover:text-red-500'}`}>
            Remover
          </button>
        )}
      </div>
      {vendedorAudioUrl ? (
        <MiniAudioPlayer src={vendedorAudioUrl} isDark={isDark} label="Seu áudio salvo" />
      ) : recAudioUrl ? (
        <>
          <MiniAudioPlayer src={recAudioUrl} isDark={isDark} label={`Gravação (${formatDuration(duration)})`} />
          <div className="flex gap-2">
            <button type="button" onClick={() => handleUploadAudio(audioBlob)} disabled={audioUploading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-orange text-white hover:bg-brand-orange-hover disabled:opacity-50 transition-colors">
              {audioUploading ? <><Loader2 size={12} className="animate-spin" /> Salvando...</> : <><Check size={12} /> Salvar áudio</>}
            </button>
            <button type="button" onClick={clearRecording}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-100'}`}>
              Descartar
            </button>
          </div>
        </>
      ) : recording ? (
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className={`text-xs font-mono ${isDark ? 'text-red-400' : 'text-red-600'}`}>{formatDuration(duration)}</span>
          <button type="button" onClick={stopRecording}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors">
            <Square size={10} /> Parar
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={startRecording}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${isDark ? 'border-brand-orange/30 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20' : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'}`}>
            <Mic size={12} /> Gravar áudio
          </button>
          <button type="button" onClick={() => audioFileRef.current?.click()}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-100'}`}>
            Enviar arquivo
          </button>
          <input ref={audioFileRef} type="file" accept="audio/*" className="hidden" onChange={handleFileAudioUpload} />
        </div>
      )}
      <p className={`text-[10px] ${isDark ? 'text-brand-gray-600' : 'text-neutral-400'}`}>
        Grave uma mensagem personalizada que será enviada junto com o link. Fica salvo no seu perfil.
      </p>
    </div>
  );
}

/* ─── Points preview strip ─── */
function PointsPreview({ favorites, isDark }) {
  return (
    <div className={`rounded-xl border p-3 max-h-28 overflow-y-auto ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50'}`}>
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
  );
}

/* ─── Success state (shared) ─── */
function ShareSuccess({ isDark, generatedUrl, successLabel, vendedorAudioUrl, clientPhone, generatedCode, clientName, customMessage, favorites, onClose }) {
  const [copied, setCopied] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const [waSent, setWaSent] = useState(false);
  const [waError, setWaError] = useState('');

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(generatedUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { window.prompt('Copie o link:', generatedUrl); }
  }, [generatedUrl]);

  const handleWhatsAppAPI = useCallback(async () => {
    const phone = (clientPhone || '').trim();
    if (!phone) { setWaError('Informe o WhatsApp do cliente para enviar diretamente.'); return; }
    setSendingWa(true); setWaError('');
    try {
      const result = await sendShareWhatsApp(generatedCode, phone);
      setWaSent(true);
      trackEvent('commercial_share_whatsapp_sent', { code: generatedCode, hasAudio: result.audioSent });
    } catch (err) { setWaError(err.message || 'Erro ao enviar WhatsApp.'); }
    finally { setSendingWa(false); }
  }, [clientPhone, generatedCode]);

  const handleWhatsAppManual = useCallback(async () => {
    const name = (clientName || '').trim();
    const custom = (customMessage || '').trim();
    const messageText = custom
      ? `${custom}\n\n${generatedUrl}`
      : name
      ? `Olá ${name}! Preparamos uma seleção especial de ${favorites.length} ponto${favorites.length > 1 ? 's' : ''} de mídia OOH para você:\n\n${generatedUrl}\n\nAcesse o link para ver os detalhes e selecione os seus favoritos!`
      : `Sua marca em mais pontos. Seu investimento com mais desconto.\n\nAgora ficou ainda mais fácil montar uma campanha OOH estratégica com a Intermídia.\n\nSelecionamos pontos especiais para você escolher onde sua marca deve aparecer e, quanto mais pontos fizerem parte da sua campanha, maior será o desconto aplicado automaticamente.\n\nConfira as condições:\n\n• 2 a 3 pontos: 5% OFF\n• 4 a 5 pontos: 10% OFF\n• 6 a 7 pontos: 15% OFF\n• 8 a 10 pontos: 20% OFF\n\nMais presença, mais impacto e mais economia para sua marca ocupar os lugares certos.\n\nAcesse agora, escolha os pontos que mais combinam com o seu público e monte sua campanha com desconto garantido.\n\n*MONTAR MINHA CAMPANHA →*\n${generatedUrl}`;

    if (vendedorAudioUrl && navigator.share) {
      try {
        const audioResponse = await fetch(vendedorAudioUrl);
        const audioBlob = await audioResponse.blob();
        const ext = vendedorAudioUrl.split('.').pop() || 'ogg';
        const audioFile = new File([audioBlob], `mensagem.${ext}`, { type: audioBlob.type || 'audio/ogg' });
        if (navigator.canShare?.({ files: [audioFile] })) { await navigator.share({ text: messageText, files: [audioFile] }); return; }
      } catch (shareErr) { if (shareErr?.name === 'AbortError') return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(messageText)}`, '_blank');
  }, [clientName, customMessage, favorites.length, generatedUrl, vendedorAudioUrl]);

  return (
    <>
      <div className="text-center py-2">
        <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${isDark ? 'bg-green-500/20' : 'bg-green-50'}`}>
          <Check size={24} className="text-green-400" />
        </div>
        <h4 className={`font-bold mb-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>Link gerado!</h4>
        <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{successLabel}</p>
      </div>

      <div className={`flex items-center gap-2 rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
        <input type="text" readOnly value={generatedUrl}
          className={`flex-1 text-xs bg-transparent outline-none select-all ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}
          onClick={(e) => e.target.select()} />
        <button onClick={handleCopy}
          className={`shrink-0 p-2 rounded-lg transition-colors ${copied ? 'bg-green-500/20 text-green-400' : isDark ? 'hover:bg-white/10 text-brand-gray-400' : 'hover:bg-neutral-200 text-neutral-500'}`}
          title="Copiar link">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      {vendedorAudioUrl && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${isDark ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/20' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>
          <Volume2 size={13} /><span>Áudio personalizado será enviado junto</span>
        </div>
      )}

      {waError && <p className="text-red-400 text-xs">{waError}</p>}

      <div className="space-y-2">
        {waSent ? (
          <div className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm bg-green-500/20 text-green-400 border border-green-500/30">
            <Check size={15} /> Enviado com sucesso!
          </div>
        ) : (clientPhone || '').trim() ? (
          <button onClick={handleWhatsAppAPI} disabled={sendingWa}
            className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-colors ${sendingWa ? 'opacity-60 cursor-not-allowed' : ''} bg-[#25D366] text-white hover:bg-[#1EB954]`}>
            {sendingWa ? <><Loader2 size={15} className="animate-spin" /> Enviando...</>
              : <><i className="ri-whatsapp-line" style={{ fontSize: 16 }} /> Enviar pelo WhatsApp{vendedorAudioUrl ? ' (com áudio)' : ''}</>}
          </button>
        ) : (
          <button onClick={handleWhatsAppManual}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors">
            <i className="ri-whatsapp-line" style={{ fontSize: 16 }} />
            Enviar pelo WhatsApp{vendedorAudioUrl ? ' (com áudio)' : ''}
          </button>
        )}
        <button onClick={handleCopy}
          className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm border transition-colors ${
            isDark ? 'border-white/10 text-brand-gray-300 hover:bg-white/5' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
          }`}>
          {copied ? <><Check size={15} /> Copiado!</> : <><Copy size={15} /> Copiar link</>}
        </button>
      </div>
    </>
  );
}

/* ─── Commercial Share Modal — two modes: specific client vs broadcast ─── */
function CommercialShareModal({ isDark, favorites, totalPreco = 0, discountMode = 'percent', discountValue = '', onClose }) {
  const [mode, setMode] = useState(null); // null = mode picker, 'specific' | 'broadcast'
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState('');
  const [vendedorAudioUrl, setVendedorAudioUrl] = useState(null);
  const [customMessage, setCustomMessage] = useState('');

  // Busca dados do vendedor ao abrir
  useEffect(() => {
    fetchCurrentUser().then(u => {
      if (u?.audio_url) setVendedorAudioUrl(u.audio_url);
    }).catch(() => {});
  }, []);

  const inputCls = `w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${
    isDark
      ? 'bg-white/[0.04] border-white/10 text-white placeholder:text-brand-gray-600 focus:border-blue-500/50'
      : 'bg-neutral-50 border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-blue-400'
  }`;

  // ── Generate link (specific client) ──
  const handleGenerateSpecific = useCallback(async () => {
    const name = clientName.trim();
    if (!name) return setError('Informe o nome do cliente.');
    if (!favorites.length) return setError('Nenhum ponto selecionado.');
    setError(''); setLoading(true);
    try {
      const parsedDiscount = parseFloat(String(discountValue).replace(',', '.')) || 0;
      const discountData = parsedDiscount > 0 ? { mode: discountMode, value: parsedDiscount } : null;
      const result = await createCommercialShareLink({ pointIds: favorites.map(p => p.id), clientName: name, discount: discountData });
      setGeneratedUrl(`${window.location.origin}${result.url}`);
      setGeneratedCode(result.url.split('/').pop());
      trackEvent('commercial_share_created', { count: favorites.length, client: name });
    } catch (err) { setError(err.message || 'Erro ao gerar link.'); }
    finally { setLoading(false); }
  }, [clientName, favorites, discountValue, discountMode]);

  // ── Generate link (broadcast / mass) ──
  const handleGenerateBroadcast = useCallback(async () => {
    if (!favorites.length) return setError('Nenhum ponto selecionado.');
    setError(''); setLoading(true);
    try {
      const finalText = customMessage.trim() || 'Sua marca em mais pontos. Seu investimento com mais desconto.\n\nAgora ficou ainda mais fácil montar uma campanha OOH estratégica com a Intermídia.\n\nSelecionamos pontos especiais para você escolher onde sua marca deve aparecer e, quanto mais pontos fizerem parte da sua campanha, maior será o desconto aplicado automaticamente.\n\nConfira as condições:\n\n• 2 a 3 pontos: 5% OFF\n• 4 a 5 pontos: 10% OFF\n• 6 a 7 pontos: 15% OFF\n• 8 a 10 pontos: 20% OFF\n\nMais presença, mais impacto e mais economia para sua marca ocupar os lugares certos.\n\nAcesse agora, escolha os pontos que mais combinam com o seu público e monte sua campanha com desconto garantido.';
      const result = await createBroadcastShareLink({ pointIds: favorites.map(p => p.id), broadcastText: finalText });
      setGeneratedUrl(`${window.location.origin}${result.url}`);
      setGeneratedCode(result.url.split('/').pop());
      trackEvent('broadcast_share_created', { count: favorites.length });
    } catch (err) { setError(err.message || 'Erro ao gerar link.'); }
    finally { setLoading(false); }
  }, [favorites, customMessage]);

  const headerTitle = mode === 'broadcast' ? 'Disparo em massa' : mode === 'specific' ? 'Cliente específico' : 'Enviar para cliente';
  const headerIcon = mode === 'broadcast' ? <Megaphone size={16} className="text-purple-400" /> : <Send size={16} className="text-blue-400" />;
  const headerIconBg = mode === 'broadcast' ? (isDark ? 'bg-purple-500/20' : 'bg-purple-50') : (isDark ? 'bg-blue-500/20' : 'bg-blue-50');

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => onClose(!!generatedUrl)}
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
            {mode && !generatedUrl && (
              <button onClick={() => { setMode(null); setError(''); }} className={`p-1.5 rounded-lg transition-colors mr-1 ${isDark ? 'hover:bg-white/10 text-brand-gray-500' : 'hover:bg-neutral-100 text-neutral-400'}`}>
                <ArrowLeft size={14} />
              </button>
            )}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${headerIconBg}`}>
              {headerIcon}
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{headerTitle}</h3>
              <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{favorites.length} ponto{favorites.length > 1 ? 's' : ''} selecionado{favorites.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={() => onClose(!!generatedUrl)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-500' : 'hover:bg-neutral-100 text-neutral-400'}`}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* ═══ MODE PICKER ═══ */}
          {!mode && !generatedUrl && (
            <>
              <p className={`text-xs text-center ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                Como deseja compartilhar esta seleção?
              </p>
              <button onClick={() => setMode('specific')}
                className={`w-full flex items-start gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01] active:scale-[0.99] text-left ${isDark ? 'border-white/10 hover:border-blue-500/40 hover:bg-blue-500/5' : 'border-neutral-200 hover:border-blue-300 hover:bg-blue-50/50'}`}>
                <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${isDark ? 'bg-blue-500/20' : 'bg-blue-50'}`}>
                  <Send size={18} className="text-blue-400" />
                </div>
                <div>
                  <div className={`text-sm font-bold mb-0.5 ${isDark ? 'text-white' : 'text-neutral-900'}`}>Cliente específico</div>
                  <div className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                    Link personalizado para um cliente. Ele seleciona os favoritos e você recebe a notificação.
                  </div>
                </div>
              </button>
              <button onClick={() => setMode('broadcast')}
                className={`w-full flex items-start gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01] active:scale-[0.99] text-left ${isDark ? 'border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5' : 'border-neutral-200 hover:border-purple-300 hover:bg-purple-50/50'}`}>
                <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${isDark ? 'bg-purple-500/20' : 'bg-purple-50'}`}>
                  <Megaphone size={18} className="text-purple-400" />
                </div>
                <div>
                  <div className={`text-sm font-bold mb-0.5 ${isDark ? 'text-white' : 'text-neutral-900'}`}>Disparo em massa</div>
                  <div className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                    Link genérico para vários clientes. Cada um se identifica, escolhe seus pontos e ganha desconto progressivo.
                  </div>
                </div>
              </button>
            </>
          )}

          {/* ═══ SPECIFIC CLIENT FORM ═══ */}
          {mode === 'specific' && !generatedUrl && (
            <>
              <div>
                <label className={`text-xs font-semibold mb-1.5 block ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                  Nome do cliente / empresa
                </label>
                <input type="text" value={clientName} onChange={(e) => { setClientName(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerateSpecific()} placeholder="Ex: João Silva — Empresa ABC" autoFocus className={inputCls} />
              </div>
              <div>
                <label className={`text-xs font-semibold mb-1.5 block ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                  WhatsApp do cliente <span className={isDark ? 'text-brand-gray-600' : 'text-neutral-400'}>(opcional)</span>
                </label>
                <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="(99) 99999-9999" className={inputCls} />
                <p className={`text-[10px] mt-1 ${isDark ? 'text-brand-gray-600' : 'text-neutral-400'}`}>
                  Com o número, enviamos o link + áudio direto pelo WhatsApp.
                </p>
              </div>
              <div>
                <label className={`text-xs font-semibold mb-1.5 block ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                  Mensagem personalizada <span className={isDark ? 'text-brand-gray-600' : 'text-neutral-400'}>(opcional)</span>
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Escreva uma mensagem para enviar junto com o link..."
                  rows={3}
                  className={inputCls + ' resize-none'}
                />
              </div>
              <AudioSection isDark={isDark} vendedorAudioUrl={vendedorAudioUrl} setVendedorAudioUrl={setVendedorAudioUrl} setError={setError} />
              <PointsPreview favorites={favorites} isDark={isDark} />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button onClick={handleGenerateSpecific} disabled={loading || !clientName.trim()}
                className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] ${
                  loading || !clientName.trim() ? 'opacity-50 cursor-not-allowed bg-blue-500/50 text-white' : 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20'
                }`}>
                {loading ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando link...</>
                  : <><Send size={15} /> Gerar link para {clientName.trim() || 'cliente'}</>}
              </button>
            </>
          )}

          {/* ═══ BROADCAST FORM ═══ */}
          {mode === 'broadcast' && !generatedUrl && (
            <>
              <div className={`rounded-xl border p-4 space-y-2 ${isDark ? 'border-purple-500/20 bg-purple-500/5' : 'border-purple-200 bg-purple-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Megaphone size={14} className="text-purple-400" />
                  <span className={`text-xs font-bold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Desconto progressivo</span>
                </div>
                <div className={`text-xs space-y-1 ${isDark ? 'text-purple-200/80' : 'text-purple-700/80'}`}>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> 2 a 3 pontos: <strong>5% OFF</strong></div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> 4 a 5 pontos: <strong>10% OFF</strong></div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> 6 a 7 pontos: <strong>15% OFF</strong></div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> 8 a 10 pontos: <strong>20% OFF</strong></div>
                </div>
                <p className={`text-[10px] mt-2 ${isDark ? 'text-purple-300/60' : 'text-purple-600/60'}`}>
                  O desconto é aplicado automaticamente conforme o cliente seleciona os pontos.
                </p>
              </div>
              <div>
                <label className={`text-xs font-semibold mb-1.5 block ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                  Mensagem personalizada <span className={isDark ? 'text-brand-gray-600' : 'text-neutral-400'}>(opcional)</span>
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Escreva uma mensagem personalizada para enviar junto com o link..."
                  rows={3}
                  className={inputCls + ' resize-none'}
                />
              </div>
              <AudioSection isDark={isDark} vendedorAudioUrl={vendedorAudioUrl} setVendedorAudioUrl={setVendedorAudioUrl} setError={setError} />
              <PointsPreview favorites={favorites} isDark={isDark} />
              <div className={`rounded-xl border p-3 ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50'}`}>
                <p className={`text-[10px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                  <strong>Como funciona:</strong> O cliente acessa o link, se identifica com nome e contato, seleciona os pontos favoritos e envia.
                  Você recebe uma notificação no WhatsApp com os dados do cliente.
                </p>
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button onClick={handleGenerateBroadcast} disabled={loading}
                className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] ${
                  loading ? 'opacity-50 cursor-not-allowed bg-purple-500/50 text-white' : 'bg-purple-500 text-white hover:bg-purple-600 shadow-lg shadow-purple-500/20'
                }`}>
                {loading ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando link...</>
                  : <><Megaphone size={15} /> Gerar link de disparo em massa</>}
              </button>
            </>
          )}

          {/* ═══ SUCCESS STATE ═══ */}
          {generatedUrl && (
            <ShareSuccess
              isDark={isDark}
              generatedUrl={generatedUrl}
              generatedCode={generatedCode}
              successLabel={mode === 'broadcast'
                ? 'Envie esse link para múltiplos clientes!'
                : <>Envie para <span className="font-semibold text-brand-orange">{clientName.trim()}</span></>}
              vendedorAudioUrl={vendedorAudioUrl}
              clientPhone={mode === 'specific' ? clientPhone : ''}
              clientName={mode === 'specific' ? clientName : ''}
              customMessage={customMessage}
              favorites={favorites}
              onClose={onClose}
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
