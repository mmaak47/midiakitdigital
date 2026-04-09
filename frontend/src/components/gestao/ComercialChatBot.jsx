/**
 * ComercialChatBot.jsx
 * Chatbot de Gestão Comercial — motor baseado em intenções, sem IA.
 * Flutua como botão no canto inferior direito da página.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Loader2, RotateCcw, Bot } from 'lucide-react';

// ─── Sugestões rápidas ────────────────────────────────────────────────────────
const SUGESTOES = [
  'Quanto falta pra meta?',
  'Quem mais vendeu esse mês?',
  'Qual o atingimento da meta?',
  'Total de vendas esse mês',
  'Mostre o ranking',
  'Histórico do ano',
  'Ticket médio',
  'Quem está sem venda?',
  'Projeção do mês',
  'Contratos ativos',
];

// ─── Formata markdown simples (*negrito*, bullet •) ───────────────────────────
function renderMarkdown(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Negrito: *texto*
    const parts = line.split(/(\*[^*]+\*)/g);
    const formatted = parts.map((part, j) => {
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

// ─── Mensagem individual ──────────────────────────────────────────────────────
function Mensagem({ msg, isDark }) {
  const isBot = msg.role === 'bot';
  const isError = msg.error;

  const bubbleBase = 'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm';
  const bubbleBot = isDark
    ? `${bubbleBase} bg-gray-800 text-gray-100 border border-gray-700 rounded-tl-sm`
    : `${bubbleBase} bg-white text-gray-800 border border-gray-200 rounded-tl-sm`;
  const bubbleUser = `${bubbleBase} bg-orange-500 text-white rounded-tr-sm ml-auto`;
  const bubbleError = isDark
    ? `${bubbleBase} bg-red-900/40 text-red-300 border border-red-700/30 rounded-tl-sm`
    : `${bubbleBase} bg-red-50 text-red-700 border border-red-200 rounded-tl-sm`;

  return (
    <div className={`flex items-end gap-2 ${isBot ? '' : 'flex-row-reverse'}`}>
      {isBot && (
        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs
          ${isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-600'}`}>
          <Bot size={14} />
        </div>
      )}
      <div className={isError ? bubbleError : isBot ? bubbleBot : bubbleUser}>
        {isBot ? renderMarkdown(msg.text) : msg.text}
        {msg.timestamp && (
          <div className={`text-[10px] mt-1 ${isBot
            ? isDark ? 'text-gray-600' : 'text-gray-400'
            : 'text-orange-200'}`}>
            {msg.timestamp}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chip de sugestão ─────────────────────────────────────────────────────────
function SugestaoChip({ texto, isDark, onClick }) {
  return (
    <button
      onClick={() => onClick(texto)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap
        ${isDark
          ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-orange-500/50 hover:text-orange-300'
          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600'
        }`}
    >
      {texto}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ComercialChatBot({ isDark }) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([
    {
      role: 'bot',
      text: '👋 Olá! Sou o assistente comercial.\n\nPosso responder perguntas sobre metas, rankings, atingimentos e tendências de vendas.\n\nDigite *ajuda* para ver tudo que posso fazer!',
      timestamp: horaAtual(),
    }
  ]);
  const [input, setInput] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll automático para o fim
  useEffect(() => {
    if (aberto) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensagens, aberto]);

  // Foca o input ao abrir
  useEffect(() => {
    if (aberto) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setUnread(0);
    }
  }, [aberto]);

  function horaAtual() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  const enviarMensagem = useCallback(async (textoForce) => {
    const texto = (textoForce ?? input).trim();
    if (!texto || carregando) return;

    const msgUsuario = { role: 'user', text: texto, timestamp: horaAtual() };
    setMensagens(prev => [...prev, msgUsuario]);
    setInput('');
    setCarregando(true);

    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await fetch('/api/comercial/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify({ mensagem: texto }),
      });
      const data = await res.json();

      const msgBot = {
        role: 'bot',
        text: data.resposta || 'Não consegui processar sua pergunta.',
        timestamp: horaAtual(),
      };
      setMensagens(prev => [...prev, msgBot]);

      // Incrementa badge se o chat estiver fechado
      if (!aberto) setUnread(u => u + 1);

    } catch (err) {
      setMensagens(prev => [...prev, {
        role: 'bot',
        text: `⚠️ Erro ao consultar: ${err.message}`,
        timestamp: horaAtual(),
        error: true,
      }]);
    } finally {
      setCarregando(false);
    }
  }, [input, carregando, aberto]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  }

  function limparConversa() {
    setMensagens([{
      role: 'bot',
      text: '🔄 Conversa reiniciada!\n\nComo posso ajudar? Digite *ajuda* para ver os comandos.',
      timestamp: horaAtual(),
    }]);
  }

  // ─── Estilos ──────────────────────────────────────────────────────────────
  const panelBg   = isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200';
  const headerBg  = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const msgArea   = isDark ? 'bg-gray-950' : 'bg-gray-100/50';
  const inputBg   = isDark ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400';
  const inputWrap = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  return (
    <>
      {/* ── Painel do chat ───────────────────────────────────────────────── */}
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
              ${isDark ? 'bg-orange-500/20' : 'bg-orange-100'}`}>
              <Bot size={16} className={isDark ? 'text-orange-400' : 'text-orange-600'} />
            </div>
            <div>
              <p className={`text-sm font-semibold leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Assistente Comercial
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

        {/* Área de mensagens */}
        <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${msgArea}`} style={{ scrollbarWidth: 'thin' }}>
          {mensagens.map((msg, i) => (
            <Mensagem key={i} msg={msg} isDark={isDark} />
          ))}

          {/* Indicador de digitação */}
          {carregando && (
            <div className="flex items-end gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center
                ${isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-600'}`}>
                <Bot size={14} />
              </div>
              <div className={`px-4 py-2.5 rounded-2xl rounded-tl-sm border
                ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex gap-1 items-center h-4">
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? 'bg-gray-400' : 'bg-gray-500'}`} style={{ animationDelay: '0ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? 'bg-gray-400' : 'bg-gray-500'}`} style={{ animationDelay: '150ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? 'bg-gray-400' : 'bg-gray-500'}`} style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Sugestões */}
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
              placeholder="Pergunte sobre as vendas..."
              disabled={carregando}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none
                focus:ring-2 focus:ring-orange-500/30 transition-all ${inputBg}`}
            />
            <button
              onClick={() => enviarMensagem()}
              disabled={!input.trim() || carregando}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center
                hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow"
            >
              {carregando
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={15} />
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Botão flutuante ──────────────────────────────────────────────── */}
      <button
        onClick={() => setAberto(o => !o)}
        className={`fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg
          flex items-center justify-center transition-all duration-300 group
          ${aberto
            ? isDark ? 'bg-gray-700 text-white' : 'bg-gray-600 text-white'
            : 'bg-orange-500 hover:bg-orange-600 text-white'
          }`}
        title="Assistente Comercial"
      >
        <span className={`transition-transform duration-300 ${aberto ? 'rotate-0' : 'group-hover:scale-110'}`}>
          {aberto ? <X size={22} /> : <MessageCircle size={22} />}
        </span>

        {/* Badge de não-lidos */}
        {!aberto && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
    </>
  );
}
