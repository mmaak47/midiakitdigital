import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, CheckCircle2, XCircle, RotateCcw, Clock, ChevronDown, ChevronUp, MessageCircle, Circle, Trash2, Pencil, X, Radio } from 'lucide-react';
import { fetchVendas, updateVendaStatus, fetchVendaEtapas, deleteVenda, updateVenda, replayVendaOnTv } from '../../lib/api';

// Definição ordenada das etapas pós-venda
const ETAPAS_DEF = [
  { key: 'contrato_enviado',  label: 'Contrato Enviado',    emoji: '📤' },
  { key: 'contrato_assinado', label: 'Contrato Assinado',   emoji: '✅' },
  { key: 'cobranca_material', label: 'Cobrança de Material', emoji: '📦' },
  { key: 'material_recebido', label: 'Material Recebido',   emoji: '🎨' },
  { key: 'veiculando',        label: 'Veiculando',          emoji: '📡' },
];

const STATUS_CONFIG = {
  ativa:     { label: 'Ativa',     light: 'bg-green-50 text-green-700 border-green-200',   dark: 'bg-green-500/10 text-green-400 border-green-500/20' },
  renovada:  { label: 'Renovada',  light: 'bg-blue-50 text-blue-700 border-blue-200',     dark: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  cancelada: { label: 'Cancelada', light: 'bg-red-50 text-red-700 border-red-200',        dark: 'bg-red-500/10 text-red-400 border-red-500/20' },
  pendente:  { label: 'Pendente',  light: 'bg-yellow-50 text-yellow-700 border-yellow-200', dark: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
};

const WA_STATUS = {
  enviado:         { label: 'Enviado',        light: 'text-green-600',  dark: 'text-green-400' },
  pendente:        { label: 'Pendente',       light: 'text-yellow-600', dark: 'text-yellow-400' },
  erro:            { label: 'Erro',           light: 'text-red-500',    dark: 'text-red-400' },
  nao_configurado: { label: 'Não config.',    light: 'text-neutral-400',dark: 'text-brand-gray-500' },
};

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function parsePontos(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch { return [str]; }
}

function fmtPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function fmtCurrency(v) {
  let d = v.replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '') || '0';
  d = d.padStart(3, '0');
  const intPart = d.slice(0, -2);
  const decPart = d.slice(-2);
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted},${decPart}`;
}

function StatusBadge({ status, isDark }) {
  const cfg = STATUS_CONFIG[status] || { label: status, light: 'bg-neutral-100 text-neutral-600 border-neutral-200', dark: 'bg-white/10 text-brand-gray-400 border-white/10' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${isDark ? cfg.dark : cfg.light}`}>
      {cfg.label}
    </span>
  );
}

function EditVendaModal({ venda, isDark, onClose, onSaved, pontos = [] }) {
  const [form, setForm] = useState({
    tipo: venda.tipo || 'Nova Venda',
    venda_escritorio: venda.venda_escritorio == 1,
    razao_social: venda.razao_social || '',
    cnpj: venda.cnpj || '',
    valor_mensal: venda.valor_mensal || '',
    tipo_valor: venda.tipo_valor || '',
    periodo: venda.periodo || '',
    dia_pagamento: venda.dia_pagamento || '',
    data_primeira_parcela: venda.data_primeira_parcela || '',
    dia_pagamento_dia: venda.dia_pagamento_dia || '',
    via_agencia: venda.via_agencia == 1,
    agencia_nome: venda.agencia_nome || '',
    comissao_pct: venda.comissao_pct || '',
    troca_material: venda.troca_material == 1,
    responsavel_nome: venda.responsavel_nome || '',
    responsavel_whatsapp: venda.responsavel_whatsapp || '',
    email: venda.email || '',
    vendedor_nome: venda.vendedor_nome || '',
    obs: venda.obs || '',
    status: venda.status || 'ativa',
  });
  // selectedNomes: set of selected point names
  const [selectedNomes, setSelectedNomes] = useState(() => new Set(parsePontos(venda.pontos_nomes)));
  const [pontoSearch, setPontoSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [editErr, setEditErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filteredPontos = pontos.filter(p =>
    !pontoSearch ||
    p.nome?.toLowerCase().includes(pontoSearch.toLowerCase()) ||
    p.cidade?.toLowerCase().includes(pontoSearch.toLowerCase())
  );

  function togglePonto(nome) {
    setSelectedNomes(prev => {
      const next = new Set(prev);
      next.has(nome) ? next.delete(nome) : next.add(nome);
      return next;
    });
  }

  function removeSelected(nome) {
    setSelectedNomes(prev => { const next = new Set(prev); next.delete(nome); return next; });
  }

  const overlay = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50';
  const modal = `w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 space-y-4 border ${isDark ? 'bg-[#111] border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`;
  const lbl = `block text-xs font-medium uppercase tracking-wide mb-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`;
  const inp = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/30 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-500' : 'bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400'}`;

  async function handleSave() {
    if (!form.razao_social.trim()) { setEditErr('Razão Social é obrigatória.'); return; }
    setEditErr('');
    setSaving(true);
    try {
      await updateVenda(venda.id, { ...form, pontos_nomes: JSON.stringify(Array.from(selectedNomes)) });
      onSaved();
      onClose();
    } catch (e) {
      setEditErr('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={overlay}>
      <div className={modal}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Editar Venda</h3>
            <p className={`text-sm mt-0.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>#{venda.id} — {venda.razao_social}</p>
          </div>
        </div>

        {editErr && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-start gap-2">
            <XCircle size={15} className="mt-0.5 shrink-0" />
            <span>{editErr}</span>
          </div>
        )}

        {/* Status */}
        <div className="space-y-1.5">
          <label className={lbl}>Status</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const active = form.status === key;
              const base = isDark ? cfg.dark : cfg.light;
              return (
                <button key={key} type="button" onClick={() => set('status', key)}
                  className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all ${active ? `${base} ring-2 ring-offset-1 ${isDark ? 'ring-white/20 ring-offset-[#111]' : 'ring-neutral-300 ring-offset-white'}` : isDark ? 'border-white/10 text-brand-gray-400 hover:border-white/20' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}
                >{cfg.label}</button>
              );
            })}
          </div>
        </div>

        {/* Tipo + Razão Social */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Tipo</label>
            <select className={inp} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              <option value="Nova Venda">Nova Venda</option>
              <option value="Renovação">Renovação</option>
              <option value="Permuta">Permuta</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Razão Social</label>
            <input className={inp} value={form.razao_social} onChange={e => set('razao_social', e.target.value)} />
          </div>
        </div>

        {/* Venda do Escritório */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const next = !form.venda_escritorio;
              set('venda_escritorio', next);
              if (next) set('vendedor_nome', 'Escritório');
            }}
            className={`w-10 h-5 rounded-full transition-colors relative ${form.venda_escritorio ? 'bg-brand-orange' : isDark ? 'bg-white/20' : 'bg-neutral-300'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.venda_escritorio ? 'left-5' : 'left-0.5'}`} />
          </button>
          <label className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            Venda do Escritório
          </label>
        </div>

        {/* CNPJ + Vendedor */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={lbl}>CNPJ</label>
            <input className={inp} value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <label className={lbl}>Vendedor</label>
            <input className={inp} value={form.venda_escritorio ? 'Escritório' : form.vendedor_nome} onChange={e => set('vendedor_nome', e.target.value)} disabled={form.venda_escritorio} />
          </div>
        </div>

        {/* Valor + Tipo Valor */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Valor Mensal</label>
            <input className={inp} value={form.valor_mensal} onChange={e => set('valor_mensal', fmtCurrency(e.target.value))} placeholder="0,00" />
          </div>
          <div>
            <label className={lbl}>Tipo do Valor</label>
            <input className={inp} value={form.tipo_valor} onChange={e => set('tipo_valor', e.target.value)} placeholder="Cheio / Bonificado / etc" />
          </div>
        </div>

        {/* Período + Dia pagamento */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Período</label>
            <input className={inp} value={form.periodo} onChange={e => set('periodo', e.target.value)} placeholder="12 meses" />
          </div>
          <div>
            <label className={lbl}>Dia do Pagamento (dia)</label>
            <select className={inp} value={form.dia_pagamento_dia} onChange={e => set('dia_pagamento_dia', e.target.value)}>
              <option value="">—</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>Dia {d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Data 1ª parcela */}
        <div>
          <label className={lbl}>Data da 1ª Parcela</label>
          <input type="date" className={inp} value={form.data_primeira_parcela} onChange={e => set('data_primeira_parcela', e.target.value)} />
        </div>

        {/* Agência */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.via_agencia} onChange={e => set('via_agencia', e.target.checked)} className="accent-brand-orange" />
            <span className={`text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>Via agência</span>
          </label>
          {form.via_agencia && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Nome da Agência</label>
                <input className={inp} value={form.agencia_nome} onChange={e => set('agencia_nome', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Comissão %</label>
                <input className={inp} value={form.comissao_pct} onChange={e => set('comissao_pct', e.target.value)} placeholder="15" />
              </div>
            </div>
          )}
        </div>

        {/* Troca material */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.troca_material} onChange={e => set('troca_material', e.target.checked)} className="accent-brand-orange" />
          <span className={`text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>Troca de material</span>
        </label>

        {/* Responsável */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Responsável (nome)</label>
            <input className={inp} value={form.responsavel_nome} onChange={e => set('responsavel_nome', e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Responsável (WhatsApp)</label>
            <input className={inp} value={form.responsavel_whatsapp} onChange={e => set('responsavel_whatsapp', fmtPhone(e.target.value))} />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className={lbl}>Email</label>
          <input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@empresa.com.br" />
        </div>

        {/* Pontos vendidos */}
        <div>
          <label className={lbl}>Pontos Vendidos</label>
          {selectedNomes.size > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {Array.from(selectedNomes).map((nome) => (
                <span key={nome} className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium border ${isDark ? 'bg-brand-orange/15 border-brand-orange/30 text-brand-orange' : 'bg-orange-100 border-orange-300 text-orange-700'}`}>
                  {nome}
                  <button type="button" onClick={() => removeSelected(nome)}
                    className={`rounded-full p-0.5 transition-colors ${isDark ? 'hover:bg-white/10 text-brand-orange/70 hover:text-brand-orange' : 'hover:bg-orange-200 text-orange-500 hover:text-orange-800'}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            className={inp}
            placeholder="Buscar ponto por nome ou cidade..."
            value={pontoSearch}
            onChange={e => setPontoSearch(e.target.value)}
          />
          <div className={`mt-1.5 max-h-48 overflow-y-auto rounded-xl border divide-y ${isDark ? 'border-white/10 divide-white/5' : 'border-neutral-200 divide-neutral-100'}`}>
            {filteredPontos.length === 0 ? (
              <p className={`px-3 py-4 text-sm text-center ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                {pontos.length === 0 ? 'Nenhum ponto disponível.' : 'Nenhum ponto encontrado.'}
              </p>
            ) : (
              filteredPontos.slice(0, 60).map(p => {
                const checked = selectedNomes.has(p.nome);
                return (
                  <label key={p.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${checked ? isDark ? 'bg-brand-orange/8' : 'bg-orange-50' : isDark ? 'hover:bg-white/5' : 'hover:bg-neutral-50'}`}>
                    <input type="checkbox" checked={checked} onChange={() => togglePonto(p.nome)} className="accent-brand-orange shrink-0" />
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{p.nome}</div>
                      <div className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{p.cidade}{p.tipo ? ` · ${p.tipo}` : ''}</div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Obs */}
        <div>
          <label className={lbl}>Observação</label>
          <textarea className={`${inp} resize-none`} rows={3} value={form.obs} onChange={e => set('obs', e.target.value)} />
        </div>

        {/* Botões */}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className={`flex-1 py-2 rounded-xl border text-sm transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
          >Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-xl bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange/90 disabled:opacity-50 transition-colors"
          >{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

function VendaRow({ venda, isDark, onEdit, onDelete, onReplayTv, replaying }) {
  const [expanded, setExpanded] = useState(false);
  const [etapas, setEtapas] = useState([]);
  const pontos = parsePontos(venda.pontos_nomes);

  useEffect(() => {
    if (!expanded) return;
    fetchVendaEtapas(venda.id).then(setEtapas).catch(() => {});
  }, [expanded, venda.id]);
  const waCfg = WA_STATUS[venda.whatsapp_status] || { label: venda.whatsapp_status, light: 'text-neutral-400', dark: 'text-brand-gray-500' };
  const waColor = isDark ? waCfg.dark : waCfg.light;

  const rowBase = `transition-colors ${isDark ? 'border-white/5 hover:bg-white/[0.03]' : 'border-neutral-100 hover:bg-neutral-50'}`;
  const td = `px-4 py-3`;
  const textSm = isDark ? 'text-white' : 'text-neutral-800';
  const textXs = isDark ? 'text-brand-gray-400' : 'text-neutral-500';
  const expandBg = isDark ? 'bg-white/[0.02]' : 'bg-neutral-50';
  const expandBorder = isDark ? 'border-white/5' : 'border-neutral-100';

  return (
    <>
      <tr className={rowBase}>
        <td className={`${td} text-xs ${textXs} whitespace-nowrap`}>{fmtDate(venda.created_at)}</td>
        <td className={td}>
          <div className={`font-medium text-sm ${textSm}`}>{venda.razao_social}</div>
          {venda.cnpj && <div className={`text-xs ${textXs}`}>{venda.cnpj}</div>}
        </td>
        <td className={`${td} text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'} whitespace-nowrap`}>
          {venda.valor_mensal ? `R$ ${venda.valor_mensal}` : '—'}
        </td>
        <td className={`${td} text-xs ${textXs} whitespace-nowrap`}>
          {venda.vendedor_nome || '—'}
          {!!venda.venda_escritorio && (
            <span className={`ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${isDark ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
              Escritório
            </span>
          )}
        </td>
        <td className={td}><StatusBadge status={venda.status || 'ativa'} isDark={isDark} /></td>
        <td className={td}>
          <span className={`text-xs flex items-center gap-1 ${waColor}`}>
            <MessageCircle size={12} />
            {waCfg.label}
          </span>
        </td>
        <td className={td}>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(venda)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${isDark ? 'border-white/10 text-brand-gray-300 hover:bg-white/5 hover:border-white/20' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'}`}
            >
              <Pencil size={12} /> Editar
            </button>
            <button
              onClick={() => onReplayTv(venda)}
              disabled={replaying}
              title="Disparar popup de nova venda no Painel TV"
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${isDark ? 'border-white/10 text-brand-gray-300 hover:bg-white/5 hover:border-white/20 disabled:opacity-60' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100 disabled:opacity-60'}`}
            >
              <Radio size={12} /> {replaying ? 'Disparando...' : 'Painel TV'}
            </button>
            <button
              onClick={() => onDelete(venda)}
              title="Deletar venda"
              className={`p-1 rounded-lg transition-colors ${isDark ? 'text-red-500/60 hover:bg-red-500/10 hover:text-red-400' : 'text-red-400 hover:bg-red-50 hover:text-red-600'}`}
            >
              <Trash2 size={13} />
            </button>
            <button
              onClick={() => setExpanded(v => !v)}
              className={`p-1 rounded-lg transition-colors ${isDark ? 'text-brand-gray-500 hover:bg-white/5' : 'text-neutral-400 hover:bg-neutral-100'}`}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className={expandBg}>
          <td colSpan={7} className={`px-4 pb-3 pt-0`}>
            <div className={`grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs pt-2.5 border-t mt-1 ${expandBorder}`}>
              {[
                ['Tipo', venda.tipo],
                ['Período', venda.periodo || '—'],
                ['Data 1ª parcela', venda.data_primeira_parcela || '—'],
                ['Dia de pagamento', venda.dia_pagamento_dia ? `Dia ${venda.dia_pagamento_dia} de cada mês` : (venda.dia_pagamento || '—')],
                ['Forma de pagamento', venda.forma_pagamento || '—'],
                ['Responsável', [venda.responsavel_nome, venda.responsavel_whatsapp].filter(Boolean).join(' · ')],
                ['Email', venda.email || '—'],
              ].map(([label, val]) => (
                <div key={label}>
                  <span className={`font-medium ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{label}: </span>
                  <span className={textXs}>{val || '—'}</span>
                </div>
              ))}
              {pontos.length > 0 && (
                <div className="col-span-2">
                  <span className={`font-medium ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>Pontos: </span>
                  <span className={textXs}>{pontos.join(', ')}</span>
                </div>
              )}
              {venda.obs && (
                <div className="col-span-2">
                  <span className={`font-medium ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>Obs: </span>
                  <span className={textXs}>{venda.obs}</span>
                </div>
              )}
              {venda.whatsapp_error && (
                <div className={`col-span-2 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                  <span className="font-medium">Erro WhatsApp: </span>{venda.whatsapp_error}
                </div>
              )}
            </div>
            {/* Checklist de etapas pós-venda */}
            <div className={`pt-2.5 mt-2 border-t ${expandBorder}`}>
              <p className={`text-xs font-medium mb-1.5 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>Etapas pós-venda</p>
              <div className="flex flex-wrap gap-1.5">
                {ETAPAS_DEF
                .filter(etapa => !(venda.via_agencia && (etapa.key === 'contrato_enviado' || etapa.key === 'contrato_assinado')))
                .map(etapa => {
                  const done = etapas.find(e => e.etapa_key === etapa.key);
                  return (
                    <span
                      key={etapa.key}
                      title={done ? `Confirmado em ${fmtDate(done.confirmado_at)}` : 'Pendente'}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border select-none ${
                        done
                          ? isDark
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : 'bg-green-50 text-green-700 border-green-200'
                          : isDark
                            ? 'bg-white/5 text-brand-gray-500 border-white/10'
                            : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                      }`}
                    >
                      <span>{etapa.emoji}</span>
                      {etapa.label}
                      {done ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                    </span>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const STATUS_FILTERS = [
  { key: 'todas',    label: 'Todas' },
  { key: 'ativa',    label: 'Ativas' },
  { key: 'renovada', label: 'Renovadas' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'cancelada',label: 'Canceladas' },
];

const SUMMARY_ITEMS = [
  { key: 'ativa',    label: 'Ativas',    Icon: CheckCircle2, light: 'text-green-600', dark: 'text-green-400' },
  { key: 'renovada', label: 'Renovadas', Icon: RotateCcw,    light: 'text-blue-600',  dark: 'text-blue-400'  },
  { key: 'pendente', label: 'Pendentes', Icon: Clock,        light: 'text-yellow-600',dark: 'text-yellow-400'},
  { key: 'cancelada',label: 'Canceladas',Icon: XCircle,      light: 'text-red-500',   dark: 'text-red-400'   },
];

export default function VendasListTab({ isDark = true, pontos = [], currentUser = null }) {
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('todas');
  const [search, setSearch] = useState('');
  const [editVenda, setEditVenda] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [replayingId, setReplayingId] = useState(null);
  const [notice, setNotice] = useState(null); // { msg, type: 'ok'|'err' }

  // Superior roles (admin, diretor, gerente) always see ALL sales, even with is_vendedor tag
  const isSuperiorRole = currentUser && ['admin', 'diretor', 'gerente_comercial'].includes(currentUser.role);
  const isAdminVendedor = currentUser && !isSuperiorRole && currentUser.is_vendedor;
  const myVendorName = isAdminVendedor ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchVendas({ status: statusFilter, q: search.trim() });
      let list = Array.isArray(data) ? data : [];
      if (isAdminVendedor && myVendorName) {
        list = list.filter(v => (v.vendedor_nome || '').toLowerCase() === myVendorName.toLowerCase());
      }
      setVendas(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, isAdminVendedor, myVendorName]);

  useEffect(() => { load(); }, [load]);

  const totais = vendas.reduce((acc, v) => {
    const s = v.status || 'ativa';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  // Estilos derivados do isDark
  const card = `rounded-2xl border p-4 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`;
  const tableWrap = `overflow-x-auto rounded-2xl border ${isDark ? 'border-white/10' : 'border-neutral-200 shadow-sm'}`;
  const thead = isDark ? 'bg-white/[0.04] border-b border-white/10' : 'bg-neutral-50 border-b border-neutral-200';
  const thText = `text-xs font-medium px-4 py-2.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`;
  const inp = `w-full pl-8 pr-3 py-2 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-orange/30 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-500' : 'bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400'}`;
  const titleText = isDark ? 'text-white' : 'text-neutral-900';
  const subText = isDark ? 'text-brand-gray-500' : 'text-neutral-400';
  const refreshBtn = `p-2 rounded-xl border transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-400 hover:bg-neutral-50'}`;
  const emptyText = isDark ? 'text-brand-gray-500' : 'text-neutral-400';

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteVenda(deleteTarget.id);
      setDeleteTarget(null);
      load();
      setNotice({ msg: 'Venda excluída com sucesso.', type: 'ok' });
    } catch (e) {
      setNotice({ msg: 'Erro ao deletar: ' + e.message, type: 'err' });
    } finally {
      setDeleting(false);
    }
  }

  async function handleReplayTv(venda) {
    if (!venda?.id) return;
    setReplayingId(venda.id);
    try {
      await replayVendaOnTv(venda.id);
      setNotice({ msg: 'Popup enviado para o Painel TV.', type: 'ok' });
    } catch (e) {
      setNotice({ msg: 'Erro ao disparar popup no Painel TV: ' + e.message, type: 'err' });
    } finally {
      setReplayingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {editVenda && (
        <EditVendaModal venda={editVenda} isDark={isDark} onClose={() => setEditVenda(null)} onSaved={load} pontos={pontos} />
      )}

      {/* Notice (success / error) */}
      {notice && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-3 ${notice.type === 'ok' ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Modal de confirmação de delete */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4 border ${isDark ? 'bg-[#111] border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`}>
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Trash2 size={16} className="text-red-500" />
                Deletar venda
              </h3>
              <p className={`text-sm mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                Tem certeza que deseja deletar a venda de <strong>{deleteTarget.razao_social}</strong>? Essa ação não pode ser desfeita.
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
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deletando...' : 'Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-base font-semibold ${titleText}`}>Histórico de Vendas</h2>
          <p className={`text-xs mt-0.5 ${subText}`}>
            {vendas.length} registro{vendas.length !== 1 ? 's' : ''} encontrado{vendas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={load} className={refreshBtn}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SUMMARY_ITEMS.map(({ key, label, Icon, light, dark }) => (
          <div key={key} className={card}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${isDark ? dark : light}`}>
              <Icon size={13} />
              {label}
            </div>
            <div className={`text-2xl font-bold mt-1 ${titleText}`}>{totais[key] || 0}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} />
          <input
            type="text"
            placeholder="Buscar por cliente, CNPJ ou vendedor..."
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
                  ? 'bg-brand-orange text-white'
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

      {/* Tabela */}
      <div className={tableWrap}>
        <table className="w-full text-left">
          <thead className={thead}>
            <tr>
              {['Data', 'Cliente', 'Valor/mês', 'Vendedor', 'Status', 'WhatsApp', ''].map(h => (
                <th key={h} className={thText}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-neutral-100'}`}>
            {loading ? (
              <tr>
                <td colSpan={7} className={`px-4 py-10 text-center text-sm ${emptyText}`}>
                  <RefreshCw size={16} className="animate-spin inline mr-2" />
                  Carregando...
                </td>
              </tr>
            ) : vendas.length === 0 ? (
              <tr>
                <td colSpan={7} className={`px-4 py-10 text-center text-sm ${emptyText}`}>
                  Nenhuma venda encontrada.
                </td>
              </tr>
            ) : (
              vendas.map(v => (
                <VendaRow
                  key={v.id}
                  venda={v}
                  isDark={isDark}
                  onEdit={setEditVenda}
                  onDelete={setDeleteTarget}
                  onReplayTv={handleReplayTv}
                  replaying={replayingId === v.id}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
