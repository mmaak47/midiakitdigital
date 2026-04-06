import { useState, useMemo } from 'react';
import { Search, Download, RefreshCcw, AlertCircle, CheckSquare, Square, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Converte string tipo "3 min", "90s", "1:30", "2 min 30s" → segundos */
function parseDuracao(str) {
  if (!str) return 0;
  const s = String(str).trim().toLowerCase();

  // formato mm:ss
  const mmss = s.match(/^(\d+):(\d{2})$/);
  if (mmss) return parseInt(mmss[1]) * 60 + parseInt(mmss[2]);

  let total = 0;
  const min = s.match(/(\d+(?:[.,]\d+)?)\s*min/);
  const sec = s.match(/(\d+(?:[.,]\d+)?)\s*s(?:eg)?(?:\b|$)/);
  if (min) total += parseFloat(min[1].replace(',', '.')) * 60;
  if (sec) total += parseFloat(sec[1].replace(',', '.'));
  if (!min && !sec) {
    const num = parseFloat(s.replace(',', '.'));
    if (!isNaN(num)) total = num; // assume segundos se número puro
  }
  return Math.round(total);
}

/** Formata segundos em mm:ss */
function fmtSeg(seg) {
  if (!seg || isNaN(seg)) return '00:00';
  const m = Math.floor(Math.abs(seg) / 60);
  const s = Math.abs(seg) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Calcula dados de loop para um ponto com overrides */
function calcLoop(ponto, override) {
  const cicloSeg = override?.ciclo != null ? override.ciclo : parseDuracao(ponto.loop);
  const tempoSeg = override?.tempo != null ? override.tempo : parseDuracao(ponto.tempo);
  const insercoes = override?.insercoes != null ? override.insercoes : (parseInt(ponto.insercoes) || 0);

  const ocupadoSeg = tempoSeg * insercoes;
  const livreSeg = Math.max(0, cicloSeg - ocupadoSeg);
  const livreInsercoesAdicionais = tempoSeg > 0 ? Math.floor(livreSeg / tempoSeg) : 0;
  const pctLivre = cicloSeg > 0 ? Math.round((livreSeg / cicloSeg) * 100) : 0;

  return { cicloSeg, tempoSeg, insercoes, ocupadoSeg, livreSeg, livreInsercoesAdicionais, pctLivre };
}

// ─── Linha da tabela ─────────────────────────────────────────────────────────

function PontoRow({ ponto, override, onOverride, isDark }) {
  const { cicloSeg, tempoSeg, insercoes, ocupadoSeg, livreSeg, livreInsercoesAdicionais, pctLivre } = calcLoop(ponto, override);

  const livreCor =
    pctLivre >= 30 ? 'text-green-400'
    : pctLivre >= 10 ? 'text-yellow-400'
    : 'text-red-400';

  function field(key, value, suffix = '') {
    onOverride(ponto.id, key, value === '' ? null : (key === 'ciclo' || key === 'tempo' ? parseDuracao(value || '0') : parseInt(value) || 0));
  }

  return (
    <tr className="border-t border-white/10 align-middle">
      {/* Nome + dados */}
      <td className="px-3 py-3">
        <div className="font-medium text-white text-sm">{ponto.nome}</div>
        <div className="text-xs text-brand-gray-400 mt-0.5">{ponto.cidade} · {ponto.tipo}</div>
        {ponto.endereco && <div className="text-xs text-brand-gray-500 truncate max-w-xs">{ponto.endereco}</div>}
        <div className="text-[10px] text-brand-gray-600 mt-0.5">ID interno: #{ponto.id}</div>
      </td>

      {/* Player ID externo */}
      <td className="px-3 py-3">
        <input
          type="text"
          placeholder="ex: 159"
          value={override?.player_id ?? ''}
          onChange={e => onOverride(ponto.id, 'player_id', e.target.value)}
          className="w-24 px-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40"
        />
      </td>

      {/* Ciclo total */}
      <td className="px-3 py-3">
        <input
          type="text"
          placeholder={fmtSeg(parseDuracao(ponto.loop))}
          value={override?._cicloRaw ?? (ponto.loop || '')}
          onChange={e => {
            onOverride(ponto.id, '_cicloRaw', e.target.value);
            onOverride(ponto.id, 'ciclo', parseDuracao(e.target.value));
          }}
          className="w-20 px-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40"
        />
        <div className="text-[10px] text-brand-gray-500 mt-0.5">{fmtSeg(cicloSeg)}</div>
      </td>

      {/* Duração/inserção */}
      <td className="px-3 py-3">
        <input
          type="text"
          placeholder={ponto.tempo || '15s'}
          value={override?._tempoRaw ?? (ponto.tempo || '')}
          onChange={e => {
            onOverride(ponto.id, '_tempoRaw', e.target.value);
            onOverride(ponto.id, 'tempo', parseDuracao(e.target.value));
          }}
          className="w-20 px-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40"
        />
        <div className="text-[10px] text-brand-gray-500 mt-0.5">{fmtSeg(tempoSeg)}</div>
      </td>

      {/* Inserções atuais */}
      <td className="px-3 py-3">
        <input
          type="number"
          min="0"
          placeholder={ponto.insercoes || '0'}
          value={override?.insercoes ?? (ponto.insercoes || '')}
          onChange={e => onOverride(ponto.id, 'insercoes', e.target.value === '' ? null : parseInt(e.target.value) || 0)}
          className="w-16 px-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40"
        />
        <div className="text-[10px] text-brand-gray-500 mt-0.5">{fmtSeg(ocupadoSeg)} usados</div>
      </td>

      {/* Tempo livre */}
      <td className="px-3 py-3 text-center">
        <span className={`text-sm font-bold font-mono ${livreCor}`}>{fmtSeg(livreSeg)}</span>
        <div className="text-[10px] text-brand-gray-400 mt-0.5">{pctLivre}% livre</div>
        {livreInsercoesAdicionais > 0 && (
          <div className="text-[10px] text-green-400">+{livreInsercoesAdicionais} inserção{livreInsercoesAdicionais > 1 ? 'ões' : ''}</div>
        )}
      </td>

      {/* Barra visual */}
      <td className="px-3 py-3 min-w-[80px]">
        <div className="relative w-full h-3 rounded-full overflow-hidden bg-white/10">
          <div
            className="absolute left-0 top-0 h-full bg-brand-orange/70 rounded-full transition-all"
            style={{ width: `${cicloSeg > 0 ? Math.min(100, Math.round((ocupadoSeg / cicloSeg) * 100)) : 0}%` }}
          />
        </div>
        <div className="text-[10px] text-brand-gray-500 mt-1 text-right">
          {cicloSeg > 0 ? `${Math.min(100, Math.round((ocupadoSeg / cicloSeg) * 100))}% ocupado` : '—'}
        </div>
      </td>
    </tr>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AuditoriaLoopTab({ pontos = [], isDark }) {
  const [search, setSearch] = useState('');
  const [filterCidade, setFilterCidade] = useState('todas');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [overrides, setOverrides] = useState({}); // { [pontoId]: { player_id, ciclo, tempo, insercoes, ... } }
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sortKey, setSortKey] = useState('nome');
  const [sortDir, setSortDir] = useState('asc');

  const cidades = useMemo(() => {
    const s = new Set(pontos.map(p => p.cidade).filter(Boolean));
    return ['todas', ...Array.from(s).sort()];
  }, [pontos]);

  const filtered = useMemo(() => {
    let list = pontos.filter(p => Number(p.ativo) !== 0);
    if (filterCidade !== 'todas') list = list.filter(p => p.cidade === filterCidade);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(p =>
        (p.nome || '').toLowerCase().includes(q) ||
        (p.endereco || '').toLowerCase().includes(q) ||
        (p.tipo || '').toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let va = a[sortKey] ?? '';
      let vb = b[sortKey] ?? '';
      if (sortKey === 'livre') {
        va = calcLoop(a, overrides[a.id]).livreSeg;
        vb = calcLoop(b, overrides[b.id]).livreSeg;
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [pontos, search, filterCidade, sortKey, sortDir, overrides]);

  const selectedPontos = useMemo(
    () => filtered.filter(p => selectedIds.has(p.id)),
    [filtered, selectedIds]
  );

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (filtered.every(p => selectedIds.has(p.id))) {
      setSelectedIds(prev => {
        const n = new Set(prev);
        filtered.forEach(p => n.delete(p.id));
        return n;
      });
    } else {
      setSelectedIds(prev => {
        const n = new Set(prev);
        filtered.forEach(p => n.add(p.id));
        return n;
      });
    }
  }

  function setOverride(pontoId, key, value) {
    setOverrides(prev => ({
      ...prev,
      [pontoId]: { ...prev[pontoId], [key]: value }
    }));
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // ── Geração do JSON ───────────────────────────────────────────────────────

  function buildJson() {
    const items = selectedPontos.length > 0 ? selectedPontos : filtered;
    return items.map(p => {
      const ov = overrides[p.id] || {};
      const { cicloSeg, tempoSeg, insercoes, ocupadoSeg, livreSeg, livreInsercoesAdicionais, pctLivre } = calcLoop(p, ov);
      return {
        player_id: ov.player_id || null,
        ponto_id: p.id,
        nome: p.nome,
        cidade: p.cidade,
        tipo: p.tipo,
        endereco: p.endereco || null,
        coordenadas: (p.lat && p.lng) ? { lat: parseFloat(p.lat), lng: parseFloat(p.lng) } : null,
        horario_funcionamento: p.horario || null,
        fluxo_estimado_pessoas: p.fluxo ? parseInt(p.fluxo) : null,
        telas: p.telas ? parseInt(p.telas) : 1,
        publico_alvo: p.publico || null,
        veiculacao: p.veiculacao || null,
        resolucao_arte: (p.arte_largura && p.arte_altura)
          ? `${p.arte_largura}x${p.arte_altura}`
          : null,
        loop: {
          ciclo_total_seg: cicloSeg,
          ciclo_total_fmtd: fmtSeg(cicloSeg),
          tempo_insercao_seg: tempoSeg,
          insercoes_atuais: insercoes,
          tempo_ocupado_seg: ocupadoSeg,
          tempo_ocupado_fmtd: fmtSeg(ocupadoSeg),
          tempo_livre_seg: livreSeg,
          tempo_livre_fmtd: fmtSeg(livreSeg),
          pct_livre: pctLivre,
          inserções_disponiveis: livreInsercoesAdicionais,
        },
        gerado_em: new Date().toISOString(),
      };
    });
  }

  const jsonData = useMemo(() => buildJson(), [selectedPontos, filtered, overrides]);
  const jsonString = useMemo(() => JSON.stringify(jsonData, null, 2), [jsonData]);

  function downloadJson() {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-loop-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyJson() {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Estatísticas do conjunto selecionado ──────────────────────────────────
  const stats = useMemo(() => {
    const items = selectedPontos.length > 0 ? selectedPontos : filtered;
    const total = items.length;
    const semPlayerId = items.filter(p => !overrides[p.id]?.player_id).length;
    const comEspacoLivre = items.filter(p => calcLoop(p, overrides[p.id]).livreSeg > 0).length;
    const totalLivreSeg = items.reduce((acc, p) => acc + calcLoop(p, overrides[p.id]).livreSeg, 0);
    return { total, semPlayerId, comEspacoLivre, totalLivreSeg };
  }, [selectedPontos, filtered, overrides]);

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ChevronUp size={11} className="inline ml-0.5" /> : <ChevronDown size={11} className="inline ml-0.5" />;
  };

  const thClass = "px-3 py-2 text-left text-xs font-medium text-brand-gray-400 cursor-pointer hover:text-white select-none";

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Auditoria de Loop</h2>
          <p className="text-xs text-brand-gray-400 mt-1">
            Visualize o tempo livre por player e exporte o JSON para integração com o sistema de veiculação.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowJson(v => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
          >
            {showJson ? 'Ocultar JSON' : 'Ver JSON'}
          </button>
          <button
            type="button"
            onClick={downloadJson}
            className="inline-flex items-center gap-2 rounded-xl border border-brand-orange/40 bg-brand-orange/10 px-3 py-2 text-xs font-semibold text-brand-orange hover:bg-brand-orange/20"
          >
            <Download size={13} />
            Exportar JSON
            {selectedPontos.length > 0 && <span className="ml-1 rounded-full bg-brand-orange/20 px-1.5 py-0.5 text-[10px]">{selectedPontos.length}</span>}
          </button>
        </div>
      </div>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Players', value: stats.total, sub: 'selecionados' },
          { label: 'Com espaço livre', value: stats.comEspacoLivre, sub: `de ${stats.total}` },
          { label: 'Tempo total livre', value: fmtSeg(stats.totalLivreSeg), sub: 'soma de todos', mono: true },
          { label: 'Sem player ID', value: stats.semPlayerId, sub: 'precisam preencher', warn: stats.semPlayerId > 0 },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-3 ${c.warn && c.value > 0 ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/10 bg-white/[0.03]'}`}>
            <div className={`text-xl font-bold ${c.mono ? 'font-mono' : ''} ${c.warn && c.value > 0 ? 'text-yellow-400' : 'text-white'}`}>{c.value}</div>
            <div className="text-xs font-medium text-brand-gray-300 mt-0.5">{c.label}</div>
            <div className="text-[10px] text-brand-gray-500">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-500" />
          <input
            type="text"
            placeholder="Buscar nome, endereço ou tipo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40"
          />
        </div>
        <select
          value={filterCidade}
          onChange={e => setFilterCidade(e.target.value)}
          className="px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-orange/40"
        >
          {cidades.map(c => (
            <option key={c} value={c} className="bg-gray-900">{c === 'todas' ? 'Todas as cidades' : c}</option>
          ))}
        </select>
        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-white/10 rounded-xl text-brand-gray-400 hover:text-white hover:bg-white/5"
          >
            <RefreshCcw size={12} />
            Limpar seleção ({selectedIds.size})
          </button>
        )}
      </div>

      {/* ── Tabela ── */}
      <div className="rounded-2xl border border-white/10 overflow-x-auto">
        <table className="w-full text-sm min-w-[780px]">
          <thead className="bg-white/[0.04]">
            <tr>
              <th className="px-3 py-2 w-8">
                <button type="button" onClick={toggleAll} className="text-brand-gray-400 hover:text-white">
                  {filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))
                    ? <CheckSquare size={14} />
                    : <Square size={14} />}
                </button>
              </th>
              <th className={thClass} onClick={() => handleSort('nome')}>Ponto <SortIcon col="nome" /></th>
              <th className={thClass}>Player ID externo</th>
              <th className={thClass} onClick={() => handleSort('loop')}>Ciclo total <SortIcon col="loop" /></th>
              <th className={thClass} onClick={() => handleSort('tempo')}>Duração/inserção <SortIcon col="tempo" /></th>
              <th className={thClass} onClick={() => handleSort('insercoes')}>Inserções atuais <SortIcon col="insercoes" /></th>
              <th className={thClass} onClick={() => handleSort('livre')}>Tempo livre <SortIcon col="livre" /></th>
              <th className={thClass}>Ocupação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-xs text-brand-gray-500">
                  Nenhum ponto encontrado.
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr
                  key={p.id}
                  className={`group ${selectedIds.has(p.id) ? 'bg-brand-orange/5' : ''}`}
                >
                  <td className="px-3 py-3 w-8">
                    <button
                      type="button"
                      onClick={() => toggleSelect(p.id)}
                      className="text-brand-gray-500 hover:text-brand-orange"
                    >
                      {selectedIds.has(p.id) ? <CheckSquare size={14} className="text-brand-orange" /> : <Square size={14} />}
                    </button>
                  </td>
                  <PontoRow
                    key={`row-${p.id}`}
                    ponto={p}
                    override={overrides[p.id]}
                    onOverride={setOverride}
                    isDark={isDark}
                  />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Aviso sem player ID ── */}
      {stats.semPlayerId > 0 && selectedPontos.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-yellow-500/25 bg-yellow-500/5 p-3">
          <AlertCircle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-300">
            {stats.semPlayerId} player{stats.semPlayerId > 1 ? 's' : ''} selecionado{stats.semPlayerId > 1 ? 's' : ''} sem <strong>Player ID externo</strong> preenchido.
            O campo ficará <code>null</code> no JSON exportado.
          </p>
        </div>
      )}

      {/* ── Preview JSON ── */}
      {showJson && (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.04] border-b border-white/10">
            <span className="text-xs font-semibold text-white">
              Preview JSON — {jsonData.length} player{jsonData.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={copyJson}
              className="text-xs text-brand-gray-400 hover:text-white transition-colors"
            >
              {copied ? '✓ Copiado!' : 'Copiar'}
            </button>
          </div>
          <pre className="p-4 text-[11px] text-green-300 bg-black/40 overflow-auto max-h-[500px] leading-relaxed font-mono">
            {jsonString}
          </pre>
        </div>
      )}

      {/* ── Documentação do JSON ── */}
      <details className="rounded-2xl border border-white/10 overflow-hidden">
        <summary className="px-4 py-3 text-xs font-semibold text-white cursor-pointer hover:bg-white/5 bg-white/[0.02] select-none">
          📄 Dicionário de campos do JSON (para a equipe de integração)
        </summary>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs text-brand-gray-300">
          {[
            ['player_id', 'ID do player no sistema de veiculação (preenchimento manual)'],
            ['ponto_id', 'ID interno do ponto no Mídia Kit Digital'],
            ['nome', 'Nome do ponto/local'],
            ['cidade', 'Cidade'],
            ['tipo', 'Tipo de mídia (Elevador, LED, etc.)'],
            ['endereco', 'Endereço completo'],
            ['coordenadas.lat/lng', 'Coordenadas geográficas'],
            ['horario_funcionamento', 'Horário de operação'],
            ['fluxo_estimado_pessoas', 'Estimativa de pessoas/dia'],
            ['telas', 'Número de telas no ponto'],
            ['publico_alvo', 'Classificação de público (A, B, A/B)'],
            ['veiculacao', 'Formato de veiculação'],
            ['resolucao_arte', 'Resolução recomendada da arte em px'],
            ['loop.ciclo_total_seg', 'Duração total do ciclo em segundos'],
            ['loop.ciclo_total_fmtd', 'Ciclo total formatado (mm:ss)'],
            ['loop.tempo_insercao_seg', 'Duração de cada inserção em segundos'],
            ['loop.insercoes_atuais', 'Quantidade de inserções atuais no loop'],
            ['loop.tempo_ocupado_seg', 'Tempo total ocupado = inserções × duração'],
            ['loop.tempo_ocupado_fmtd', 'Tempo ocupado formatado (mm:ss)'],
            ['loop.tempo_livre_seg', 'Tempo disponível restante em segundos'],
            ['loop.tempo_livre_fmtd', 'Tempo livre formatado (mm:ss)'],
            ['loop.pct_livre', 'Percentual do loop disponível (0–100)'],
            ['loop.inserções_disponiveis', 'Quantas inserções adicionais cabem no tempo livre'],
            ['gerado_em', 'Timestamp ISO 8601 da geração'],
          ].map(([k, v]) => (
            <div key={k} className="py-1 border-b border-white/5 flex gap-2">
              <code className="text-brand-orange flex-shrink-0 min-w-[220px]">{k}</code>
              <span className="text-brand-gray-400">{v}</span>
            </div>
          ))}
        </div>
      </details>

    </div>
  );
}
