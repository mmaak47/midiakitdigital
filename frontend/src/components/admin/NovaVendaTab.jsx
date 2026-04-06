import { useState } from 'react';
import { Loader2, Upload, X, Send, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { submitNovaVenda } from '../../lib/api';

const TIPOS_NEGOCIO = ['Nova Venda', 'Renovação'];
const TIPOS_VALOR = ['Líquido', 'Bruto'];

const emptyForm = {
  tipo: 'Nova Venda',
  razao_social: '',
  cnpj: '',
  valor_mensal: '',
  tipo_valor: 'Líquido',
  via_agencia: false,
  agencia_nome: '',
  comissao_pct: '',
  troca_material: false,
  periodo_tipo: 'meses',
  periodo_meses: '',
  periodo_inicio: '',
  periodo_fim: '',
  dia_pagamento: '',
  responsavel_nome: '',
  responsavel_whatsapp: '',
};

function fmtCnpj(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function fmtPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function NovaVendaTab({ isDark = true, pontos = [], currentUser }) {
  const [form, setForm] = useState({ ...emptyForm });
  const [selectedPontos, setSelectedPontos] = useState([]);
  const [search, setSearch] = useState('');
  const [piFile, setPiFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filteredPontos = pontos.filter(p =>
    !search ||
    p.nome?.toLowerCase().includes(search.toLowerCase()) ||
    p.cidade?.toLowerCase().includes(search.toLowerCase())
  );

  const togglePonto = p => {
    setSelectedPontos(prev =>
      prev.find(x => x.id === p.id) ? prev.filter(x => x.id !== p.id) : [...prev, p]
    );
  };

  const handlePiChange = e => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') setPiFile(f);
    else if (f) setErr('Apenas arquivos PDF são aceitos para o P.I.');
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setErr('');
    setResult(null);

    if (!form.razao_social.trim()) return setErr('Preencha a Razão Social.');
    if (!form.valor_mensal) return setErr('Preencha o Valor Mensal.');
    if (selectedPontos.length === 0) return setErr('Selecione ao menos um ponto contratado.');
    if (!form.responsavel_nome.trim()) return setErr('Preencha o nome do Responsável pela compra.');
    if (!form.responsavel_whatsapp.trim()) return setErr('Preencha o WhatsApp do Responsável.');

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('tipo', form.tipo);
      fd.append('razao_social', form.razao_social.trim());
      fd.append('cnpj', form.cnpj.trim());
      fd.append('valor_mensal', form.valor_mensal.trim());
      fd.append('tipo_valor', form.tipo_valor);
      fd.append('via_agencia', form.via_agencia ? 'true' : 'false');
      if (form.via_agencia) {
        fd.append('agencia_nome', form.agencia_nome.trim());
        fd.append('comissao_pct', form.comissao_pct.trim());
      }
      fd.append('troca_material', form.troca_material ? 'true' : 'false');
      fd.append('periodo_tipo', form.periodo_tipo);
      fd.append('periodo_meses', form.periodo_meses);
      fd.append('periodo_inicio', form.periodo_inicio);
      fd.append('periodo_fim', form.periodo_fim);
      fd.append('dia_pagamento', form.dia_pagamento.trim());
      fd.append('responsavel_nome', form.responsavel_nome.trim());
      fd.append('responsavel_whatsapp', form.responsavel_whatsapp.trim());
      fd.append('pontos_nomes', JSON.stringify(selectedPontos.map(p => p.nome)));
      fd.append('vendedor_nome', currentUser
        ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.username || 'Vendedor'
        : 'Vendedor'
      );
      if (piFile) fd.append('pi', piFile);

      const res = await submitNovaVenda(fd);
      setResult({ ok: true, msg: res.message || 'Venda registrada e notificação enviada!' });
      setForm({ ...emptyForm });
      setSelectedPontos([]);
      setPiFile(null);
      setSearch('');
    } catch (e) {
      setResult({ ok: false, msg: e.message || 'Erro ao registrar venda.' });
    } finally {
      setBusy(false);
    }
  };

  /* ─── style helpers ─── */
  const card = `rounded-2xl border p-4 sm:p-5 space-y-4 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-white'}`;
  const inp = `w-full px-4 py-2.5 rounded-xl text-sm transition-colors focus:outline-none ${isDark
    ? 'bg-white/5 border border-white/10 text-white placeholder:text-brand-gray-500 focus:border-brand-orange/40'
    : 'bg-white border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/60'}`;
  const lbl = `block text-xs font-medium uppercase tracking-wide mb-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`;
  const sectionTitle = `text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`;
  const toggleBtn = (active) => `flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${active
    ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
    : isDark
      ? 'border-white/10 bg-white/[0.03] text-brand-gray-400 hover:border-white/20 hover:text-white'
      : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-300 hover:text-neutral-900'}`;

  /* ─── preview da mensagem ─── */
  const msgPreview = buildMsgPreview({ form, selectedPontos, currentUser });

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
          Registrar venda
        </h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
          Preencha os dados da venda. Ao confirmar, uma notificação será disparada automaticamente
          via WhatsApp para o grupo/contato configurado.
        </p>
      </div>

      {result && (
        <div className={`flex items-start gap-3 rounded-xl p-4 ${result.ok
          ? isDark ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'
          : isDark ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'}`}>
          {result.ok
            ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-400" />
            : <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" />}
          <p className={`text-sm ${result.ok
            ? isDark ? 'text-green-300' : 'text-green-700'
            : isDark ? 'text-red-300' : 'text-red-600'}`}>
            {result.msg}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Tipo de negócio */}
        <section className={card}>
          <h3 className={sectionTitle}>Tipo de negócio</h3>
          <div className="flex gap-3">
            {TIPOS_NEGOCIO.map(t => (
              <button key={t} type="button" onClick={() => set('tipo', t)} className={toggleBtn(form.tipo === t)}>
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* Dados do cliente */}
        <section className={card}>
          <h3 className={sectionTitle}>Dados do cliente</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Razão Social *</label>
              <input
                className={inp}
                value={form.razao_social}
                onChange={e => set('razao_social', e.target.value)}
                placeholder="Empresa LTDA"
              />
            </div>
            <div>
              <label className={lbl}>CNPJ</label>
              <input
                className={inp}
                value={form.cnpj}
                onChange={e => set('cnpj', fmtCnpj(e.target.value))}
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>
        </section>

        {/* Pontos contratados */}
        <section className={card} style={{ overflow: 'visible' }}>
          <h3 className={sectionTitle}>Pontos contratados *</h3>

          {selectedPontos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedPontos.map(p => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange/15 border border-brand-orange/30 text-brand-orange text-xs px-2.5 py-1 font-medium"
                >
                  {p.nome}
                  <button type="button" onClick={() => togglePonto(p)} className="hover:text-white transition-colors">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            className={inp}
            placeholder="Buscar ponto por nome ou cidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className={`max-h-56 overflow-y-auto rounded-xl border divide-y ${isDark ? 'border-white/10 divide-white/5' : 'border-neutral-200 divide-neutral-100'}`}>
            {filteredPontos.length === 0 ? (
              <p className={`px-3 py-4 text-sm text-center ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                Nenhum ponto encontrado.
              </p>
            ) : (
              filteredPontos.slice(0, 40).map(p => {
                const checked = !!selectedPontos.find(x => x.id === p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      checked
                        ? isDark ? 'bg-brand-orange/8' : 'bg-orange-50'
                        : isDark ? 'hover:bg-white/5' : 'hover:bg-neutral-50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePonto(p)}
                      className="accent-brand-orange shrink-0"
                    />
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                        {p.nome}
                      </div>
                      <div className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                        {p.cidade}{p.tipo ? ` · ${p.tipo}` : ''}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </section>

        {/* Dados comerciais */}
        <section className={card}>
          <h3 className={sectionTitle}>Dados comerciais</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Valor mensal *</label>
              <input
                className={inp}
                value={form.valor_mensal}
                onChange={e => set('valor_mensal', e.target.value)}
                placeholder="R$ 0.000,00"
              />
            </div>
            <div>
              <label className={lbl}>Tipo de valor</label>
              <div className="flex gap-2">
                {TIPOS_VALOR.map(t => (
                  <button key={t} type="button" onClick={() => set('tipo_valor', t)} className={toggleBtn(form.tipo_valor === t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={lbl}>Dia do pagamento</label>
            <input
              className={inp}
              value={form.dia_pagamento}
              onChange={e => set('dia_pagamento', e.target.value)}
              placeholder="Ex: Dia 10 de cada mês"
            />
          </div>

          {/* Via agência */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={() => set('via_agencia', !form.via_agencia)}
                className={`w-10 h-5 rounded-full transition-colors relative ${form.via_agencia ? 'bg-brand-orange' : isDark ? 'bg-white/20' : 'bg-neutral-300'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.via_agencia ? 'left-5' : 'left-0.5'}`} />
              </button>
              <label className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                Venda via agência
              </label>
            </div>
            {form.via_agencia && (
              <div className="grid sm:grid-cols-2 gap-4 mt-2">
                <div>
                  <label className={lbl}>Nome da agência</label>
                  <input className={inp} value={form.agencia_nome} onChange={e => set('agencia_nome', e.target.value)} placeholder="Nome da agência" />
                </div>
                <div>
                  <label className={lbl}>Comissão (%)</label>
                  <input className={inp} type="number" min="0" max="100" step="0.1" value={form.comissao_pct} onChange={e => set('comissao_pct', e.target.value)} placeholder="Ex: 15" />
                </div>
              </div>
            )}
          </div>

          {/* Troca de material — só para Renovação */}
          {form.tipo === 'Renovação' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => set('troca_material', !form.troca_material)}
                className={`w-10 h-5 rounded-full transition-colors relative ${form.troca_material ? 'bg-brand-orange' : isDark ? 'bg-white/20' : 'bg-neutral-300'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.troca_material ? 'left-5' : 'left-0.5'}`} />
              </button>
              <label className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                Haverá troca de material
              </label>
            </div>
          )}
        </section>

        {/* Período de veiculação */}
        <section className={card}>
          <h3 className={sectionTitle}>Período de veiculação</h3>
          <div className="flex gap-3">
            {[{ k: 'meses', l: 'Qtd. de meses' }, { k: 'datas', l: 'Por datas' }].map(opt => (
              <button
                key={opt.k}
                type="button"
                onClick={() => set('periodo_tipo', opt.k)}
                className={toggleBtn(form.periodo_tipo === opt.k)}
              >
                {opt.l}
              </button>
            ))}
          </div>

          {form.periodo_tipo === 'meses' ? (
            <div>
              <label className={lbl}>Número de meses</label>
              <input
                type="number"
                min="1"
                className={inp}
                value={form.periodo_meses}
                onChange={e => set('periodo_meses', e.target.value)}
                placeholder="Ex: 12"
              />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Data de início</label>
                <input
                  type="date"
                  className={inp}
                  value={form.periodo_inicio}
                  onChange={e => set('periodo_inicio', e.target.value)}
                />
              </div>
              <div>
                <label className={lbl}>Data de término</label>
                <input
                  type="date"
                  className={inp}
                  value={form.periodo_fim}
                  onChange={e => set('periodo_fim', e.target.value)}
                />
              </div>
            </div>
          )}
        </section>

        {/* Responsável pela compra */}
        <section className={card}>
          <h3 className={sectionTitle}>Responsável pela compra</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Nome *</label>
              <input
                className={inp}
                value={form.responsavel_nome}
                onChange={e => set('responsavel_nome', e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div>
              <label className={lbl}>WhatsApp *</label>
              <input
                className={inp}
                value={form.responsavel_whatsapp}
                onChange={e => set('responsavel_whatsapp', fmtPhone(e.target.value))}
                placeholder="(43) 99999-9999"
              />
            </div>
          </div>
        </section>

        {/* P.I. */}
        <section className={card}>
          <div className="flex items-center justify-between">
            <h3 className={sectionTitle}>P.I. — Pedido de Inserção</h3>
            <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Opcional</span>
          </div>

          {piFile ? (
            <div className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${isDark ? 'border-brand-orange/30 bg-brand-orange/5' : 'border-orange-200 bg-orange-50'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="shrink-0 text-brand-orange" />
                <span className={`text-sm truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{piFile.name}</span>
                <span className={`text-xs shrink-0 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                  ({(piFile.size / 1024).toFixed(0)} KB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPiFile(null)}
                className={`ml-2 shrink-0 p-1 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-orange-100'}`}
              >
                <X size={14} className={isDark ? 'text-brand-gray-400' : 'text-neutral-500'} />
              </button>
            </div>
          ) : (
            <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer py-8 transition-colors ${isDark
              ? 'border-white/10 hover:border-brand-orange/40 hover:bg-brand-orange/5'
              : 'border-neutral-200 hover:border-brand-orange/40 hover:bg-orange-50'}`}>
              <Upload size={20} className={isDark ? 'text-brand-gray-400' : 'text-neutral-400'} />
              <span className={`text-sm ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                Clique para anexar o P.I. em PDF
              </span>
              <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={handlePiChange} />
            </label>
          )}
        </section>

        {/* Preview da mensagem */}
        {msgPreview && (
          <section className={card}>
            <h3 className={sectionTitle}>Preview da mensagem WhatsApp</h3>
            <pre className={`text-xs rounded-xl p-3 whitespace-pre-wrap font-mono leading-relaxed ${isDark ? 'bg-black/30 text-brand-gray-300' : 'bg-neutral-100 text-neutral-700'}`}>
              {msgPreview}
            </pre>
          </section>
        )}

        {err && (
          <p className={`text-sm rounded-xl px-4 py-3 border ${isDark
            ? 'text-red-300 bg-red-500/10 border-red-500/20'
            : 'text-red-600 bg-red-50 border-red-200'}`}>
            {err}
          </p>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2.5 px-6 py-3 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {busy ? 'Enviando...' : 'Registrar e notificar'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── helpers ─── */
function buildMsgPreview({ form, selectedPontos, currentUser }) {
  if (!form.razao_social && selectedPontos.length === 0) return '';

  const vendedorNome = currentUser
    ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.username || 'Vendedor'
    : 'Vendedor';

  const isRenovacao = form.tipo === 'Renovação';
  const pontosList = selectedPontos.length
    ? selectedPontos.map(p => `  • ${p.nome}`).join('\n')
    : '  • (nenhum selecionado)';

  let periodo = '';
  if (form.periodo_tipo === 'meses' && form.periodo_meses) {
    periodo = `${form.periodo_meses} ${Number(form.periodo_meses) === 1 ? 'mês' : 'meses'}`;
  } else if (form.periodo_tipo === 'datas' && form.periodo_inicio && form.periodo_fim) {
    periodo = `${fmtDate(form.periodo_inicio)} à ${fmtDate(form.periodo_fim)}`;
  }

  const lines = [
    `${isRenovacao ? '🔄 *RENOVAÇÃO*' : '🟠 *NOVA VENDA*'} — ${vendedorNome}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    form.cnpj
      ? `🏢 *${form.razao_social || '—'}*\n_CNPJ: ${form.cnpj}_`
      : `🏢 *${form.razao_social || '—'}*`,
    '',
    `📍 *PONTO${selectedPontos.length !== 1 ? 'S' : ''} CONTRATADO${selectedPontos.length !== 1 ? 'S' : ''}*`,
    pontosList,
    '',
    '💼 *CONDIÇÕES COMERCIAIS*',
    form.valor_mensal ? `💰 Valor mensal: *R$ ${form.valor_mensal}* _(${form.tipo_valor})_` : null,
    periodo ? `📅 Período: *${periodo}*` : null,
    form.dia_pagamento ? `📆 Dia de pagamento: *dia ${form.dia_pagamento}*` : null,
    form.via_agencia && form.agencia_nome ? `🤝 Via agência: *${form.agencia_nome}*${form.comissao_pct ? ` · Comissão: *${form.comissao_pct}%*` : ''}` : null,
    isRenovacao ? `🔁 Troca de material: *${form.troca_material ? 'Sim' : 'Não'}*` : null,
    '',
    form.responsavel_nome || form.responsavel_whatsapp ? '👤 *RESPONSÁVEL PELO CLIENTE*' : null,
    form.responsavel_nome ? `Nome: ${form.responsavel_nome}` : null,
    form.responsavel_whatsapp ? `WhatsApp: ${form.responsavel_whatsapp}` : null,
  ].filter(l => l !== null);

  return lines.join('\n');
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
