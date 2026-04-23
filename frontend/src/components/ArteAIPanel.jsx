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

import { useState, useCallback, useRef } from 'react';
import { Wand2, Layers, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Sparkles, Upload, X } from 'lucide-react';
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

function getPointFormatSignature(point) {
  const w = Math.max(1, Math.round(Number(point?.arte_largura) || 1920));
  const h = Math.max(1, Math.round(Number(point?.arte_altura) || 1080));
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
    const chave = normalizarRes(p.arte_largura || 1920, p.arte_altura || 1080);
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(p);
  }
  return grupos;
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
}) {
  const [expandido, setExpandido] = useState(false);
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

    const uploadedUrl = await uploadProposalImage(file);
    if (!uploadedUrl) {
      throw new Error('Falha ao salvar a imagem enviada.');
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

    setArtesPorPonto((prev) => {
      const next = { ...prev };
      targetIds.forEach((id) => {
        next[id] = uploadedUrl;
      });
      return next;
    });

    let appliedCount = 0;
    let lastError = null;
    for (const point of compatiblePoints) {
      try {
        // Serializado para evitar corrida no pipeline de renderização da simulação.
        await onArteEscolhida?.(point.id, uploadedUrl, null, 'upload_manual');
        appliedCount += 1;
      } catch (err) {
        lastError = err;
      }
    }

    if (appliedCount === 0 && lastError) {
      throw lastError;
    }

    const statusMessage = `${appliedCount} ponto(s) atualizado(s) com a arte enviada (${sourceSignature.normalizedResolution} · ${sourceSignature.aspectRatio}).`;
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
          <Sparkles size={16} className="text-brand-orange" />
          <div>
            <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              Arte com IA
            </h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
              {pontosComArte > 0
                ? `${pontosComArte} de ${points.length} ponto${points.length !== 1 ? 's' : ''} com arte`
                : `${points.length} ponto${points.length !== 1 ? 's' : ''} sem arte gerada`}
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
        <div className="px-5 pb-5 space-y-4 border-t border-white/10 pt-4">
          {/* Upload de logo do cliente */}
          <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>
                  Logo do cliente
                </p>
                <p className={`text-[11px] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                  Opcional. Quando enviado, o logo será aplicado automaticamente no canto superior da arte gerada.
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

          {/* Resumo de grupos */}
          <ResumoGrupos points={points} />

          {manualApplyStatus && (
            <div className={`rounded-xl border px-3 py-2 text-xs ${isDark ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-green-300 bg-green-50 text-green-700'}`}>
              {manualApplyStatus}
            </div>
          )}

          {/* Botão gerar todos */}
          {loteEstado === 'idle' || loteEstado === 'erro' ? (
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
                Gerando…
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
                Concluído: {loteResultados.length} arte{loteResultados.length !== 1 ? 's' : ''} gerada{loteResultados.length !== 1 ? 's' : ''}
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
          )}

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
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
