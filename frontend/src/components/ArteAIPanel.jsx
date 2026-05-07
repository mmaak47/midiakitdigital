/**
 * ArteAIPanel.jsx
 * Painel completo de geração de arte IA para todos os pontos de uma proposta.
 *
 * Props:
 *  - points       : array de pontos da proposta
 *  - segmento     : string (segmento do cliente)
 *  - cidade       : string | array (cidade da campanha)
 *  - propostaId   : number | null
 *  - isDark       : boolean
 *  - onArteEscolhida : fn(pontoId, urlArte, geracaoId, variacao)
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { Wand2, Layers, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Sparkles, Upload, X, Copy, ClipboardCheck } from 'lucide-react';
import ArteAICard from './ArteAICard';
import { gerarArteLoteIA, uploadArteLogo, uploadProposalImage } from '../lib/api';

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function detectarOrientacao(w, h) {
  const ratio = (w || 1920) / (h || 1080);
  if (ratio >= 1.5)  return 'landscape';
  if (ratio <= 0.67) return 'portrait';
  return 'square';
}

function normalizarRes(w, h, mult = 16) {
  const MIN = 256, MAX = 1440;
  if (w > MAX || h > MAX) {
    const scale = Math.min(MAX / w, MAX / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  if (w < MIN) w = MIN;
  if (h < MIN) h = MIN;
  const snap = (n) => Math.round(n / mult) * mult;
  return `${snap(w) || mult}x${snap(h) || mult}`;
}

function calcMdc(a, b) {
  let x = Math.abs(Number(a) || 0);
  let y = Math.abs(Number(b) || 0);
  while (y) {
    const tmp = y;
    y = x % y;
    x = tmp;
  }
  return x || 1;
}

function proporcaoKey(w, h) {
  const ww = Math.max(1, Math.round(Number(w) || 1920));
  const hh = Math.max(1, Math.round(Number(h) || 1080));
  const mdc = calcMdc(ww, hh);
  return `${Math.round(ww / mdc)}:${Math.round(hh / mdc)}`;
}

function resolvePontoPx(point) {
  const tipo = String(point?.tipo || '').toLowerCase().trim();
  const isBackOrFront = tipo === 'backlight' || tipo === 'frontlight';
  if (isBackOrFront) {
    const mw = Number(point?.midia_largura_m);
    const mh = Number(point?.midia_altura_m);
    if (Number.isFinite(mw) && mw > 0 && Number.isFinite(mh) && mh > 0) {
      const target = 2048;
      if (mw >= mh) return { w: target, h: Math.max(1, Math.round(target * mh / mw)) };
      return { w: Math.max(1, Math.round(target * mw / mh)), h: target };
    }
  }
  return {
    w: Math.max(1, Math.round(Number(point?.arte_largura) || 1920)),
    h: Math.max(1, Math.round(Number(point?.arte_altura) || 1080)),
  };
}

function getPointFormatSignature(point) {
  const { w, h } = resolvePontoPx(point);
  return {
    normalizedResolution: normalizarRes(w, h),
    aspectRatio: proporcaoKey(w, h),
    orientation: detectarOrientacao(w, h)
  };
}

// Agrupa pontos por resolução de geração
function agruparPorResolucao(points) {
  const grupos = {};
  for (const p of points) {
    const { w, h } = resolvePontoPx(p);
    const chave = normalizarRes(w, h);
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(p);
  }
  return grupos;
}

// ─────────────────────────────────────────
// PROMPT PRONTO PARA GPT IMAGE
// ─────────────────────────────────────────
function buildFormatos(points = []) {
  const map = new Map();
  for (const p of points) {
    const { w, h } = resolvePontoPx(p);
    const ratio = proporcaoKey(w, h);
    const orient = detectarOrientacao(w, h);
    const chave = `${w}x${h}`;
    if (!map.has(chave)) {
      map.set(chave, { width: w, height: h, ratio, orientation: orient, pontos: [] });
    }
    map.get(chave).pontos.push(p?.nome || `Ponto ${p?.id || ''}`);
  }
  return [...map.values()].sort((a, b) => (b.width * b.height) - (a.width * a.height));
}

function buildPromptText({ clientName, segmento, cidade, formatos }) {
  const cliente = (clientName || '').trim() || '[NOME DO CLIENTE]';
  const seg = (segmento || '').trim() || '[SEGMENTO DA MARCA]';
  const cid = (cidade || '').trim() || '[CIDADE / PRAÇA]';
  const totalFormatos = formatos.length;

  const lista = formatos.map((f, i) => {
    const orientLabel = f.orientation === 'landscape' ? 'horizontal' : f.orientation === 'portrait' ? 'vertical' : 'quadrado';
    return `  ${i + 1}. ${f.width}x${f.height} px — proporção ${f.ratio} (${orientLabel})`;
  }).join('\n');

  return `Você é um diretor de arte sênior especializado em mídia OOH/DOOH (out-of-home digital). Crie peças publicitárias profissionais para uma campanha real do cliente abaixo.

CLIENTE: ${cliente}
SEGMENTO: ${seg}
PRAÇA / CIDADE: ${cid}

TAREFA OBRIGATÓRIA:
Gere ${totalFormatos} imagem${totalFormatos !== 1 ? 'ns' : ''} — UMA imagem para CADA formato listado abaixo. Não combine formatos em uma única imagem. Cada peça deve ser entregue individualmente, na resolução exata indicada e respeitando a proporção:

${lista}

REQUISITOS DE CAMPANHA PUBLICITÁRIA (obrigatórios em todas as peças):
- Composição comercial profissional, alinhada à identidade da marca "${cliente}".
- Hierarquia visual clara: foco principal (produto/conceito) + headline curta + CTA + assinatura da marca.
- Espaço reservado (limpo) para inserção do logo do cliente no canto superior — não desenhe um logotipo fictício.
- Headline com no máximo 6 palavras, alta legibilidade mesmo a 5–10 metros de distância (peça é exibida em telas/painéis públicos).
- Tipografia sans-serif moderna, contraste alto entre texto e fundo.
- Paleta de cores coerente com o segmento "${seg}" e que se destaque em ambiente urbano com luz variável.
- Margem de segurança de 8% nas bordas (texto e elementos críticos não devem encostar nas bordas).
- Imagens fotográficas em qualidade profissional ou ilustrações vetoriais limpas — nada de aparência amadora, sem watermark, sem texto truncado, sem artefatos.
- Adapte o enquadramento e a hierarquia para a proporção de CADA formato (vertical, horizontal ou quadrado) — não apenas redimensione.
- Ambiente/contexto que remeta sutilmente à praça "${cid}" quando fizer sentido (skyline, elementos regionais, público-alvo local), sem clichês.
- Nada de texto em outro idioma além de português brasileiro.

ENTREGA:
- Entregue ${totalFormatos} arquivo${totalFormatos !== 1 ? 's' : ''} de imagem separado${totalFormatos !== 1 ? 's' : ''}, um para cada formato listado.
- Use o nome do arquivo no padrão: ${cliente.replace(/\s+/g, '_').toLowerCase()}_<largura>x<altura>.png
- Mantenha a mesma direção criativa (mesma headline, mesma paleta, mesmo conceito) entre todos os formatos — variar apenas o enquadramento.

Comece gerando o primeiro formato da lista e siga em ordem até completar todos.`;
}

function PromptGPTImage({ clientName, segmento, cidade, points, isDark }) {
  const [copiado, setCopiado] = useState(false);
  const [aberto, setAberto] = useState(false);

  const formatos = useMemo(() => buildFormatos(points), [points]);
  const prompt = useMemo(
    () => buildPromptText({ clientName, segmento, cidade, formatos }),
    [clientName, segmento, cidade, formatos]
  );

  const handleCopiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2400);
    } catch {
      // fallback silencioso
    }
  }, [prompt]);

  return (
    <div className={`rounded-xl border ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand-orange" />
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              Prompt pronto para GPT Image
            </p>
            <p className={`text-[11px] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
              {formatos.length} formato{formatos.length !== 1 ? 's' : ''} detectado{formatos.length !== 1 ? 's' : ''} · copie e cole no ChatGPT/GPT Image
            </p>
          </div>
        </div>
        {aberto ? <ChevronUp size={14} className="text-brand-gray-400" /> : <ChevronDown size={14} className="text-brand-gray-400" />}
      </button>

      {aberto && (
        <div className={`px-3 pb-3 border-t ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
          <div className="flex items-center justify-end pt-2 pb-1.5">
            <button
              type="button"
              onClick={handleCopiar}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                copiado
                  ? (isDark ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-300')
                  : 'bg-brand-orange text-white hover:bg-orange-500'
              }`}
            >
              {copiado ? <ClipboardCheck size={12} /> : <Copy size={12} />}
              {copiado ? 'Copiado!' : 'Copiar prompt'}
            </button>
          </div>

          <textarea
            readOnly
            value={prompt}
            className={`w-full h-72 rounded-lg border p-3 text-xs leading-relaxed font-mono outline-none resize-y ${
              isDark
                ? 'border-white/10 bg-black/40 text-brand-gray-200'
                : 'border-neutral-200 bg-white text-neutral-700'
            }`}
            onFocus={(e) => e.target.select()}
          />

          <p className={`mt-2 text-[11px] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            Cole no ChatGPT (com GPT Image ativo) ou em qualquer modelo de imagem que aceite múltiplos formatos. Anexe o logo do cliente junto à mensagem para que ele seja preservado nas peças.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// BARRA DE PROGRESSO DO LOTE
// ─────────────────────────────────────────
function ProgressoLote({ atual, total, erros }) {
  const pct = total > 0 ? Math.round((atual / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-brand-gray-300">
          Gerando arte {atual} de {total} pontos…
        </span>
        {erros > 0 && (
          <span className="text-red-400 flex items-center gap-1">
            <AlertCircle size={11} />
            {erros} erro{erros !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-orange rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// RESUMO DOS GRUPOS DE RESOLUÇÃO
// ─────────────────────────────────────────
function ResumoGrupos({ points }) {
  const grupos = agruparPorResolucao(points);
  const totalGrupos = Object.keys(grupos).length;
  const totalPontos = points.length;

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 text-xs text-brand-gray-400">
      <p className="mb-1.5 font-medium text-brand-gray-300">
        {totalPontos} ponto{totalPontos !== 1 ? 's' : ''} → <span className="text-brand-orange">{totalGrupos} geração{totalGrupos !== 1 ? 'ões' : ''} real{totalGrupos !== 1 ? 'is' : ''}</span> (pontos com mesma resolução compartilham arte)
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(grupos).map(([res, pts]) => (
          <span key={res} className="bg-white/5 border border-white/10 rounded px-2 py-0.5 font-mono">
            {res} × {pts.length} ponto{pts.length !== 1 ? 's' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────
export default function ArteAIPanel({
  points = [],
  segmento = '',
  cidade = '',
  clientName = '',
  propostaId = null,
  isDark = true,
  onArteEscolhida,
  manualOnly = false,
}) {
  const [expandido, setExpandido] = useState(manualOnly);
  const [loteEstado, setLoteEstado] = useState('idle'); // idle | gerando | concluido | erro
  const [loteProgresso, setLoteProgresso] = useState({ atual: 0, total: 0, erros: 0 });
  const [loteResultados, setLoteResultados] = useState([]);
  const [artesPorPonto, setArtesPorPonto] = useState({}); // pontoId → urlArte
  const [logoUrl, setLogoUrl] = useState('');
  const [logoNome, setLogoNome] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoErro, setLogoErro] = useState('');
  const [manualApplyStatus, setManualApplyStatus] = useState('');
  const logoInputRef = useRef(null);

  const cidadeStr = Array.isArray(cidade) ? cidade[0] : cidade;

  const contexto = {
    segmento,
    cidade: cidadeStr,
    clientName,
    logo_url: logoUrl,
    proposta_id: propostaId,
  };

  const handleLogoUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    setLogoErro('');
    try {
      const res = await uploadArteLogo(file);
      setLogoUrl(res.url || '');
      setLogoNome(file.name || 'logo');
    } catch (err) {
      setLogoErro(err.message || 'Falha ao enviar logo');
    } finally {
      setLogoUploading(false);
      event.target.value = '';
    }
  }, []);

  const limparLogo = useCallback(() => {
    setLogoUrl('');
    setLogoNome('');
    setLogoErro('');
  }, []);

  const handleManualUploadByFormat = useCallback(async (sourcePoint, file) => {
    if (!sourcePoint?.id) {
      throw new Error('Ponto inválido para upload manual.');
    }
    if (!file || !String(file.type || '').startsWith('image/')) {
      throw new Error('Selecione um arquivo de imagem válido.');
    }

    const sourceSignature = getPointFormatSignature(sourcePoint);
    const compatiblePoints = points.filter((candidate) => {
      const candidateSignature = getPointFormatSignature(candidate);
      const sameNormalizedResolution = candidateSignature.normalizedResolution === sourceSignature.normalizedResolution;
      const sameAspectRatio = candidateSignature.aspectRatio === sourceSignature.aspectRatio
        && candidateSignature.orientation === sourceSignature.orientation;
      return sameNormalizedResolution || sameAspectRatio;
    });

    const targetIds = compatiblePoints.map((point) => point.id);
    if (!targetIds.length) {
      throw new Error('Nenhum ponto compatível encontrado para aplicar a imagem.');
    }

    let uploadedUrl = '';
    let uploadErrorMessage = '';
    try {
      uploadedUrl = await uploadProposalImage(file);
    } catch (err) {
      uploadErrorMessage = err?.message || 'Falha de upload';
    }

    const useLocalFallback = !uploadedUrl;
    const manualUrlByPoint = useLocalFallback
      ? Object.fromEntries(targetIds.map((id) => [id, URL.createObjectURL(file)]))
      : {};

    setArtesPorPonto((prev) => {
      const next = { ...prev };
      targetIds.forEach((id) => {
        const nextUrl = useLocalFallback ? manualUrlByPoint[id] : uploadedUrl;
        const prevUrl = next[id];
        if (prevUrl && String(prevUrl).startsWith('blob:') && prevUrl !== nextUrl) {
          try { URL.revokeObjectURL(prevUrl); } catch { /* ignore */ }
        }
        next[id] = nextUrl;
      });
      return next;
    });

    let appliedCount = 0;
    let lastError = null;
    for (const point of compatiblePoints) {
      try {
        const creativeUrl = useLocalFallback ? manualUrlByPoint[point.id] : uploadedUrl;
        // Serializado para evitar corrida no pipeline de renderização da simulação.
        await onArteEscolhida?.(point.id, creativeUrl, null, 'upload_manual');
        appliedCount += 1;
      } catch (err) {
        lastError = err;
      }
    }

    if (appliedCount === 0 && lastError) {
      throw lastError;
    }

    const fallbackHint = useLocalFallback
      ? ` Modo local ativado${uploadErrorMessage ? ` (${uploadErrorMessage})` : ''}.`
      : '';
    const statusMessage = `${appliedCount} ponto(s) atualizado(s) com a arte enviada (${sourceSignature.normalizedResolution} · ${sourceSignature.aspectRatio}).${fallbackHint}`;
    setManualApplyStatus(statusMessage);
    return {
      appliedCount,
      message: statusMessage
    };
  }, [points, onArteEscolhida]);

  // ─── Geração em lote ───
  const gerarTodos = useCallback(async () => {
    if (!points.length) return;

    setLoteEstado('gerando');
    setManualApplyStatus('');
    setLoteProgresso({ atual: 0, total: points.length, erros: 0 });
    setLoteResultados([]);

    try {
      const res = await gerarArteLoteIA({
        ponto_ids:              points.map((p) => p.id),
        proposta_id:            propostaId,
        contexto:               { segmento, cidade: cidadeStr, clientName, logo_url: logoUrl },
        agrupar_por_resolucao:  true,
      });

      setLoteResultados(res.resultados || []);
      // Contar pontos atendidos (inclui compartilhados)
      const pontosAtendidos = (res.resultados || []).reduce((acc, r) => {
        return acc + 1 + (r.compartilhada_com?.length || 0);
      }, 0);

      setLoteProgresso({
        atual:  pontosAtendidos + (res.erros || []).length,
        total:  points.length,
        erros:  (res.erros || []).length,
      });

      // Pré-selecionar primeira variação de cada ponto (inclusive compartilhados)
      // IMPORTANTE: serializar as chamadas para evitar race condition no Canvas
      const novasArtes = { ...artesPorPonto };
      for (const r of res.resultados || []) {
        const primeiraVar = r.variacoes?.[0];
        if (primeiraVar) {
          // Coletar todos os pontos que usam essa arte (base + compartilhados)
          const todosIds = [r.ponto_id, ...(r.compartilhada_com || [])];
          for (const pid of todosIds) {
            novasArtes[pid] = primeiraVar.url;
          }
        }
      }
      setArtesPorPonto(novasArtes);

      // Agora disparar simulações UMA POR VEZ (serializado)
      for (const r of res.resultados || []) {
        const primeiraVar = r.variacoes?.[0];
        if (primeiraVar) {
          const todosIds = [r.ponto_id, ...(r.compartilhada_com || [])];
          for (const pid of todosIds) {
            try {
              await onArteEscolhida?.(pid, primeiraVar.url, r.geracao_id, 1);
            } catch { /* continuar com os demais */ }
          }
        }
      }

      setLoteEstado('concluido');

    } catch (err) {
      setLoteProgresso((p) => ({ ...p, erros: p.erros + 1 }));
      setLoteEstado('erro');
    }
  }, [points, propostaId, segmento, cidadeStr, clientName, logoUrl, onArteEscolhida]);

  // ─── Handler para escolha individual ───
  const handleArteEscolhida = useCallback((pontoId, urlArte, geracaoId, variacao) => {
    setArtesPorPonto((prev) => ({ ...prev, [pontoId]: urlArte }));
    setManualApplyStatus('');
    onArteEscolhida?.(pontoId, urlArte, geracaoId, variacao);
  }, [onArteEscolhida]);

  // ─── Stats de cobertura ───
  const pontosComArte = Object.keys(artesPorPonto).length;

  if (!points.length) return null;

  const base = isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-white';

  return (
    <section className={`rounded-2xl border ${base}`}>
      {/* Cabeçalho */}
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          {manualOnly ? <Upload size={16} className="text-brand-orange" /> : <Sparkles size={16} className="text-brand-orange" />}
          <div>
            <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              {manualOnly ? 'Artes por ponto' : 'Arte com IA'}
            </h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
              {pontosComArte > 0
                ? `${pontosComArte} de ${points.length} ponto${points.length !== 1 ? 's' : ''} com arte`
                : `${points.length} ponto${points.length !== 1 ? 's' : ''} sem arte atribuída`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pontosComArte > 0 && pontosComArte === points.length && (
            <CheckCircle size={14} className="text-green-400" />
          )}
          {expandido ? <ChevronUp size={16} className="text-brand-gray-400" /> : <ChevronDown size={16} className="text-brand-gray-400" />}
        </div>
      </button>

      {/* Conteúdo expandido */}
      {expandido && (
        <div className={`px-5 pb-5 space-y-4 border-t pt-4 ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
          {manualOnly && (
            <div className={`rounded-xl border px-3 py-2 text-xs ${isDark ? 'border-brand-orange/30 bg-brand-orange/10 text-brand-gray-200' : 'border-orange-300 bg-orange-50 text-orange-800'}`}>
              Upload ponto a ponto ativo: ao enviar uma arte, ela tambem sera aplicada automaticamente em pontos com mesma proporcao/resolucao.
            </div>
          )}

          {/* Upload de logo do cliente */}
          {!manualOnly && (
            <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>
                    Logo do cliente
                  </p>
                  <p className={`text-[11px] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                    Opcional. Quando enviado, o logo sera aplicado automaticamente no canto superior da arte gerada.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-orange text-white text-xs font-semibold hover:bg-orange-500 disabled:opacity-60"
                  >
                    {logoUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    {logoUploading ? 'Enviando...' : 'Adicionar logo'}
                  </button>

                  {logoUrl && (
                    <button
                      type="button"
                      onClick={limparLogo}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs ${isDark ? 'border-white/15 text-brand-gray-300 hover:text-white' : 'border-neutral-300 text-neutral-600 hover:text-neutral-900'}`}
                    >
                      <X size={11} /> Remover
                    </button>
                  )}
                </div>
              </div>

              {logoUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={logoUrl} alt="Logo cliente" className="h-8 w-auto max-w-[120px] object-contain rounded bg-white/90 p-1" />
                  <span className={`text-[11px] ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                    {logoNome || 'Logo enviado'}
                  </span>
                </div>
              )}

              {logoErro && (
                <p className="mt-2 text-xs text-red-400">{logoErro}</p>
              )}
            </div>
          )}

          {/* Resumo de grupos */}
          <ResumoGrupos points={points} />

          {/* Prompt pronto para GPT Image (geração manual fora do sistema) */}
          <PromptGPTImage
            clientName={clientName}
            segmento={segmento}
            cidade={cidadeStr}
            points={points}
            isDark={isDark}
          />

          {manualApplyStatus && (
            <div className={`rounded-xl border px-3 py-2 text-xs ${isDark ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-green-300 bg-green-50 text-green-700'}`}>
              {manualApplyStatus}
            </div>
          )}

          {/* Botão gerar todos */}
          {!manualOnly && (loteEstado === 'idle' || loteEstado === 'erro' ? (
            <button
              type="button"
              onClick={gerarTodos}
              disabled={loteEstado === 'gerando'}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-orange text-white text-sm font-semibold hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Layers size={15} />
              Gerar arte para todos os pontos
            </button>
          ) : loteEstado === 'gerando' ? (
            <div className="space-y-2">
              <button
                type="button"
                disabled
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-orange/60 text-white text-sm font-semibold cursor-not-allowed"
              >
                <Loader2 size={15} className="animate-spin" />
                Gerando...
              </button>
              <ProgressoLote
                atual={loteProgresso.atual}
                total={loteProgresso.total}
                erros={loteProgresso.erros}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 text-sm ${loteProgresso.erros > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                <CheckCircle size={14} />
                Concluido: {loteResultados.length} arte{loteResultados.length !== 1 ? 's' : ''} gerada{loteResultados.length !== 1 ? 's' : ''}
                {loteProgresso.erros > 0 && ` · ${loteProgresso.erros} erro(s)`}
              </div>
              <button
                type="button"
                onClick={gerarTodos}
                className={`text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                  isDark
                    ? 'border-white/15 text-brand-gray-400 hover:text-white'
                    : 'border-neutral-300 text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <Wand2 size={11} /> Regenerar todos
              </button>
            </div>
          ))}

          {/* Cards individuais por ponto */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {points.map((ponto) => (
              <ArteAICard
                key={ponto.id}
                ponto={ponto}
                contexto={contexto}
                isDark={isDark}
                arteAtualUrl={artesPorPonto[ponto.id] || ''}
                onArteEscolhida={handleArteEscolhida}
                onManualUpload={handleManualUploadByFormat}
                manualOnly={manualOnly}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
