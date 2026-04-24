/**
 * InventarioChatBot.jsx
 * AI-powered DOOH/OOH inventory chatbot — global floating FAB.
 * Uses Replicate 70B LLM with real database context injection.
 * Brand: Intermídia orange (#FE5C2B) — dark-first design.
 *
 * Lead gate: collects phone + company name before allowing chat.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle, X, Send, Loader2, RotateCcw } from 'lucide-react';
import useTheme from '../hooks/useTheme';
import { fetchInventoryChat, checkLeadStatus, captureLeadInfo, updateLeadLastMessage } from '../lib/api';
import { getOrCreateSessionId, trackEvent } from '../lib/tracking';

// ── Quick suggestions ─────────────────────────────────────────────────────────
const SUGESTOES = [
  'Gerar proposta comercial',
  'Pontos na Gleba Palhano',
  'Quais pontos em Londrina?',
  'Formatos disponíveis',
  'Ponto com maior fluxo',
  'O que é CPM?',
  'Pontos na Higienópolis',
  'Pontos disponíveis',
  'Quanto custa um painel?',
];

// ── Simple markdown renderer (bold + line breaks) ─────────────────────────────
function linkifyText(text, keyPrefix) {
  const urlRegex = /(https?:\/\/[^\s<>")]+|wa\.me\/[^\s<>")]+)/gi;
  const parts = String(text || '').split(urlRegex);
  if (parts.length === 1) return text;

  return parts.map((part, idx) => {
    if (!part) return null;
    if (/^(https?:\/\/|wa\.me\/)/i.test(part)) {
      const href = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a
          key={`${keyPrefix}-${idx}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-brand-orange/60 text-brand-orange hover:text-brand-orange-hover break-all"
        >
          {part}
        </a>
      );
    }
    return <span key={`${keyPrefix}-${idx}`}>{part}</span>;
  });
}

function renderMarkdown(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    const formatted = parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <strong key={j}>{part.slice(1, -1)}</strong>;
      }
      return linkifyText(part, `${i}-${j}`);
    });
    return (
      <span key={i}>
        {formatted}
        {i < lines.length - 1 && <br />}
      </span>
    );
  });
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Mensagem({ msg, isDark }) {
  const isBot = msg.role === 'bot';
  const isError = msg.error;

  const bubbleBase = 'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm';
  const bubbleBot = isDark
    ? `${bubbleBase} bg-brand-gray-900 text-gray-100 border border-white/10 rounded-tl-sm`
    : `${bubbleBase} bg-white text-gray-800 border border-gray-200 rounded-tl-sm`;
  const bubbleUser = `${bubbleBase} bg-brand-orange text-white rounded-tr-sm ml-auto`;
  const bubbleError = isDark
    ? `${bubbleBase} bg-red-900/40 text-red-300 border border-red-700/30 rounded-tl-sm`
    : `${bubbleBase} bg-red-50 text-red-700 border border-red-200 rounded-tl-sm`;

  return (
    <div className={`flex items-end gap-2 ${isBot ? '' : 'flex-row-reverse'}`}>
      {isBot && (
        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs
          ${isDark ? 'bg-brand-orange/20 text-brand-orange' : 'bg-orange-100 text-brand-orange'}`}>
          <img src="/mascote.png" alt="Bot" className="w-full h-full rounded-full object-cover" />
        </div>
      )}
      <div className={isError ? bubbleError : isBot ? bubbleBot : bubbleUser}>
        {isBot ? renderMarkdown(msg.text) : msg.text}
        {msg.timestamp && (
          <div className={`text-[10px] mt-1 ${isBot
            ? isDark ? 'text-brand-gray-500' : 'text-gray-400'
            : 'text-white/60'}`}>
            {msg.timestamp}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Suggestion chip ───────────────────────────────────────────────────────────
function SugestaoChip({ texto, isDark, onClick }) {
  return (
    <button
      onClick={() => onClick(texto)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap
        ${isDark
          ? 'bg-brand-gray-900 border-white/10 text-brand-gray-400 hover:bg-brand-gray-800 hover:border-brand-orange/40 hover:text-brand-orange'
          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-orange-50 hover:border-brand-orange/40 hover:text-brand-orange'
        }`}
    >
      {texto}
    </button>
  );
}

function horaAtual() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function isValidPhone(text) {
  const digits = text.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InventarioChatBot() {
  const isDark = useTheme();
  const location = useLocation();

  const [aberto, setAberto] = useState(false);
  const [sessionId] = useState(getOrCreateSessionId);
  const [mensagens, setMensagens] = useState([]);
  const [input, setInput] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Lead gate state machine: checking | greeting | collecting_empresa | collecting_telefone | collecting_orcamento | collecting_origem | ready
  const [gatePhase, setGatePhase] = useState('checking');
  const [leadInfo, setLeadInfo] = useState({ empresa: '', telefone: '', orcamento: '', origem: '' });

  // Hide on /comercial/gestao (ComercialChatBot owns that page)
  // Hide when MidiaKit slides presentation is active
  const [slidesActive, setSlidesActive] = useState(false);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setSlidesActive(document.body.hasAttribute('data-slides-active'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-slides-active'] });
    setSlidesActive(document.body.hasAttribute('data-slides-active'));
    return () => observer.disconnect();
  }, []);

  // Check lead status on mount
  useEffect(() => {
    if (!sessionId) return;
    checkLeadStatus(sessionId)
      .then(data => {
        if (data.captured) {
          setGatePhase('ready');
          setLeadInfo({ empresa: data.empresa || '', telefone: data.telefone || '', orcamento: data.orcamento || '', origem: data.origem || '' });
          setMensagens([{
            role: 'bot',
            text: `Olá novamente! Como posso te ajudar hoje? Pergunte sobre pontos, formatos, cidades ou conceitos de mídia externa.`,
            timestamp: horaAtual(),
          }]);
        } else {
          setGatePhase('greeting');
          setMensagens([{
            role: 'bot',
            text: 'Olá! Sou o Especialista de Mídia Externa da Rede Intermídia.\n\nPosso te ajudar com informações sobre nosso inventário de mídia digital, formatos, pontos disponíveis e muito mais.\n\nPara começar, qual o *nome da sua empresa*?',
            timestamp: horaAtual(),
          }]);
        }
      })
      .catch(() => {
        setGatePhase('greeting');
        setMensagens([{
          role: 'bot',
          text: 'Olá! Sou o Especialista de Mídia Externa da Rede Intermídia.\n\nPosso te ajudar com informações sobre nosso inventário de mídia digital, formatos, pontos disponíveis e muito mais.\n\nPara começar, qual o *nome da sua empresa*?',
          timestamp: horaAtual(),
        }]);
      });
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => {
    if (aberto) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens, aberto]);

  // Focus input on open
  useEffect(() => {
    if (aberto) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setUnread(0);
    }
  }, [aberto]);

  // Must be after ALL hooks — React requires consistent hook call order
  const hidden = location.pathname === '/comercial/gestao' || slidesActive;

  const enviarMensagem = useCallback(async (textoForce) => {
    const texto = (textoForce ?? input).trim();
    if (!texto || carregando) return;

    const msgUsuario = { role: 'user', text: texto, timestamp: horaAtual() };
    setMensagens(prev => [...prev, msgUsuario]);
    setInput('');

    // ── Lead gate flow ────────────────────────────────────────────
    if (gatePhase === 'greeting' || gatePhase === 'collecting_empresa') {
      setLeadInfo(prev => ({ ...prev, empresa: texto }));
      setGatePhase('collecting_telefone');
      setMensagens(prev => [...prev, {
        role: 'bot',
        text: `*${texto}* — anotado!\n\nAgora, qual o seu *telefone para contato*? (com DDD)`,
        timestamp: horaAtual(),
      }]);
      return;
    }

    if (gatePhase === 'collecting_telefone') {
      if (!isValidPhone(texto)) {
        setMensagens(prev => [...prev, {
          role: 'bot',
          text: 'Hmm, não consegui identificar o número. Por favor, informe seu telefone com DDD.\n\nExemplo: *(43) 99999-9999*',
          timestamp: horaAtual(),
        }]);
        return;
      }
      const cleanPhone = texto.replace(/\D/g, '');
      setLeadInfo(prev => ({ ...prev, telefone: cleanPhone }));
      setGatePhase('collecting_orcamento');
      setMensagens(prev => [...prev, {
        role: 'bot',
        text: 'Anotado! Agora uma pergunta rápida:\n\nVocê tem um *orçamento limite* que não gostaria de ultrapassar? Assim faremos a seleção de acordo com seu caixa.\n\n_(Se preferir não informar, digite "Não sei ainda")_',
        timestamp: horaAtual(),
      }]);
      return;
    }

    if (gatePhase === 'collecting_orcamento') {
      setLeadInfo(prev => ({ ...prev, orcamento: texto }));
      setGatePhase('collecting_origem');
      setMensagens(prev => [...prev, {
        role: 'bot',
        text: 'Perfeito!\n\nPor último: *como você ficou sabendo da Intermídia?*\n\n_(Ex: Google, indicação, redes sociais, outdoor...)_',
        timestamp: horaAtual(),
      }]);
      return;
    }

    if (gatePhase === 'collecting_origem') {
      const orcamento = leadInfo.orcamento;
      const origem = texto;
      setLeadInfo(prev => ({ ...prev, origem }));
      setCarregando(true);
      try {
        await captureLeadInfo({ sessionId, telefone: leadInfo.telefone, empresa: leadInfo.empresa, orcamento, origem });
      } catch { /* silent */ }
      setCarregando(false);
      setGatePhase('ready');
      setMensagens(prev => [...prev, {
        role: 'bot',
        text: 'Perfeito! Agora posso te ajudar com todo nosso inventário de mídia externa.\n\nPergunte o que quiser — pontos, formatos, cidades, preços ou conceitos de OOH.\n\nSe quiser, posso também *gerar sua proposta comercial* agora mesmo.',
        timestamp: horaAtual(),
      }]);
      return;
    }

    // ── Normal chat flow (gatePhase === 'ready') ─────────────────
    setCarregando(true);
    trackEvent('chatbot_message', { message_length: texto.length });

    // Save last user message to lead record (best-effort, silent)
    try { updateLeadLastMessage({ sessionId, mensagem: texto }); } catch { /* silent */ }

    try {
      const allMsgs = [...mensagens, msgUsuario];
      const history = allMsgs
        .filter(m => m.role !== 'bot' || !m.text.includes('Especialista de Mídia Externa'))
        .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', text: m.text }));

      const data = await fetchInventoryChat(texto, history, sessionId);
      const msgBot = {
        role: 'bot',
        text: data.response || 'Não consegui processar sua pergunta.',
        timestamp: horaAtual(),
      };
      setMensagens(prev => [...prev, msgBot]);
      if (!aberto) setUnread(u => u + 1);
    } catch (err) {
      setMensagens(prev => [...prev, {
        role: 'bot',
        text: `Erro ao consultar: ${err.message}. Tente novamente.`,
        timestamp: horaAtual(),
        error: true,
      }]);
    } finally {
      setCarregando(false);
    }
  }, [input, carregando, aberto, mensagens, sessionId, gatePhase, leadInfo.empresa, leadInfo.telefone, leadInfo.orcamento]);

  if (hidden) return null;

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  }

  function limparConversa() {
    // Keep sessionId to preserve lead association
    setMensagens([{
      role: 'bot',
      text: gatePhase === 'ready'
        ? 'Conversa reiniciada!\n\nComo posso ajudar? Pergunte sobre pontos, formatos, cidades ou conceitos de mídia externa.'
        : 'Olá! Sou o Especialista de Mídia Externa da Rede Intermídia.\n\nPara começar, qual o *nome da sua empresa*?',
      timestamp: horaAtual(),
    }]);
    if (gatePhase !== 'ready') {
      setGatePhase('greeting');
      setLeadInfo({ empresa: '', telefone: '', orcamento: '', origem: '' });
    }
  }

  const isGating = gatePhase !== 'ready' && gatePhase !== 'checking';
  const inputPlaceholder = gatePhase === 'collecting_telefone'
    ? '(43) 99999-9999'
    : gatePhase === 'collecting_orcamento'
      ? 'Ex: R$ 5.000/mês ou "Não sei ainda"'
      : gatePhase === 'collecting_origem'
        ? 'Ex: Google, indicação, redes sociais...'
        : gatePhase === 'greeting' || gatePhase === 'collecting_empresa'
          ? 'Nome da empresa...'
          : 'Pergunte sobre o inventário...';

  // ── Styles (brand colors) ─────────────────────────────────────────────────
  const panelBg   = isDark ? 'bg-brand-black border-white/10' : 'bg-gray-50 border-gray-200';
  const headerBg  = isDark ? 'bg-brand-gray-900 border-white/10' : 'bg-white border-gray-200';
  const msgArea   = isDark ? 'bg-brand-dark' : 'bg-gray-100/50';
  const inputBg   = isDark ? 'bg-brand-gray-900 border-white/10 text-white placeholder:text-brand-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400';
  const inputWrap = isDark ? 'bg-brand-gray-900 border-white/10' : 'bg-white border-gray-200';

  return (
    <>
      {/* ── Chat panel — positioned to the left of WhatsApp FAB ─────── */}
      <div
        className={`fixed bottom-24 right-6 z-[9980] w-[360px] max-w-[calc(100vw-2rem)]
          flex flex-col rounded-2xl border shadow-2xl overflow-hidden
          transition-all duration-300 ease-in-out
          ${panelBg}
          ${aberto ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}
        `}
        style={{ height: aberto ? '520px' : '0px', maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${headerBg} flex-shrink-0`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center
              ${isDark ? 'bg-brand-orange/20' : 'bg-orange-100'}`}>
              <img src="/mascote.png" alt="Bot" className="w-full h-full rounded-full object-cover object-[50%_20%]" />
            </div>
            <div>
              <p className={`text-sm font-semibold leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Especialista de Mídia Externa
              </p>
              <p className={`text-[11px] ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                ● Online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={limparConversa}
              title="Reiniciar conversa"
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => setAberto(false)}
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${msgArea}`} style={{ scrollbarWidth: 'thin' }}>
          {mensagens.map((msg, i) => (
            <Mensagem key={i} msg={msg} isDark={isDark} />
          ))}

          {/* Typing indicator */}
          {carregando && (
            <div className="flex items-end gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center
                ${isDark ? 'bg-brand-orange/20 text-brand-orange' : 'bg-orange-100 text-brand-orange'}`}>
                <img src="/mascote.png" alt="Bot" className="w-full h-full rounded-full object-cover object-[50%_20%]" />
              </div>
              <div className={`px-4 py-2.5 rounded-2xl rounded-tl-sm border
                ${isDark ? 'bg-brand-gray-900 border-white/10' : 'bg-white border-gray-200'}`}>
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-brand-orange/60" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-brand-orange/60" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-brand-orange/60" style={{ animationDelay: '300ms' }} />
                </div>
                <p className={`text-[10px] mt-1 ${isDark ? 'text-brand-gray-500' : 'text-gray-400'}`}>
                  {isGating ? 'Registrando...' : 'Consultando inventário...'}
                </p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions — only visible when gate is complete */}
        {!isGating && (
          <div className={`flex-shrink-0 px-3 py-2 border-t overflow-x-auto ${isDark ? 'border-white/5' : 'border-gray-200'}`}
            style={{ scrollbarWidth: 'none' }}>
            <div className="flex gap-2 w-max">
              {SUGESTOES.map(s => (
                <SugestaoChip key={s} texto={s} isDark={isDark} onClick={enviarMensagem} />
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className={`flex-shrink-0 p-3 border-t ${inputWrap}`}>
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={inputPlaceholder}
              disabled={carregando || gatePhase === 'checking'}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none
                focus:ring-2 focus:ring-brand-orange/30 transition-all ${inputBg}`}
            />
            <button
              onClick={() => enviarMensagem()}
              disabled={!input.trim() || carregando || gatePhase === 'checking'}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-brand-orange text-white flex items-center justify-center
                hover:bg-brand-orange-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow"
            >
              {carregando
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={15} />
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Floating FAB — left of WhatsApp button ──────────────────── */}
      <button
        onClick={() => {
          setAberto(o => {
            if (!o) trackEvent('chatbot_open');
            return !o;
          });
        }}
        className={`fixed bottom-6 right-6 z-[9989] w-14 h-14 rounded-full
          flex items-center justify-center transition-all duration-300 group
          ${aberto
            ? isDark ? 'bg-brand-gray-800 text-white shadow-lg' : 'bg-gray-700 text-white shadow-lg'
            : 'text-white hover:scale-[1.06]'
          }`}
        style={aberto
          ? { filter: 'none' }
          : {
              background: 'linear-gradient(135deg, #FE5C2B 0%, #E85A1A 55%, #C94A1A 100%)',
              boxShadow: '0 10px 30px -8px rgba(254, 92, 43, 0.55), 0 4px 12px -2px rgba(254, 92, 43, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
            }
        }
        title="Especialista DOOH"
      >
        {/* Pulse ring — only when closed & there's unread (or always for attention) */}
        {!aberto && (
          <>
            <span className="absolute inset-0 rounded-full bg-brand-orange/40 animate-ping opacity-60" style={{ animationDuration: '2.5s' }} />
            <span className="absolute inset-0 rounded-full ring-2 ring-white/25" />
          </>
        )}
        <span className={`relative transition-transform duration-300 ${aberto ? 'rotate-0' : 'group-hover:scale-110'}`}>
          {aberto ? <X size={22} /> : <MessageCircle size={22} strokeWidth={2.2} />}
        </span>

        {/* Unread badge */}
        {!aberto && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unread}
          </span>
        )}
      </button>

      {/* Speech-balloon label — visible when FAB is closed, hidden on mobile */}
      {!aberto && (
        <div
          onClick={() => setAberto(true)}
          className="fixed bottom-[28px] right-[84px] z-[9988] cursor-pointer
            hidden sm:flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-2xl
            whitespace-nowrap transition-all duration-300 hover:-translate-x-0.5
            animate-fade-in group/balloon"
          style={{
            background: isDark
              ? 'linear-gradient(135deg, rgba(26,26,26,0.96) 0%, rgba(15,15,15,0.96) 100%)'
              : 'linear-gradient(135deg, #ffffff 0%, #fffaf6 100%)',
            border: isDark ? '1px solid rgba(254, 92, 43, 0.35)' : '1px solid rgba(254, 92, 43, 0.25)',
            boxShadow: isDark
              ? '0 10px 28px -10px rgba(0,0,0,0.55), 0 2px 6px rgba(254,92,43,0.12)'
              : '0 10px 28px -10px rgba(254, 92, 43, 0.28), 0 2px 6px rgba(0,0,0,0.05)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Mini avatar with sparkle */}
          <span
            className="flex items-center justify-center w-7 h-7 rounded-full text-white shrink-0 transition-transform duration-300 group-hover/balloon:scale-110 group-hover/balloon:rotate-6"
            style={{
              background: 'linear-gradient(135deg, #FE5C2B 0%, #E85A1A 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 6px rgba(254,92,43,0.4)',
            }}
          >
            <i className="ri-sparkling-2-line" style={{ fontSize: 14 }} />
          </span>

          <div className="flex flex-col leading-tight">
            <span className={`text-[9px] font-bold uppercase tracking-[0.14em] ${isDark ? 'text-brand-orange' : 'text-[#C94A1A]'}`}>
              IA · 24h
            </span>
            <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              Fale com nosso especialista DOOH
            </span>
          </div>

          {/* Balloon tail pointing right toward the FAB */}
          <span
            aria-hidden
            className="absolute top-1/2 -translate-y-1/2 -right-[7px] w-3.5 h-3.5 rotate-45"
            style={{
              background: isDark
                ? 'linear-gradient(135deg, rgba(26,26,26,0.96) 0%, rgba(15,15,15,0.96) 100%)'
                : 'linear-gradient(135deg, #ffffff 0%, #fffaf6 100%)',
              borderRight: isDark ? '1px solid rgba(254, 92, 43, 0.35)' : '1px solid rgba(254, 92, 43, 0.25)',
              borderTop: isDark ? '1px solid rgba(254, 92, 43, 0.35)' : '1px solid rgba(254, 92, 43, 0.25)',
            }}
          />
        </div>
      )}
    </>
  );
}
