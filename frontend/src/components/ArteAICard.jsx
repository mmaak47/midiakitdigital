/**
 * ArteAICard.jsx
 * Card de geração de arte IA para um ponto DOOH individual.
 *
 * Props:
 *  - ponto        : objeto do ponto (id, nome, cidade, arte_largura, arte_altura, tipo)
 *  - contexto     : { segmento, cidade, proposta_id }
 *  - isDark       : boolean
 *  - onArteEscolhida : fn(pontoId, urlArte, geracaoId) → chamado quando vendedor escolhe variação
 */

import { useState, useCallback } from 'react';
import { Wand2, Upload, RefreshCw, ChevronDown, ChevronUp, Loader2, CheckCircle, ImageOff, Edit3 } from 'lucide-react';
import { gerarArteIA, previewPromptArte } from '../lib/api';

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function detectarOrientacao(w, h) {
  const ratio = (w || 1920) / (h || 1080);
  if (ratio >= 1.5)  return 'landscape';
  if (ratio <= 0.67) return 'portrait';
  return 'square';
}

function normalizarParaGeracao(w, h, mult = 16) {
  const MIN = 256, MAX = 4096;
  if (w > MAX || h > MAX) {
    const scale = Math.min(MAX / w, MAX / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  if (w < MIN) w = MIN;
  if (h < MIN) h = MIN;
  const snap = (n) => Math.round(n / mult) * mult;
  const nw = snap(w) || mult;
  const nh = snap(h) || mult;
  return { w: nw, h: nh, normalizado: nw !== w || nh !== h };
}

const ORIENTACAO_LABEL = {
  landscape: 'Paisagem',
  portrait:  'Retrato',
  square:    'Quadrado',
};

// ─────────────────────────────────────────
// BADGE DE RESOLUÇÃO
// ─────────────────────────────────────────
function ResoBadge({ wNativo, hNativo }) {
  const { w: wGer, h: hGer, normalizado } = normalizarParaGeracao(wNativo, hNativo);

  if (normalizado) {
    return (
      <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded font-mono">
        {wNativo}×{hNativo} nativo · Gera em {wGer}×{hGer} → redimensionado
      </span>
    );
  }
  return (
    <span className="text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded font-mono">
      {wNativo}×{hNativo} · Resolução exata
    </span>
  );
}

// ─────────────────────────────────────────
// SKELETON LOADER
// ─────────────────────────────────────────
function SkeletonArte({ wNativo, hNativo }) {
  const orientacao = detectarOrientacao(wNativo, hNativo);
  const aspect = orientacao === 'portrait' ? 'aspect-[9/16]' : orientacao === 'square' ? 'aspect-square' : 'aspect-video';

  return (
    <div className={`w-full ${aspect} rounded-lg bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 animate-pulse`}>
      <Loader2 size={24} className="text-brand-orange animate-spin" />
      <p className="text-xs text-brand-gray-400">
        Gerando {wNativo}×{hNativo}…
      </p>
    </div>
  );
}

// ─────────────────────────────────────────
// MINIATURA DE VARIAÇÃO
// ─────────────────────────────────────────
function MiniVariacao({ variacao, selecionada, onSelecionar }) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={`relative rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
        selecionada
          ? 'border-brand-orange shadow-[0_0_0_2px_rgba(254,92,43,0.4)]'
          : 'border-white/10 hover:border-white/30'
      }`}
      style={{ width: 96, height: 64 }}
      title={`Variação ${variacao.variacao}`}
    >
      <img
        src={variacao.url}
        alt={`Variação ${variacao.variacao}`}
        className="w-full h-full object-cover"
      />
      {selecionada && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-orange/20">
          <CheckCircle size={20} className="text-brand-orange" />
        </div>
      )}
      <span className="absolute bottom-1 right-1 text-[9px] bg-black/60 text-white px-1 rounded">
        V{variacao.variacao}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────
// EDITOR DE PROMPT
// ─────────────────────────────────────────
function PromptEditor({ promptInicial, onGerarComPrompt, carregando }) {
  const [texto, setTexto] = useState(promptInicial || '');

  return (
    <div className="mt-3 space-y-2">
      <label className="text-[11px] text-brand-gray-400 uppercase tracking-wide">Editar prompt</label>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        className="w-full text-xs bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-brand-gray-200 resize-none focus:outline-none focus:border-brand-orange/60 font-mono"
        placeholder="Descreva a arte desejada em inglês…"
      />
      <button
        type="button"
        disabled={carregando || !texto.trim()}
        onClick={() => onGerarComPrompt(texto.trim())}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-orange text-white text-xs font-medium hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {carregando ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
        Gerar com este prompt
      </button>
    </div>
  );
}

// ─────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────
export default function ArteAICard({
  ponto,
  contexto = {},
  isDark = true,
  onArteEscolhida,
}) {
  const wNativo = Number(ponto?.arte_largura || 1920);
  const hNativo = Number(ponto?.arte_altura  || 1080);
  const orientacao = detectarOrientacao(wNativo, hNativo);

  const [estado, setEstado] = useState('idle'); // idle | gerando | sucesso | erro
  const [variacoes, setVariacoes] = useState([]);
  const [variacaoSelecionada, setVariacaoSelecionada] = useState(null);
  const [geracaoId, setGeracaoId] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [erroMsg, setErroMsg] = useState('');
  const [mostrarEditor, setMostrarEditor] = useState(false);

  // Buscar preview do prompt antes de gerar
  const carregarPrompt = useCallback(async () => {
    try {
      const res = await previewPromptArte({ ponto, contexto });
      setPrompt(res.prompt || '');
    } catch {
      // silencioso
    }
  }, [ponto, contexto]);

  // Geração principal
  const gerarArte = useCallback(async (promptCustomizado = null) => {
    setEstado('gerando');
    setErroMsg('');
    setVariacoes([]);
    setVariacaoSelecionada(null);

    try {
      const res = await gerarArteIA({
        ponto_id:         ponto.id,
        proposta_id:      contexto.proposta_id || null,
        contexto:         { segmento: contexto.segmento, cidade: contexto.cidade || ponto.cidade },
        prompt_customizado: promptCustomizado || null,
      });

      setVariacoes(res.variacoes || []);
      setGeracaoId(res.geracao_id);
      setPrompt(res.prompt || '');
      setEstado('sucesso');
    } catch (err) {
      setErroMsg(err.message || 'Erro ao gerar arte');
      setEstado('erro');
    }
  }, [ponto, contexto]);

  const handleSelecionarVariacao = (variacao) => {
    setVariacaoSelecionada(variacao.variacao);
    onArteEscolhida?.(ponto.id, variacao.url, geracaoId, variacao.variacao);
  };

  const handleGerarComPrompt = (promptEditado) => {
    setMostrarEditor(false);
    gerarArte(promptEditado);
  };

  const handleAbrirEditor = async () => {
    if (!prompt) await carregarPrompt();
    setMostrarEditor((v) => !v);
  };

  // ─── RENDER ───
  const base = isDark
    ? 'border-white/10 bg-white/[0.04]'
    : 'border-neutral-200 bg-white';

  const aspect = orientacao === 'portrait'
    ? 'aspect-[9/16] max-w-[160px]'
    : orientacao === 'square'
    ? 'aspect-square max-w-[200px]'
    : 'aspect-video w-full';

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${base}`}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {ponto?.nome || `Ponto #${ponto?.id}`}
          </p>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            {ponto?.tipo} · {ponto?.cidade} · {ORIENTACAO_LABEL[orientacao]}
          </p>
          <div className="mt-1">
            <ResoBadge wNativo={wNativo} hNativo={hNativo} />
          </div>
        </div>
        {/* Botão Upload manual */}
        <button
          type="button"
          className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border flex-shrink-0 ${
            isDark
              ? 'border-white/15 text-brand-gray-400 hover:text-white hover:border-white/30'
              : 'border-neutral-300 text-neutral-500 hover:text-neutral-700'
          }`}
          title="Upload manual"
        >
          <Upload size={11} />
          Upload
        </button>
      </div>

      {/* Área de preview / skeleton / variações */}
      {estado === 'idle' && (
        <div className={`${aspect} mx-auto rounded-lg border border-dashed flex flex-col items-center justify-center gap-2 ${
          isDark ? 'border-white/15 bg-white/[0.02]' : 'border-neutral-300 bg-neutral-50'
        }`}>
          {ponto?.simulacao_arte ? (
            <img
              src={ponto.simulacao_arte}
              alt={`Arte atual – ${ponto.nome}`}
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <>
              <ImageOff size={20} className={isDark ? 'text-brand-gray-600' : 'text-neutral-400'} />
              <p className={`text-[11px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                Sem arte
              </p>
            </>
          )}
        </div>
      )}

      {estado === 'gerando' && (
        <div className={`${aspect} mx-auto`}>
          <SkeletonArte wNativo={wNativo} hNativo={hNativo} />
        </div>
      )}

      {estado === 'erro' && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          <p className="text-xs text-red-400">{erroMsg}</p>
        </div>
      )}

      {estado === 'sucesso' && variacoes.length > 0 && (
        <div className="space-y-2">
          {/* Variação selecionada em destaque */}
          {variacaoSelecionada ? (
            <div className={`${aspect} mx-auto rounded-lg overflow-hidden border-2 border-brand-orange`}>
              <img
                src={variacoes.find((v) => v.variacao === variacaoSelecionada)?.url}
                alt="Arte selecionada"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <p className={`text-xs ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
              Escolha uma variação:
            </p>
          )}

          {/* Miniaturas */}
          <div className="flex gap-2 flex-wrap">
            {variacoes.map((v) => (
              <MiniVariacao
                key={v.variacao}
                variacao={v}
                selecionada={variacaoSelecionada === v.variacao}
                onSelecionar={() => handleSelecionarVariacao(v)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center gap-2 flex-wrap">
        {(estado === 'idle' || estado === 'erro') && (
          <button
            type="button"
            onClick={() => gerarArte()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-orange text-white text-xs font-semibold hover:bg-orange-500"
          >
            <Wand2 size={13} />
            Gerar arte com IA
          </button>
        )}

        {(estado === 'sucesso' || estado === 'gerando') && (
          <button
            type="button"
            onClick={() => gerarArte()}
            disabled={estado === 'gerando'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 ${
              isDark
                ? 'border-white/15 text-brand-gray-300 hover:border-white/30 hover:text-white'
                : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
            }`}
          >
            <RefreshCw size={12} className={estado === 'gerando' ? 'animate-spin' : ''} />
            Regenerar
          </button>
        )}

        <button
          type="button"
          onClick={handleAbrirEditor}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
            isDark
              ? 'border-white/15 text-brand-gray-300 hover:border-white/30 hover:text-white'
              : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
          }`}
        >
          <Edit3 size={12} />
          Editar prompt
          {mostrarEditor ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {/* Editor de prompt (dropdown) */}
      {mostrarEditor && (
        <PromptEditor
          promptInicial={prompt}
          onGerarComPrompt={handleGerarComPrompt}
          carregando={estado === 'gerando'}
        />
      )}
    </div>
  );
}
