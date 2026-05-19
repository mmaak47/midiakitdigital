import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Plus, Pencil, Trash2, Send, Check, X, Archive,
  Share2, Copy, Loader2, Package, AlertCircle, ChevronDown,
  ChevronUp, Info, MessageCircle, RefreshCw, Users, Eye,
  BarChart3, TrendingUp, MousePointerClick, Link2,
  Volume2, Mic, Square, Play, Pause
} from 'lucide-react';
import {
  fetchPacotes, fetchPacote, createPacote, updatePacote, deletePacote,
  submitPacote, aprovarPacote, rejeitarPacote, arquivarPacote,
  compartilharPacote, fetchPacotesAnalytics, fetchMeusCompartilhamentos,
  fetchCurrentUser, uploadVendedorAudio, deleteVendedorAudio
} from '../../lib/api';

// ── Status config ──────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  rascunho:            { label: 'Rascunho',    dark: 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30',   light: 'bg-neutral-100 text-neutral-600 border-neutral-300' },
  pendente_aprovacao:  { label: 'Pendente',    dark: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',      light: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  aprovado:            { label: 'Aprovado',    dark: 'bg-green-500/20 text-green-300 border-green-500/30',         light: 'bg-green-50 text-green-700 border-green-200' },
  arquivado:           { label: 'Arquivado',   dark: 'bg-red-500/20 text-red-300 border-red-500/30',               light: 'bg-red-50 text-red-700 border-red-200' },
};

const STATUS_FILTERS = [
  { key: 'todos',               label: 'Todos' },
  { key: 'rascunho',            label: 'Rascunho' },
  { key: 'pendente_aprovacao',  label: 'Pendente' },
  { key: 'aprovado',            label: 'Aprovado' },
  { key: 'arquivado',           label: 'Arquivado' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function canEdit(pacote, currentUser) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin' || currentUser.role === 'gerente_comercial') return true;
  return pacote.status === 'rascunho' && pacote.criado_por === currentUser.id;
}

function canDelete(pacote, currentUser) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin' || currentUser.role === 'gerente_comercial') return true;
  return pacote.status === 'rascunho' && pacote.criado_por === currentUser.id;
}

function canSubmit(pacote, currentUser) {
  if (!currentUser) return false;
  return pacote.status === 'rascunho';
}

function isPrivilegedRole(role) {
  return role === 'admin' || role === 'gerente_comercial' || role === 'diretor';
}

function canApprove(pacote, currentUser) {
  if (!currentUser) return false;
  return pacote.status === 'pendente_aprovacao' && isPrivilegedRole(currentUser.role);
}

function canReject(pacote, currentUser) {
  return canApprove(pacote, currentUser);
}

function canShare(pacote) {
  return pacote.status === 'aprovado';
}

function canArchive(pacote, currentUser) {
  if (!currentUser) return false;
  return currentUser.role === 'admin' || currentUser.role === 'gerente_comercial';
}

// ── Status Badge ───────────────────────────────────────────────────────────
function StatusBadge({ status, isDark }) {
  const cfg = STATUS_CONFIG[status] || { label: status, dark: 'bg-white/10 text-neutral-400 border-white/10', light: 'bg-neutral-100 text-neutral-600 border-neutral-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${isDark ? cfg.dark : cfg.light}`}>
      {cfg.label}
    </span>
  );
}

// ── Reject Modal ───────────────────────────────────────────────────────────
function RejectModal({ isDark, pacote, onConfirm, onClose }) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const overlay = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50';
  const modal = `w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4 border ${isDark ? 'bg-[#111] border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`;
  const inp = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/30 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-500' : 'bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400'}`;

  async function handleConfirm() {
    if (!motivo.trim()) return;
    setSaving(true);
    try {
      await onConfirm(pacote.id, motivo.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={overlay} onClick={onClose}>
      <div className={modal} onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <X size={16} className="text-red-500" />
            Rejeitar Pacote
          </h3>
          <p className={`text-sm mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            Informe o motivo da rejeição de <strong>{pacote.nome}</strong>.
          </p>
        </div>
        <textarea
          className={`${inp} resize-none`}
          rows={3}
          placeholder="Motivo da rejeição..."
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className={`flex-1 py-2 rounded-xl border text-sm transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!motivo.trim() || saving}
            className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Rejeitando...' : 'Rejeitar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Audio Recorder Hook ───────────────────────────────────────────────────
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
      // Microfone negado
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

// ── Mini Audio Player ─────────────────────────────────────────────────────
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

// ── Share Popover ──────────────────────────────────────────────────────────
function SharePopover({ isDark, pacote, onClose }) {
  const [loading, setLoading] = useState(true);
  const [shareData, setShareData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [customMessage, setCustomMessage] = useState('');

  // Audio state
  const [vendedorAudioUrl, setVendedorAudioUrl] = useState(null);
  const [audioUploading, setAudioUploading] = useState(false);
  const audioFileRef = useRef(null);
  const { recording, audioBlob, audioUrl: recAudioUrl, duration, startRecording, stopRecording, clearRecording } = useAudioRecorder();
  const formatDuration = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await compartilharPacote(pacote.id);
        if (!cancelled) setShareData(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pacote.id]);

  // Fetch vendedor's existing audio on mount
  useEffect(() => {
    fetchCurrentUser().then(u => {
      if (u?.audio_url) setVendedorAudioUrl(u.audio_url);
    }).catch(() => {});
  }, []);

  const fullUrl = shareData?.url ? `${window.location.origin}${shareData.url}` : '';

  function handleCopy() {
    if (!fullUrl) return;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleWhatsApp() {
    if (!fullUrl) return;
    const defaultMsg = `Confira o pacote "${pacote.nome}": ${fullUrl}`;
    const msg = customMessage.trim()
      ? `${customMessage.trim()}\n\n${fullUrl}`
      : defaultMsg;
    const text = encodeURIComponent(msg);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  // Audio handlers
  async function handleUploadAudio(blob) {
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
  }

  function handleFileAudioUpload(e) {
    const file = e.target.files?.[0];
    if (file) handleUploadAudio(file);
    if (e.target) e.target.value = '';
  }

  async function handleRemoveAudio() {
    try { await deleteVendedorAudio(); setVendedorAudioUrl(null); } catch { /* ignore */ }
  }

  const overlay = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50';
  const modal = `w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4 border ${isDark ? 'bg-[#111] border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`;

  return (
    <div className={overlay} onClick={onClose}>
      <div className={modal} onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Share2 size={16} className="text-[#FE5C2B]" />
            Compartilhar Pacote
          </h3>
          <p className={`text-sm mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            {pacote.nome}
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {shareData && (
          <>
            {/* URL display */}
            <div className={`rounded-lg border px-3 py-2 text-sm break-all ${isDark ? 'bg-white/5 border-white/10 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
              {fullUrl}
            </div>
            {shareData.existing && (
              <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                Link existente — {shareData.views || 0} visualizações
              </p>
            )}

            {/* Custom message textarea */}
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                Mensagem personalizada <span className={isDark ? 'text-brand-gray-600' : 'text-neutral-400'}>(opcional)</span>
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Escreva uma mensagem para enviar junto com o link..."
                rows={3}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/50' : 'bg-neutral-50 border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/50'}`}
              />
            </div>

            {/* Audio section */}
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
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#FE5C2B] text-white hover:opacity-90 disabled:opacity-50 transition-colors">
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

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${isDark ? 'border-white/10 text-brand-gray-300 hover:bg-white/5' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
              >
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
              <button
                onClick={handleWhatsApp}
                className="flex-1 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <MessageCircle size={14} />
                WhatsApp
              </button>
            </div>
          </>
        )}

        <button
          onClick={onClose}
          className={`w-full py-2 rounded-xl border text-sm transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

// ── Discount Rule Row ──────────────────────────────────────────────────────
function DescontoRuleRow({ rule, tipo, isDark, onChange, onRemove }) {
  const inp = `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/30 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-500' : 'bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400'}`;
  const labelUnit = tipo === 'quantidade' ? 'pontos' : 'meses';

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <label className={`block text-[10px] font-medium uppercase tracking-wide mb-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
          De ({labelUnit})
        </label>
        <input
          type="number"
          min="1"
          className={inp}
          value={rule.min_valor}
          onChange={e => onChange({ ...rule, min_valor: e.target.value })}
          placeholder="1"
        />
      </div>
      <div className="flex-1">
        <label className={`block text-[10px] font-medium uppercase tracking-wide mb-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
          Até ({labelUnit})
        </label>
        <input
          type="number"
          min="1"
          className={inp}
          value={rule.max_valor}
          onChange={e => onChange({ ...rule, max_valor: e.target.value })}
          placeholder="Sem limite"
        />
      </div>
      <div className="flex-1">
        <label className={`block text-[10px] font-medium uppercase tracking-wide mb-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
          Desconto (%)
        </label>
        <input
          type="number"
          min="0"
          max="100"
          step="0.5"
          className={inp}
          value={rule.desconto_pct}
          onChange={e => onChange({ ...rule, desconto_pct: e.target.value })}
          placeholder="10"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className={`p-2 rounded-lg transition-colors shrink-0 ${isDark ? 'text-red-500/60 hover:bg-red-500/10 hover:text-red-400' : 'text-red-400 hover:bg-red-50 hover:text-red-600'}`}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Create/Edit Modal ──────────────────────────────────────────────────────
function PacoteModal({ isDark, pacoteId, pontos, onClose, onSaved }) {
  const [loading, setLoading] = useState(!!pacoteId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Basic info
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [descontoEmpilhavel, setDescontoEmpilhavel] = useState(false);
  const [permiteEscolhaPontos, setPermiteEscolhaPontos] = useState(true);

  // Points
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [pontoSearch, setPontoSearch] = useState('');

  // Discounts
  const [descontosQtd, setDescontosQtd] = useState([]);
  const [descontosDur, setDescontosDur] = useState([]);

  // Load existing pacote
  useEffect(() => {
    if (!pacoteId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPacote(pacoteId);
        if (cancelled) return;
        setNome(data.nome || '');
        setDescricao(data.descricao || '');
        setDescontoEmpilhavel(!!data.desconto_empilhavel);
        setPermiteEscolhaPontos(data.permite_escolha_pontos !== 0);
        setSelectedIds(new Set((data.pontos || []).map(p => p.ponto_id)));
        const qtdRules = (data.descontos || []).filter(d => d.tipo === 'quantidade').map(d => ({
          min_valor: String(d.min_valor || ''),
          max_valor: d.max_valor ? String(d.max_valor) : '',
          desconto_pct: String(d.desconto_pct || ''),
        }));
        const durRules = (data.descontos || []).filter(d => d.tipo === 'duracao').map(d => ({
          min_valor: String(d.min_valor || ''),
          max_valor: d.max_valor ? String(d.max_valor) : '',
          desconto_pct: String(d.desconto_pct || ''),
        }));
        setDescontosQtd(qtdRules);
        setDescontosDur(durRules);
      } catch (err) {
        if (!cancelled) setError('Erro ao carregar pacote: ' + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pacoteId]);

  // Filter available points
  const filteredPontos = useMemo(() => {
    const q = pontoSearch.toLowerCase();
    return pontos.filter(p =>
      !q ||
      (p.nome || '').toLowerCase().includes(q) ||
      (p.cidade || '').toLowerCase().includes(q) ||
      (p.tipo || '').toLowerCase().includes(q)
    );
  }, [pontos, pontoSearch]);

  // Group available (unselected) points by cidade
  const groupedAvailable = useMemo(() => {
    const available = filteredPontos.filter(p => !selectedIds.has(p.id));
    const groups = {};
    available.forEach(p => {
      const key = p.cidade || 'Sem cidade';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredPontos, selectedIds]);

  // Selected points details
  const selectedPontos = useMemo(() => {
    return pontos.filter(p => selectedIds.has(p.id));
  }, [pontos, selectedIds]);

  const totalMensal = useMemo(() => {
    return selectedPontos.reduce((sum, p) => sum + Number(p.preco || p.preco_mensal || 0), 0);
  }, [selectedPontos]);

  function togglePonto(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function removePonto(id) {
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  }

  function addDescontoQtd() {
    setDescontosQtd(prev => [...prev, { min_valor: '', max_valor: '', desconto_pct: '' }]);
  }

  function addDescontoDur() {
    setDescontosDur(prev => [...prev, { min_valor: '', max_valor: '', desconto_pct: '' }]);
  }

  function updateDescontoQtd(idx, rule) {
    setDescontosQtd(prev => prev.map((r, i) => i === idx ? rule : r));
  }

  function updateDescontoDur(idx, rule) {
    setDescontosDur(prev => prev.map((r, i) => i === idx ? rule : r));
  }

  function removeDescontoQtd(idx) {
    setDescontosQtd(prev => prev.filter((_, i) => i !== idx));
  }

  function removeDescontoDur(idx) {
    setDescontosDur(prev => prev.filter((_, i) => i !== idx));
  }

  function buildDescontos() {
    const all = [];
    descontosQtd.forEach(r => {
      if (r.min_valor && r.desconto_pct) {
        all.push({ tipo: 'quantidade', min_valor: Number(r.min_valor), max_valor: r.max_valor ? Number(r.max_valor) : null, desconto_pct: Number(r.desconto_pct) });
      }
    });
    descontosDur.forEach(r => {
      if (r.min_valor && r.desconto_pct) {
        all.push({ tipo: 'duracao', min_valor: Number(r.min_valor), max_valor: r.max_valor ? Number(r.max_valor) : null, desconto_pct: Number(r.desconto_pct) });
      }
    });
    return all;
  }

  async function handleSave() {
    if (!nome.trim()) { setError('Nome do pacote é obrigatório.'); return; }
    if (selectedIds.size === 0) { setError('Selecione ao menos um ponto.'); return; }
    setError('');
    setSaving(true);
    try {
      const payload = {
        nome: nome.trim(),
        descricao: descricao.trim(),
        ponto_ids: Array.from(selectedIds),
        descontos: buildDescontos(),
        desconto_empilhavel: descontoEmpilhavel,
        permite_escolha_pontos: permiteEscolhaPontos,
      };
      if (pacoteId) {
        await updatePacote(pacoteId, payload);
      } else {
        await createPacote(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const overlayClass = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50';
  const modalClass = `w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 space-y-5 border ${isDark ? 'bg-[#111] border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`;
  const lbl = `block text-xs font-medium uppercase tracking-wide mb-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`;
  const inp = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/30 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-500' : 'bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400'}`;
  const sectionTitle = `text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`;

  if (loading) {
    return (
      <div className={overlayClass}>
        <div className={modalClass}>
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={overlayClass} onClick={onClose}>
      <div className={modalClass} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">{pacoteId ? 'Editar Pacote' : 'Novo Pacote'}</h3>
            <p className={`text-sm mt-0.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
              {pacoteId ? 'Atualize as informações do pacote' : 'Crie um novo pacote comercial'}
            </p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-400' : 'hover:bg-neutral-100 text-neutral-400'}`}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* A) Basic Info */}
        <div className="space-y-3">
          <h4 className={sectionTitle}>Informações Básicas</h4>
          <div>
            <label className={lbl}>Nome *</label>
            <input className={inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Pacote Premium Centro SP" />
          </div>
          <div>
            <label className={lbl}>Descrição</label>
            <textarea className={`${inp} resize-none`} rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descreva o pacote..." />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={descontoEmpilhavel} onChange={e => setDescontoEmpilhavel(e.target.checked)} className="accent-[#FE5C2B]" />
            <span className={`text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
              Descontos empilháveis
            </span>
            <span className="group relative">
              <Info size={13} className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'} />
              <span className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 p-2 rounded-lg text-xs hidden group-hover:block z-10 shadow-lg ${isDark ? 'bg-[#222] border border-white/10 text-brand-gray-300' : 'bg-white border border-neutral-200 text-neutral-600 shadow-md'}`}>
                Quando ativado, descontos de quantidade e duração são multiplicados. Caso contrário, aplica-se apenas o maior.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={permiteEscolhaPontos} onChange={e => setPermiteEscolhaPontos(e.target.checked)} className="accent-[#FE5C2B]" />
            <span className={`text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
              Cliente pode escolher pontos
            </span>
            <span className="group relative">
              <Info size={13} className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'} />
              <span className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 p-2 rounded-lg text-xs hidden group-hover:block z-10 shadow-lg ${isDark ? 'bg-[#222] border border-white/10 text-brand-gray-300' : 'bg-white border border-neutral-200 text-neutral-600 shadow-md'}`}>
                Quando ativado, o cliente pode favoritar pontos na página pública e enviar sua seleção. O vendedor recebe uma notificação via WhatsApp.
              </span>
            </span>
          </label>
        </div>

        {/* B) Point Selector */}
        <div className="space-y-3">
          <h4 className={sectionTitle}>Pontos do Pacote</h4>
          <input
            className={inp}
            placeholder="Buscar ponto por nome, cidade ou tipo..."
            value={pontoSearch}
            onChange={e => setPontoSearch(e.target.value)}
          />

          <div className="grid sm:grid-cols-2 gap-3">
            {/* Available */}
            <div>
              <p className={`text-xs font-medium mb-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                Disponíveis ({filteredPontos.length - selectedIds.size})
              </p>
              <div className={`max-h-56 overflow-y-auto rounded-xl border divide-y ${isDark ? 'border-white/10 divide-white/5' : 'border-neutral-200 divide-neutral-100'}`}>
                {groupedAvailable.length === 0 ? (
                  <p className={`px-3 py-4 text-sm text-center ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                    Nenhum ponto disponível.
                  </p>
                ) : (
                  groupedAvailable.map(([cidade, pts]) => (
                    <div key={cidade}>
                      <div className={`px-3 py-1.5 text-[10px] uppercase font-semibold tracking-wide sticky top-0 ${isDark ? 'bg-[#1A1A1A] text-brand-gray-500' : 'bg-gray-50 text-neutral-400'}`}>
                        {cidade}
                      </div>
                      {pts.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePonto(p.id)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-neutral-50'}`}
                        >
                          <div className="min-w-0">
                            <div className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{p.nome}</div>
                            <div className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                              {p.tipo ? `${p.tipo} · ` : ''}{fmtCurrency(p.preco || p.preco_mensal)}/mês
                            </div>
                          </div>
                          <Plus size={14} className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'} />
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Selected */}
            <div>
              <p className={`text-xs font-medium mb-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                Selecionados ({selectedIds.size})
              </p>
              <div className={`max-h-56 overflow-y-auto rounded-xl border divide-y ${isDark ? 'border-white/10 divide-white/5' : 'border-neutral-200 divide-neutral-100'}`}>
                {selectedPontos.length === 0 ? (
                  <p className={`px-3 py-4 text-sm text-center ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                    Nenhum ponto selecionado.
                  </p>
                ) : (
                  selectedPontos.map(p => (
                    <div
                      key={p.id}
                      className={`px-3 py-2 flex items-center justify-between ${isDark ? 'hover:bg-white/5' : 'hover:bg-neutral-50'}`}
                    >
                      <div className="min-w-0">
                        <div className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{p.nome}</div>
                        <div className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                          {p.cidade}{p.tipo ? ` · ${p.tipo}` : ''} · {fmtCurrency(p.preco || p.preco_mensal)}/mês
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePonto(p.id)}
                        className={`p-1 rounded-lg transition-colors shrink-0 ${isDark ? 'text-red-500/60 hover:bg-red-500/10 hover:text-red-400' : 'text-red-400 hover:bg-red-50 hover:text-red-600'}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              {selectedPontos.length > 0 && (
                <div className={`mt-2 text-right text-sm font-semibold ${isDark ? 'text-[#FE5C2B]' : 'text-[#C94A1A]'}`}>
                  Total mensal: {fmtCurrency(totalMensal)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* C) Discount Rules */}
        <div className="space-y-4">
          <h4 className={sectionTitle}>Regras de Desconto</h4>

          {/* Quantidade */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={`text-xs font-medium ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                Por Quantidade (número de pontos)
              </p>
              <button
                type="button"
                onClick={addDescontoQtd}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${isDark ? 'border-white/10 text-brand-gray-300 hover:bg-white/5 hover:border-white/20' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'}`}
              >
                <Plus size={12} /> Adicionar regra
              </button>
            </div>
            {descontosQtd.length === 0 && (
              <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Nenhuma regra de quantidade.</p>
            )}
            {descontosQtd.map((rule, idx) => (
              <DescontoRuleRow
                key={idx}
                rule={rule}
                tipo="quantidade"
                isDark={isDark}
                onChange={r => updateDescontoQtd(idx, r)}
                onRemove={() => removeDescontoQtd(idx)}
              />
            ))}
          </div>

          {/* Duracao */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={`text-xs font-medium ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                Por Duração (meses de contrato)
              </p>
              <button
                type="button"
                onClick={addDescontoDur}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${isDark ? 'border-white/10 text-brand-gray-300 hover:bg-white/5 hover:border-white/20' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'}`}
              >
                <Plus size={12} /> Adicionar regra
              </button>
            </div>
            {descontosDur.length === 0 && (
              <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Nenhuma regra de duração.</p>
            )}
            {descontosDur.map((rule, idx) => (
              <DescontoRuleRow
                key={idx}
                rule={rule}
                tipo="duracao"
                isDark={isDark}
                onChange={r => updateDescontoDur(idx, r)}
                onRemove={() => removeDescontoDur(idx)}
              />
            ))}
          </div>
        </div>

        {/* D) Footer */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className={`flex-1 py-2.5 rounded-xl border text-sm transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FE5C2B] to-[#C94A1A] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? 'Salvando...' : 'Salvar Rascunho'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Tab Component ─────────────────────────────────────────────────────
export default function PacotesTab({ isDark = true, currentUser = null, pontos = [] }) {
  const [pacotes, setPacotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  // Modals
  const [modalPacoteId, setModalPacoteId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // Expanded rows for mobile detail
  const [expandedId, setExpandedId] = useState(null);

  // Analytics (admin/gerente only)
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'gerente_comercial' || currentUser?.role === 'diretor';
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Meus compartilhamentos
  const [showLinks, setShowLinks] = useState(false);
  const [myLinks, setMyLinks] = useState([]);
  const [linksLoading, setLinksLoading] = useState(false);

  // Analytics detalhado por link
  const [linkAnalytics, setLinkAnalytics] = useState(null);
  const [linkAnalyticsLoading, setLinkAnalyticsLoading] = useState(false);

  const openLinkAnalytics = useCallback(async (compId) => {
    setLinkAnalyticsLoading(true);
    setLinkAnalytics(null);
    try {
      const res = await fetch(`/api/pacotes/compartilhamento/${compId}/analytics`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) setLinkAnalytics(await res.json());
    } catch { /* silent */ }
    finally { setLinkAnalyticsLoading(false); }
  }, []);

  const activePontos = useMemo(() => pontos.filter(p => p.ativo !== false), [pontos]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchPacotes(statusFilter === 'todos' ? undefined : statusFilter);
      setPacotes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: pacotes.length,
      aprovado: pacotes.filter(p => p.status === 'aprovado').length,
      pendente_aprovacao: pacotes.filter(p => p.status === 'pendente_aprovacao').length,
      rascunho: pacotes.filter(p => p.status === 'rascunho').length,
    };
  }, [pacotes]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = pacotes;
    if (statusFilter !== 'todos') {
      list = list.filter(p => p.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        (p.nome || '').toLowerCase().includes(q) ||
        (p.criado_por_nome || '').toLowerCase().includes(q) ||
        (p.descricao || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [pacotes, statusFilter, search]);

  // Actions
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePacote(deleteTarget.id);
      setDeleteTarget(null);
      load();
      setNotice({ msg: 'Pacote excluído com sucesso.', type: 'ok' });
    } catch (e) {
      setNotice({ msg: 'Erro ao excluir: ' + e.message, type: 'err' });
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(pacote) {
    setActionLoading(pacote.id);
    try {
      await submitPacote(pacote.id);
      load();
      const privileged = isPrivilegedRole(currentUser?.role);
      setNotice({ msg: privileged ? 'Pacote aprovado com sucesso.' : 'Pacote enviado para aprovação.', type: 'ok' });
    } catch (e) {
      setNotice({ msg: 'Erro ao enviar: ' + e.message, type: 'err' });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleApprove(pacote) {
    setActionLoading(pacote.id);
    try {
      await aprovarPacote(pacote.id);
      load();
      setNotice({ msg: 'Pacote aprovado com sucesso.', type: 'ok' });
    } catch (e) {
      setNotice({ msg: 'Erro ao aprovar: ' + e.message, type: 'err' });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id, motivo) {
    try {
      await rejeitarPacote(id, motivo);
      setRejectTarget(null);
      load();
      setNotice({ msg: 'Pacote rejeitado.', type: 'ok' });
    } catch (e) {
      setNotice({ msg: 'Erro ao rejeitar: ' + e.message, type: 'err' });
    }
  }

  async function handleArchive(pacote) {
    setActionLoading(pacote.id);
    try {
      await arquivarPacote(pacote.id);
      load();
      setNotice({ msg: 'Pacote arquivado.', type: 'ok' });
    } catch (e) {
      setNotice({ msg: 'Erro ao arquivar: ' + e.message, type: 'err' });
    } finally {
      setActionLoading(null);
    }
  }

  // Load analytics
  const [analyticsError, setAnalyticsError] = useState('');
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError('');
    try {
      const data = await fetchPacotesAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error('[PacotesTab] analytics error:', err);
      setAnalyticsError(err.message || 'Erro desconhecido');
    } finally { setAnalyticsLoading(false); }
  }, []);

  useEffect(() => {
    if (showAnalytics && !analytics && !analyticsError && isAdmin) loadAnalytics();
  }, [showAnalytics, analytics, analyticsError, isAdmin, loadAnalytics]);

  // Load my links
  const [linksError, setLinksError] = useState('');
  const [linksLoaded, setLinksLoaded] = useState(false);
  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    setLinksError('');
    try {
      const data = await fetchMeusCompartilhamentos();
      setMyLinks(Array.isArray(data) ? data : []);
      setLinksLoaded(true);
    } catch (err) {
      console.error('[PacotesTab] links error:', err);
      setLinksError(err.message || 'Erro desconhecido');
      setLinksLoaded(true);
    } finally { setLinksLoading(false); }
  }, []);

  useEffect(() => {
    if (showLinks && !linksLoaded) loadLinks();
  }, [showLinks, linksLoaded, loadLinks]);

  // Theme helpers
  const th = isDark
    ? { card: 'bg-[#1A1A1A] border-[#2A2A2A]', text: 'text-gray-200', muted: 'text-gray-400', hover: 'hover:bg-[#222]', inp: 'bg-[#111] border-[#333] text-gray-200' }
    : { card: 'bg-white border-gray-200', text: 'text-gray-800', muted: 'text-gray-500', hover: 'hover:bg-gray-50', inp: 'bg-white border-gray-300 text-gray-900' };

  const titleText = isDark ? 'text-white' : 'text-neutral-900';
  const subText = isDark ? 'text-brand-gray-500' : 'text-neutral-400';
  const inp = `w-full pl-8 pr-3 py-2 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-orange/30 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-500' : 'bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400'}`;

  return (
    <div className="space-y-5">
      {/* Modals */}
      {(showCreateModal || modalPacoteId) && (
        <PacoteModal
          isDark={isDark}
          pacoteId={modalPacoteId}
          pontos={activePontos}
          onClose={() => { setShowCreateModal(false); setModalPacoteId(null); }}
          onSaved={load}
        />
      )}

      {rejectTarget && (
        <RejectModal
          isDark={isDark}
          pacote={rejectTarget}
          onConfirm={handleReject}
          onClose={() => setRejectTarget(null)}
        />
      )}

      {shareTarget && (
        <SharePopover
          isDark={isDark}
          pacote={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4 border ${isDark ? 'bg-[#111] border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`}>
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Trash2 size={16} className="text-red-500" />
                Deletar Pacote
              </h3>
              <p className={`text-sm mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                Tem certeza que deseja deletar <strong>{deleteTarget.nome}</strong>? Essa ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                className={`flex-1 py-2 rounded-xl border text-sm transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deletando...' : 'Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notice */}
      {notice && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-3 ${notice.type === 'ok' ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-base font-semibold ${titleText}`}>Pacotes Comerciais</h2>
          <p className={`text-xs mt-0.5 ${subText}`}>
            {filtered.length} pacote{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className={`p-2 rounded-xl border transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-400 hover:bg-neutral-50'}`}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { setModalPacoteId(null); setShowCreateModal(true); }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FE5C2B] to-[#C94A1A] text-white text-sm font-medium hover:opacity-90 transition-all flex items-center gap-1.5"
          >
            <Plus size={14} />
            Novo Pacote
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',     value: stats.total,              color: isDark ? 'text-gray-300' : 'text-gray-600',  Icon: Package },
          { label: 'Aprovados', value: stats.aprovado,           color: 'text-green-400',                             Icon: Check },
          { label: 'Pendentes', value: stats.pendente_aprovacao, color: 'text-yellow-400',                            Icon: Loader2 },
          { label: 'Rascunhos', value: stats.rascunho,           color: isDark ? 'text-neutral-400' : 'text-neutral-500', Icon: Pencil },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 text-center ${th.card}`}>
            <div className={`flex items-center justify-center gap-1.5 text-xs font-medium ${s.color}`}>
              <s.Icon size={13} />
              {s.label}
            </div>
            <p className={`text-2xl font-bold mt-1 ${titleText}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} />
          <input
            type="text"
            placeholder="Buscar por nome, descrição ou criador..."
            className={inp}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                statusFilter === f.key
                  ? 'bg-[#FE5C2B] text-white'
                  : isDark
                    ? 'border border-white/10 text-brand-gray-400 hover:bg-white/5 hover:text-white'
                    : 'border border-neutral-200 text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Content */}
      {loading && !pacotes.length ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const isExpanded = expandedId === p.id;
            const isActionLoading = actionLoading === p.id;

            return (
              <div key={p.id} className={`rounded-xl border p-4 ${th.card} transition-colors ${th.hover}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className={`text-sm font-bold truncate ${th.text}`}>{p.nome}</h4>
                      <StatusBadge status={p.status} isDark={isDark} />
                    </div>
                    <div className={`flex items-center gap-3 flex-wrap text-xs ${th.muted}`}>
                      <span className="flex items-center gap-1">
                        <Package size={11} />
                        {p.qtd_pontos || 0} ponto{(p.qtd_pontos || 0) !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Share2 size={11} />
                        {p.qtd_compartilhamentos || 0} compartilhamento{(p.qtd_compartilhamentos || 0) !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={11} />
                        {p.qtd_leads || 0} lead{(p.qtd_leads || 0) !== 1 ? 's' : ''}
                      </span>
                      <span>Criado: {fmtDate(p.created_at)}</span>
                      {p.criado_por_nome && <span>por {p.criado_por_nome}</span>}
                    </div>
                    {p.motivo_rejeicao && (
                      <p className="text-xs text-red-400 mt-1">
                        Rejeitado: {p.motivo_rejeicao}
                      </p>
                    )}
                    {p.aprovado_em && (
                      <p className="text-xs text-green-400 mt-1">
                        Aprovado em {fmtDate(p.aprovado_em)}
                      </p>
                    )}
                    {p.descricao && isExpanded && (
                      <p className={`text-xs mt-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                        {p.descricao}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    {isActionLoading ? (
                      <Loader2 size={14} className="animate-spin text-gray-400" />
                    ) : (
                      <>
                        {canEdit(p, currentUser) && (
                          <button
                            onClick={() => setModalPacoteId(p.id)}
                            className={`p-2 rounded-lg border transition-colors ${isDark ? 'border-white/10 text-brand-gray-300 hover:bg-white/5 hover:border-white/20' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'}`}
                            title="Editar"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {canSubmit(p, currentUser) && (
                          <button
                            onClick={() => handleSubmit(p)}
                            className={`p-2 rounded-lg border transition-colors ${
                              isPrivilegedRole(currentUser?.role)
                                ? isDark ? 'border-white/10 text-green-400 hover:bg-green-500/10 hover:border-green-500/20' : 'border-green-200 text-green-600 hover:bg-green-50'
                                : isDark ? 'border-white/10 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/20' : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                            }`}
                            title={isPrivilegedRole(currentUser?.role) ? 'Aprovar pacote' : 'Enviar para aprovação'}
                          >
                            {isPrivilegedRole(currentUser?.role) ? <Check size={13} /> : <Send size={13} />}
                          </button>
                        )}
                        {canApprove(p, currentUser) && (
                          <button
                            onClick={() => handleApprove(p)}
                            className={`p-2 rounded-lg border transition-colors ${isDark ? 'border-white/10 text-green-400 hover:bg-green-500/10 hover:border-green-500/20' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                            title="Aprovar"
                          >
                            <Check size={13} />
                          </button>
                        )}
                        {canReject(p, currentUser) && (
                          <button
                            onClick={() => setRejectTarget(p)}
                            className={`p-2 rounded-lg border transition-colors ${isDark ? 'border-white/10 text-red-400 hover:bg-red-500/10 hover:border-red-500/20' : 'border-red-200 text-red-600 hover:bg-red-50'}`}
                            title="Rejeitar"
                          >
                            <X size={13} />
                          </button>
                        )}
                        {canShare(p) && (
                          <button
                            onClick={() => setShareTarget(p)}
                            className={`p-2 rounded-lg border transition-colors ${isDark ? 'border-white/10 text-[#FE5C2B] hover:bg-[#FE5C2B]/10 hover:border-[#FE5C2B]/20' : 'border-orange-200 text-[#C94A1A] hover:bg-orange-50'}`}
                            title="Compartilhar"
                          >
                            <Share2 size={13} />
                          </button>
                        )}
                        {canArchive(p, currentUser) && p.status !== 'arquivado' && (
                          <button
                            onClick={() => handleArchive(p)}
                            className={`p-2 rounded-lg border transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5 hover:border-white/20' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-100'}`}
                            title="Arquivar"
                          >
                            <Archive size={13} />
                          </button>
                        )}
                        {canDelete(p, currentUser) && (
                          <button
                            onClick={() => setDeleteTarget(p)}
                            className={`p-2 rounded-lg border transition-colors ${isDark ? 'border-red-500/30 text-red-500/60 hover:bg-red-500/10 hover:text-red-400' : 'border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600'}`}
                            title="Excluir"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : p.id)}
                          className={`p-2 rounded-lg transition-colors ${isDark ? 'text-brand-gray-500 hover:bg-white/5' : 'text-neutral-400 hover:bg-neutral-100'}`}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {!filtered.length && !loading && (
            <div className={`text-center py-12 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
              <Package size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum pacote encontrado.</p>
              <p className="text-xs mt-1">Crie um novo pacote para começar.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Meus Compartilhamentos ─────────────────────────────────────── */}
      <div className={`rounded-xl border ${th.card}`}>
        <button
          onClick={() => setShowLinks(!showLinks)}
          className={`w-full flex items-center justify-between p-4 text-left ${th.hover} rounded-xl transition-colors`}
        >
          <div className="flex items-center gap-2">
            <Link2 size={15} className="text-[#FE5C2B]" />
            <span className={`text-sm font-semibold ${th.text}`}>Meus Links Compartilhados</span>
          </div>
          {showLinks ? <ChevronUp size={14} className={th.muted} /> : <ChevronDown size={14} className={th.muted} />}
        </button>

        {showLinks && (
          <div className="px-4 pb-4">
            {linksLoading ? (
              <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
            ) : myLinks.length === 0 ? (
              linksError ? (
                <p className="text-sm py-4 text-center text-red-400">{linksError}</p>
              ) : (
                <p className={`text-sm py-4 text-center ${th.muted}`}>Nenhum link compartilhado ainda.</p>
              )
            ) : (
              <div className="space-y-2">
                {myLinks.map(link => (
                  <div key={link.id} className={`flex items-center justify-between gap-3 py-2.5 border-t ${isDark ? 'border-white/5' : 'border-neutral-100'}`}>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${th.text}`}>{link.pacote_nome}</p>
                      <div className={`flex items-center gap-3 text-xs ${th.muted}`}>
                        <span className="flex items-center gap-1"><Eye size={11} />{link.views || 0} views</span>
                        <span className="flex items-center gap-1"><Users size={11} />{link.leads || 0} leads</span>
                        <span className="flex items-center gap-1"><MousePointerClick size={11} />{link.whatsapp_clicks || 0} cliques</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openLinkAnalytics(link.id)}
                        className={`p-2 rounded-lg border transition-colors ${isDark ? 'border-white/10 text-brand-orange hover:bg-white/5' : 'border-neutral-200 text-brand-orange hover:bg-neutral-50'}`}
                        title="Ver funil de comportamento"
                      >
                        <BarChart3 size={13} />
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/pacote/${link.code}`);
                          setNotice({ msg: 'Link copiado!', type: 'ok' });
                        }}
                        className={`p-2 rounded-lg border transition-colors ${isDark ? 'border-white/10 text-brand-gray-300 hover:bg-white/5' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'}`}
                        title="Copiar link"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Analytics de funil por link ──────────────────── */}
            {linkAnalyticsLoading && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 size={16} className="animate-spin text-brand-orange" />
                <span className={`text-sm ${th.muted}`}>Carregando analytics…</span>
              </div>
            )}
            {linkAnalytics && !linkAnalyticsLoading && (
              <div className={`mt-4 rounded-xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-neutral-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={14} className="text-brand-orange" />
                    <h4 className={`text-sm font-bold ${th.text}`}>
                      Funil — {linkAnalytics.compartilhamento?.pacote_nome}
                    </h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-white/10 text-brand-gray-400' : 'bg-neutral-200 text-neutral-600'}`}>
                      {linkAnalytics.compartilhamento?.vendedor_nome}
                    </span>
                  </div>
                  <button onClick={() => setLinkAnalytics(null)} className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-neutral-200'}`}>
                    <X size={14} />
                  </button>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {[
                    { label: 'Views', val: linkAnalytics.summary?.total_views || 0, icon: '👁️' },
                    { label: 'Sessões', val: linkAnalytics.summary?.unique_sessions || 0, icon: '👤' },
                    { label: 'Interagiram', val: linkAnalytics.summary?.sessions_with_interaction || 0, icon: '👆' },
                    { label: 'Leads', val: linkAnalytics.summary?.total_leads || 0, icon: '🎯' },
                  ].map(s => (
                    <div key={s.label} className={`rounded-lg px-3 py-2 text-center ${isDark ? 'bg-white/5' : 'bg-white border border-neutral-200'}`}>
                      <span className="text-base">{s.icon}</span>
                      <p className={`text-lg font-bold ${th.text}`}>{s.val}</p>
                      <p className={`text-[10px] ${th.muted}`}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Engagement metrics */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className={`rounded-lg px-3 py-2 ${isDark ? 'bg-white/5' : 'bg-white border border-neutral-200'}`}>
                    <p className={`text-[10px] uppercase tracking-wider ${th.muted}`}>Scroll médio</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`flex-1 h-1.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}>
                        <div className="h-full rounded-full bg-brand-orange transition-all" style={{ width: `${Math.min(linkAnalytics.summary?.avg_scroll || 0, 100)}%` }} />
                      </div>
                      <span className={`text-xs font-bold ${th.text}`}>{linkAnalytics.summary?.avg_scroll || 0}%</span>
                    </div>
                  </div>
                  <div className={`rounded-lg px-3 py-2 ${isDark ? 'bg-white/5' : 'bg-white border border-neutral-200'}`}>
                    <p className={`text-[10px] uppercase tracking-wider ${th.muted}`}>Tempo médio</p>
                    <p className={`text-sm font-bold mt-1 ${th.text}`}>
                      {linkAnalytics.summary?.avg_time_secs >= 60
                        ? `${Math.floor(linkAnalytics.summary.avg_time_secs / 60)}m ${linkAnalytics.summary.avg_time_secs % 60}s`
                        : `${linkAnalytics.summary?.avg_time_secs || 0}s`}
                    </p>
                  </div>
                </div>

                {/* Funnel bars */}
                {linkAnalytics.funnel?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className={`text-[10px] uppercase tracking-wider font-semibold ${th.muted}`}>Eventos</p>
                    {linkAnalytics.funnel.map(f => {
                      const maxTotal = Math.max(...linkAnalytics.funnel.map(x => x.total), 1);
                      const LABELS = {
                        page_view: 'Abriu o link', scroll_depth: 'Rolou a página', time_on_page: 'Tempo na página',
                        section_view: 'Viu seção', point_expand: 'Expandiu ponto', point_detail_view: 'Viu detalhes',
                        selection_change: 'Selecionou pontos', duration_change: 'Mudou duração', pricing_view: 'Viu preços',
                        whatsapp_click: 'Clicou WhatsApp', interesse_submit: 'Enviou interesse', share_click: 'Compartilhou',
                      };
                      return (
                        <div key={f.event_type} className="flex items-center gap-2">
                          <span className={`text-[10px] w-28 truncate text-right ${th.muted}`}>{LABELS[f.event_type] || f.event_type}</span>
                          <div className={`flex-1 h-4 rounded ${isDark ? 'bg-white/5' : 'bg-neutral-200'}`}>
                            <div
                              className="h-full rounded bg-brand-orange/70 flex items-center justify-end pr-1"
                              style={{ width: `${Math.max((f.total / maxTotal) * 100, 8)}%`, minWidth: 24 }}
                            >
                              <span className="text-[9px] font-bold text-white">{f.total}</span>
                            </div>
                          </div>
                          <span className={`text-[10px] w-10 ${th.muted}`}>{f.unique_sessions}u</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Sessions list */}
                {linkAnalytics.sessions?.length > 0 && (
                  <div className="mt-4">
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${th.muted}`}>
                      Sessões recentes ({linkAnalytics.sessions.length})
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {linkAnalytics.sessions.slice(0, 20).map((s, i) => (
                        <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded text-[10px] ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                          <span className={`font-mono ${th.muted}`}>{s.first_event?.slice(5, 16)?.replace('T', ' ')}</span>
                          <span className={th.text}>{s.event_count} eventos</span>
                          <span className={th.muted}>scroll {s.max_scroll || 0}%</span>
                          <span className={th.muted}>{s.max_time_secs ? `${s.max_time_secs}s` : ''}</span>
                          {s.lead_submitted > 0 && <span className="text-green-500 font-bold">LEAD ✓</span>}
                          {s.whatsapp_clicks > 0 && <span className="text-brand-orange font-bold">WA</span>}
                          {s.sections_viewed && <span className={th.muted}>seções: {s.sections_viewed}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Leads */}
                {linkAnalytics.leads?.length > 0 && (
                  <div className="mt-4">
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${th.muted}`}>Leads ({linkAnalytics.leads.length})</p>
                    <div className="space-y-1">
                      {linkAnalytics.leads.map((l, i) => (
                        <div key={i} className={`flex items-center gap-3 px-2 py-1.5 rounded text-xs ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                          <span className={`font-medium ${th.text}`}>{l.nome}</span>
                          {l.empresa && <span className={th.muted}>{l.empresa}</span>}
                          {l.telefone && <span className={th.muted}>{l.telefone}</span>}
                          <span className={`text-[10px] ml-auto ${th.muted}`}>{l.created_at?.slice(0, 16)?.replace('T', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Analytics Dashboard (admin/gerente only) ───────────────────── */}
      {isAdmin && (
        <div className={`rounded-xl border ${th.card}`}>
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={`w-full flex items-center justify-between p-4 text-left ${th.hover} rounded-xl transition-colors`}
          >
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-[#FE5C2B]" />
              <span className={`text-sm font-semibold ${th.text}`}>Analytics de Pacotes</span>
            </div>
            {showAnalytics ? <ChevronUp size={14} className={th.muted} /> : <ChevronDown size={14} className={th.muted} />}
          </button>

          {showAnalytics && (
            <div className="px-4 pb-4">
              {analyticsLoading ? (
                <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
              ) : !analytics ? (
                <p className="text-sm py-4 text-center text-red-400">{analyticsError || 'Erro ao carregar analytics.'}</p>
              ) : (
                <div className="space-y-5">
                  {/* Global stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Views Total', value: analytics.pacotes.reduce((s, p) => s + (p.total_views || 0), 0), Icon: Eye, color: 'text-blue-400' },
                      { label: 'Leads Total', value: analytics.pacotes.reduce((s, p) => s + (p.total_leads || 0), 0), Icon: Users, color: 'text-green-400' },
                      { label: 'WA Clicks', value: analytics.pacotes.reduce((s, p) => s + (p.whatsapp_clicks || 0), 0), Icon: MousePointerClick, color: 'text-[#FE5C2B]' },
                      { label: 'Vendedores', value: analytics.topVendedores?.length || 0, Icon: TrendingUp, color: isDark ? 'text-neutral-300' : 'text-neutral-600' },
                    ].map(s => (
                      <div key={s.label} className={`rounded-xl border p-3 text-center ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50/50'}`}>
                        <s.Icon size={14} className={`mx-auto mb-1 ${s.color}`} />
                        <p className={`text-lg font-bold ${titleText}`}>{s.value.toLocaleString('pt-BR')}</p>
                        <p className={`text-[10px] uppercase tracking-wide font-medium ${th.muted}`}>{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-pacote table */}
                  {analytics.pacotes.length > 0 && (
                    <div>
                      <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${th.muted}`}>Performance por Pacote</h4>
                      <div className="space-y-1.5">
                        {analytics.pacotes.map(p => (
                          <div key={p.id} className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg ${isDark ? 'bg-white/[0.02]' : 'bg-neutral-50'}`}>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium truncate ${th.text}`}>{p.nome}</p>
                              <p className={`text-xs ${th.muted}`}>{p.total_compartilhamentos} link{p.total_compartilhamentos !== 1 ? 's' : ''} · {p.vendedores_ativos} vendedor{p.vendedores_ativos !== 1 ? 'es' : ''}</p>
                            </div>
                            <div className="flex items-center gap-4 shrink-0 text-xs">
                              <span className={`flex items-center gap-1 ${th.muted}`}><Eye size={11} />{p.total_views}</span>
                              <span className="flex items-center gap-1 text-green-400"><Users size={11} />{p.total_leads}</span>
                              <span className="flex items-center gap-1 text-[#FE5C2B]"><MousePointerClick size={11} />{p.whatsapp_clicks}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top vendedores */}
                  {analytics.topVendedores?.length > 0 && (
                    <div>
                      <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${th.muted}`}>Top Vendedores</h4>
                      <div className="space-y-1.5">
                        {analytics.topVendedores.map((v, i) => (
                          <div key={v.vendedor} className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg ${isDark ? 'bg-white/[0.02]' : 'bg-neutral-50'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i < 3 ? 'bg-[#FE5C2B]/15 text-[#FE5C2B]' : isDark ? 'bg-white/10 text-brand-gray-400' : 'bg-neutral-200 text-neutral-500'}`}>
                                {i + 1}
                              </span>
                              <p className={`text-sm font-medium truncate ${th.text}`}>{v.vendedor}</p>
                            </div>
                            <div className="flex items-center gap-4 shrink-0 text-xs">
                              <span className={`flex items-center gap-1 ${th.muted}`}><Link2 size={11} />{v.compartilhamentos}</span>
                              <span className={`flex items-center gap-1 ${th.muted}`}><Eye size={11} />{v.views}</span>
                              <span className="flex items-center gap-1 text-green-400"><Users size={11} />{v.leads}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={loadAnalytics}
                    disabled={analyticsLoading}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'}`}
                  >
                    <RefreshCw size={11} className={analyticsLoading ? 'animate-spin' : ''} />
                    Atualizar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
