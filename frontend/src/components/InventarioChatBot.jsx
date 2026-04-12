/**
 * InventarioChatBot.jsx
 * AI-powered DOOH/OOH inventory chatbot — global floating FAB.
 * Uses Replicate 70B LLM with real database context injection.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle, X, Send, Loader2, RotateCcw, Bot, Radio } from 'lucide-react';
import useTheme from '../hooks/useTheme';

// ── Quick suggestions ─────────────────────────────────────────────────────────
const SUGESTOES = [
  'Quais pontos em Londrina?',
  'Formatos disponíveis',
  'Ponto com maior fluxo',
  'O que é CPM?',
  'Resumo de Maringá',
  'Diferença LED vs Elevador',
  'Pontos disponíveis',
  'Quanto custa um painel?',
];

// ── Simple markdown renderer (bold + line breaks) ─────────────────────────────
function renderMarkdown(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Bold: **text** or *text*
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    const formatted = parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <strong key={j}>{part.slice(1, -1)}</strong>;
      }
      return part;
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
    ? `${bubbleBase} bg-gray-800 text-gray-100 border border-gray-700 rounded-tl-sm`
    : `${bubbleBase} bg-white text-gray-800 border border-gray-200 rounded-tl-sm`;
  const bubbleUser = `${bubbleBase} bg-blue-600 text-white rounded-tr-sm ml-auto`;
  const bubbleError = isDark
    ? `${bubbleBase} bg-red-900/40 text-red-300 border border-red-700/30 rounded-tl-sm`
    : `${bubbleBase} bg-red-50 text-red-700 border border-red-200 rounded-tl-sm`;

  return (
    <div className={`flex items-end gap-2 ${isBot ? '' : 'flex-row-reverse'}`}>
      {isBot && (
        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs
          ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
          <Radio size={14} />
        </div>
      )}
      <div className={isError ? bubbleError : isBot ? bubbleBot : bubbleUser}>
        {isBot ? renderMarkdown(msg.text) : msg.text}
        {msg.timestamp && (
          <div className={`text-[10px] mt-1 ${isBot
            ? isDark ? 'text-gray-600' : 'text-gray-400'
            : 'text-blue-200'}`}>
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
          ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-blue-500/50 hover:text-blue-300'
          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600'
        }`}
    >
      {texto}
    </button>
  );
}

function horaAtual() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InventarioChatBot() {
  const isDark = useTheme();
  const location = useLocation();

  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([
    {
      role: 'bot',
      text: 'Olá! Sou o Especialista DOOH da Rede Intermídia.\n\nPosso responder perguntas sobre nosso inventário de mídia digital, formatos, pontos disponíveis e conceitos de OOH.\n\nExperimente perguntar algo!',
      timestamp: horaAtual(),
    },
  ]);
  const [input, setInput] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Hide on /comercial/gestao (ComercialChatBot owns that page)
  if (location.pathname === '/comercial/gestao') return null;

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

  const enviarMensagem = useCallback(async (textoForce) => {
    const texto = (textoForce ?? input).trim();
    if (!texto || carregando) return;

    const msgUsuario = { role: 'user', text: texto, timestamp: horaAtual() };
    setMensagens(prev => [...prev, msgUsuario]);
    setInput('');
    setCarregando(true);

    try {
      // Build history from all messages (skip the initial welcome)
      const allMsgs = [...mensagens, msgUsuario];
      const history = allMsgs
        .filter((_, i) => i > 0) // skip welcome message
        .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', text: m.text }));

      const token = typeof window !== 'undefined' ? sessionStorage.getItem('admin_token') : null;
      const res = await fetch('/api/inventory-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: texto, history }),
      });

      const data = await res.json();
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
  }, [input, carregando, aberto, mensagens]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  }

  function limparConversa() {
    setMensagens([{
      role: 'bot',
      text: 'Conversa reiniciada!\n\nComo posso ajudar? Pergunte sobre pontos, formatos, cidades ou conceitos de mídia DOOH.',
      timestamp: horaAtual(),
    }]);
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const panelBg   = isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200';
  const headerBg  = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const msgArea   = isDark ? 'bg-gray-950' : 'bg-gray-100/50';
  const inputBg   = isDark ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400';
  const inputWrap = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  return (
    <>
      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-20 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)]
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
              ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
              <Radio size={16} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
            </div>
            <div>
              <p className={`text-sm font-semibold leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Especialista DOOH
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
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => setAberto(false)}
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
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

          {/* Typing indicator (enhanced for LLM latency) */}
          {carregando && (
            <div className="flex items-end gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center
                ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                <Radio size={14} />
              </div>
              <div className={`px-4 py-2.5 rounded-2xl rounded-tl-sm border
                ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex gap-1 items-center h-4">
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? 'bg-gray-400' : 'bg-gray-500'}`} style={{ animationDelay: '0ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? 'bg-gray-400' : 'bg-gray-500'}`} style={{ animationDelay: '150ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? 'bg-gray-400' : 'bg-gray-500'}`} style={{ animationDelay: '300ms' }} />
                </div>
                <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Consultando inventário...
                </p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        <div className={`flex-shrink-0 px-3 py-2 border-t overflow-x-auto ${isDark ? 'border-gray-800' : 'border-gray-200'}`}
          style={{ scrollbarWidth: 'none' }}>
          <div className="flex gap-2 w-max">
            {SUGESTOES.map(s => (
              <SugestaoChip key={s} texto={s} isDark={isDark} onClick={enviarMensagem} />
            ))}
          </div>
        </div>

        {/* Input */}
        <div className={`flex-shrink-0 p-3 border-t ${inputWrap}`}>
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre o inventário..."
              disabled={carregando}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none
                focus:ring-2 focus:ring-blue-500/30 transition-all ${inputBg}`}
            />
            <button
              onClick={() => enviarMensagem()}
              disabled={!input.trim() || carregando}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center
                hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow"
            >
              {carregando
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={15} />
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Floating FAB ────────────────────────────────────────────────── */}
      <button
        onClick={() => setAberto(o => !o)}
        className={`fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg
          flex items-center justify-center transition-all duration-300 group
          ${aberto
            ? isDark ? 'bg-gray-700 text-white' : 'bg-gray-600 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        title="Especialista DOOH"
      >
        <span className={`transition-transform duration-300 ${aberto ? 'rotate-0' : 'group-hover:scale-110'}`}>
          {aberto ? <X size={22} /> : <MessageCircle size={22} />}
        </span>

        {/* Unread badge */}
        {!aberto && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
    </>
  );
}
