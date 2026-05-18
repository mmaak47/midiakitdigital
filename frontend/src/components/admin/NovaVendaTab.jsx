import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Upload, X, Send, CheckCircle2, AlertCircle, FileText, MessageCircle, WifiOff, AlertTriangle, Calendar, RefreshCw } from 'lucide-react';
import { clearNovaVendaDraft, fetchNovaVendaDraft, fetchPlanoFidelidadePontosBravi, fetchVendas, saveNovaVendaDraft, submitNovaVenda } from '../../lib/api';
import CustomSelect from '../CustomSelect';

const TIPOS_NEGOCIO = ['Nova Venda', 'Renovação', 'Permuta'];
const TIPOS_VALOR = ['Líquido', 'Bruto'];
const COTAS_CONTRATADAS = ['10 Segundos', '15 Segundos'];
const PLANO_FIDELIDADE_CLIENTE = 'Bravi Comercio de Bebidas e Alimentos LTDA';
const PLANO_FIDELIDADE_AUTO_OBS = 'Cota de 10 Segundos com Loop de 6 Minutos. (Adicionar a mídia em um grupo com outro cliente do Plano Fidelidade. Caso não haja dupla para ele, fazer um grupo com mídias institucionais da Intermidia.)';

const emptyForm = {
  tipo: 'Nova Venda',
  venda_escritorio: false,
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  is_cpf: false,
  endereco_cep: '',
  valor_mensal: '',
  cota_contratada: '',
  plano_fidelidade: false,
  tipo_valor: 'Líquido',
  via_agencia: false,
  agencia_nome: '',
  pi_numero: '',
  comissao_pct: '',
  troca_material: undefined,
  permuta_valor_servico: '',
  permuta_valor_receber: '',
  periodo_tipo: 'meses',
  periodo_meses: '',
  periodo_inicio: '',
  periodo_fim: '',
  data_primeira_parcela: '',
  data_inicio_veiculacao: '',
  dia_pagamento_dia: '',
  responsavel_nome: '',
  responsavel_whatsapp: '',
  responsavel_fixo: '',
  email: '',
  criativo_nome: '',
  criativo_whatsapp: '',
  criativo_email: '',
  obs: '',
};

function fmtCnpj(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function fmtCpf(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function fmtPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function fmtFixoPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

function validateFixoPhone(v) {
  const d = v.replace(/\D/g, '');
  if (d.length !== 10) return 'Telefone fixo deve ter 10 dígitos (DDD + 8 dígitos).';
  return null;
}

function validatePhone(v) {
  const d = v.replace(/\D/g, '');
  if (d.length !== 11) return 'Telefone deve ter 11 dígitos (DDD + 9 dígitos).';
  if (d[2] !== '9') return 'Celular deve iniciar com 9 após o DDD. Formato: (DDD) 9XXXX-XXXX';
  return null;
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

function parseCurrencyToNumber(v) {
  const raw = String(v || '').trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrencyFromNumber(value) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const cents = Math.round(safe * 100);
  const digits = String(cents).padStart(3, '0');
  const intPart = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decPart = digits.slice(-2);
  return `${intPart},${decPart}`;
}

function resolvePermutaSplit(totalText, servicoText, receberText) {
  const total = parseCurrencyToNumber(totalText);
  const servico = parseCurrencyToNumber(servicoText);
  const receber = parseCurrencyToNumber(receberText);
  const hasServico = servico > 0;
  const hasReceber = receber > 0;

  let resolvedServico = hasServico ? servico : 0;
  let resolvedReceber = hasReceber ? receber : 0;

  if (total > 0) {
    if (hasServico && !hasReceber) {
      resolvedReceber = Math.max(0, total - servico);
    } else if (!hasServico && hasReceber) {
      resolvedServico = Math.max(0, total - receber);
    } else if (hasServico && hasReceber) {
      const sum = servico + receber;
      if (sum > total) {
        const ratio = total / sum;
        resolvedServico = Number((servico * ratio).toFixed(2));
        resolvedReceber = Number((receber * ratio).toFixed(2));
      }
    }
  }

  return {
    total,
    servico: resolvedServico,
    receber: resolvedReceber,
    servicoFormatted: resolvedServico > 0 ? formatCurrencyFromNumber(resolvedServico) : '',
    receberFormatted: resolvedReceber > 0 ? formatCurrencyFromNumber(resolvedReceber) : '',
  };
}

function normalizeTextForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function NovaVendaTab({ isDark = true, pontos = [], currentUser }) {
  const [form, setForm] = useState({ ...emptyForm });
  const [selectedPontos, setSelectedPontos] = useState([]);
  const [pontoPrecos, setPontoPrecos] = useState({});
  const [search, setSearch] = useState('');
  const [pontoFilterCidade, setPontoFilterCidade] = useState('todas');
  const [pontoFilterTipo, setPontoFilterTipo] = useState('todos');
  const [piFiles, setPiFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [planoFidelidadeBusy, setPlanoFidelidadeBusy] = useState(false);
  const [planoFidelidadePayload, setPlanoFidelidadePayload] = useState(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftPayload, setDraftPayload] = useState(null);
  const [draftInfo, setDraftInfo] = useState(null);
  const [draftNotice, setDraftNotice] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [validationErrors, setValidationErrors] = useState(null); // { items: string[] }

  // ===== Renovação: lista de vendas anteriores feitas pelo sistema =====
  const [vendasAnteriores, setVendasAnteriores] = useState([]);
  const [loadingVendasAnt, setLoadingVendasAnt] = useState(false);
  const [vendasAntLoaded, setVendasAntLoaded] = useState(false);
  const [vendasAntError, setVendasAntError] = useState('');
  const [vendaOrigemId, setVendaOrigemId] = useState('');
  const isRenovacao = form.tipo === 'Renovação';
  const isPermuta = form.tipo === 'Permuta';

  useEffect(() => {
    if (!isRenovacao) return;
    if (vendasAntLoaded) return;
    let cancelled = false;
    setLoadingVendasAnt(true);
    setVendasAntError('');
    (async () => {
      try {
        const data = await fetchVendas({ native_only: true });
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        // Só vendas nativas do sistema (criadas pelo formulário Nova Venda, não da planilha).
        const filtered = list.filter((v) => v && v.id && (v.razao_social || v.nome_fantasia));
        setVendasAnteriores(filtered);
      } catch (e) {
        if (!cancelled) {
          setVendasAnteriores([]);
          setVendasAntError(e?.message || 'Não foi possível carregar as vendas anteriores.');
        }
      } finally {
        if (!cancelled) {
          setLoadingVendasAnt(false);
          setVendasAntLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isRenovacao, vendasAntLoaded]);

  const vendasAnterioresOptions = useMemo(() => {
    return vendasAnteriores.map((v) => {
      const cliente = v.razao_social || v.nome_fantasia || `Venda #${v.id}`;
      const valor = v.valor_mensal ? ` · R$ ${v.valor_mensal}` : '';
      const periodo = v.periodo ? ` · ${v.periodo}` : '';
      return { value: String(v.id), label: `${cliente}${valor}${periodo}` };
    });
  }, [vendasAnteriores]);

  const aplicarVendaOrigem = (vendaId) => {
    setVendaOrigemId(vendaId);
    if (!vendaId) return;
    const venda = vendasAnteriores.find((v) => String(v.id) === String(vendaId));
    if (!venda) return;
    // Auto-preenche os campos a partir da venda anterior. Mantém tipo='Renovação'.
    setForm((f) => ({
      ...f,
      razao_social: venda.razao_social || f.razao_social,
      nome_fantasia: venda.nome_fantasia || f.nome_fantasia,
      cnpj: venda.cnpj || f.cnpj,
      valor_mensal: venda.valor_mensal || f.valor_mensal,
      tipo_valor: venda.tipo_valor || f.tipo_valor,
      cota_contratada: venda.cota_contratada || f.cota_contratada,
      plano_fidelidade: !!venda.plano_fidelidade,
      via_agencia: !!venda.via_agencia,
      agencia_nome: venda.agencia_nome || f.agencia_nome,
      comissao_pct: venda.comissao_pct || f.comissao_pct,
      dia_pagamento_dia: venda.dia_pagamento_dia ? String(venda.dia_pagamento_dia) : f.dia_pagamento_dia,
      responsavel_nome: venda.responsavel_nome || f.responsavel_nome,
      responsavel_whatsapp: venda.responsavel_whatsapp || f.responsavel_whatsapp,
      email: venda.email || f.email,
      // troca_material precisa ser escolhido explicitamente em renovação
      troca_material: undefined,
    }));
    // Tenta repopular pontos_nomes → selectedPontos quando os IDs casam com o inventário carregado
    try {
      const nomes = typeof venda.pontos_nomes === 'string' ? JSON.parse(venda.pontos_nomes) : (Array.isArray(venda.pontos_nomes) ? venda.pontos_nomes : []);
      if (Array.isArray(nomes) && nomes.length && pontos.length) {
        const matched = pontos.filter((p) => nomes.includes(p.nome));
        if (matched.length) setSelectedPontos(matched);
      }
    } catch { /* ignore */ }
  };

  const limparVendaOrigem = () => {
    setVendaOrigemId('');
    setForm((f) => ({ ...f, troca_material: undefined }));
  };

  const retryLoadVendasAnteriores = () => {
    setVendasAntLoaded(false);
    setVendasAntError('');
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setTipoNegocio = (tipo) => {
    if (tipo !== 'Renovação' && vendaOrigemId) {
      setVendaOrigemId('');
    }
    setForm((prev) => {
      const next = { ...prev, tipo };

      if (tipo === 'Renovação') {
        if (prev.tipo !== 'Renovação') {
          next.troca_material = undefined;
        } else if (next.troca_material !== true && next.troca_material !== false) {
          next.troca_material = undefined;
        }
      } else {
        next.troca_material = false;
      }

      if (tipo !== 'Permuta') {
        next.permuta_valor_servico = '';
        next.permuta_valor_receber = '';
      }

      return next;
    });
  };

  const permutaSplit = useMemo(
    () => resolvePermutaSplit(form.valor_mensal, form.permuta_valor_servico, form.permuta_valor_receber),
    [form.valor_mensal, form.permuta_valor_servico, form.permuta_valor_receber]
  );

  const filteredPontos = pontos.filter(p => {
    const matchSearch = !search
      || p.nome?.toLowerCase().includes(search.toLowerCase())
      || p.cidade?.toLowerCase().includes(search.toLowerCase());
    const matchCidade = pontoFilterCidade === 'todas' || p.cidade === pontoFilterCidade;
    const matchTipo = pontoFilterTipo === 'todos' || p.tipo === pontoFilterTipo;
    const isAtivo = p.ativo === undefined ? true : !!p.ativo;
    return matchSearch && matchCidade && matchTipo && isAtivo;
  });
  const pontoCidades = Array.from(new Set(pontos.map(p => p.cidade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const pontoTipos = Array.from(new Set(pontos.map(p => p.tipo).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const togglePonto = p => {
    setSelectedPontos(prev => {
      const removing = prev.find(x => x.id === p.id);
      if (removing) {
        setPontoPrecos(pp => { const cp = { ...pp }; delete cp[p.id]; return cp; });
        return prev.filter(x => x.id !== p.id);
      }
      return [...prev, p];
    });
  };

  const handlePiChange = e => {
    const files = Array.from(e.target.files || []);
    const pdfs = files.filter(f => f.type === 'application/pdf');
    if (pdfs.length !== files.length) setErr('Apenas arquivos PDF são aceitos para o P.I.');
    if (pdfs.length) setPiFiles(prev => [...prev, ...pdfs].slice(0, 10));
    e.target.value = '';
  };

  const buildDraftPayload = () => ({
    form,
    selectedPontos: selectedPontos.map(p => ({
      id: p.id,
      nome: p.nome,
      cidade: p.cidade,
      tipo: p.tipo,
    })),
    pontoPrecos,
    search,
  });

  const applyDraftPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return;
    const draftForm = payload.form && typeof payload.form === 'object' ? payload.form : {};
    const draftPoints = Array.isArray(payload.selectedPontos) ? payload.selectedPontos : [];
    const draftPrecos = payload.pontoPrecos && typeof payload.pontoPrecos === 'object' ? payload.pontoPrecos : {};
    const mergedForm = { ...emptyForm, ...draftForm };
    if (mergedForm.tipo === 'Renovação' && mergedForm.troca_material !== true && mergedForm.troca_material !== false) {
      mergedForm.troca_material = undefined;
    }
    if (mergedForm.tipo !== 'Permuta') {
      mergedForm.permuta_valor_servico = '';
      mergedForm.permuta_valor_receber = '';
    }
    setForm(mergedForm);
    setSelectedPontos(draftPoints);
    setPontoPrecos(draftPrecos);
    setSearch(typeof payload.search === 'string' ? payload.search : '');
    setPiFiles([]);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchNovaVendaDraft();
        if (cancelled) return;
        if (data?.draft) {
          setDraftPayload(data.draft);
          setDraftInfo({
            updated_at: data.updated_at || data.draft?.saved_at || null,
            created_at: data.created_at || null,
          });
        } else {
          setDraftPayload(null);
          setDraftInfo(null);
        }
      } catch {
        if (!cancelled) {
          setDraftPayload(null);
          setDraftInfo(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLoadDraft = () => {
    if (!draftPayload) return;
    setErr('');
    setResult(null);
    applyDraftPayload(draftPayload);
    setDraftNotice('Rascunho carregado.');
  };

  const handleSaveDraft = async () => {
    setDraftBusy(true);
    setErr('');
    setResult(null);
    try {
      const payload = buildDraftPayload();
      const saved = await saveNovaVendaDraft(payload);
      setDraftPayload(payload);
      setDraftInfo({ updated_at: saved?.updated_at || new Date().toISOString(), created_at: draftInfo?.created_at || null });
      setDraftNotice('Rascunho salvo com sucesso.');
    } catch (e) {
      setErr(e.message || 'Erro ao salvar rascunho.');
    } finally {
      setDraftBusy(false);
    }
  };

  const handleDiscardDraft = async () => {
    setDraftBusy(true);
    setErr('');
    try {
      await clearNovaVendaDraft();
      setDraftPayload(null);
      setDraftInfo(null);
      setDraftNotice('Rascunho removido.');
    } catch (e) {
      setErr(e.message || 'Erro ao remover rascunho.');
    } finally {
      setDraftBusy(false);
    }
  };

  const addPlanoFidelidadeObs = (obs) => {
    const trimmedObs = String(obs || '').trim();
    if (!trimmedObs) return PLANO_FIDELIDADE_AUTO_OBS;
    if (trimmedObs.includes(PLANO_FIDELIDADE_AUTO_OBS)) return trimmedObs;
    return `${trimmedObs}\n${PLANO_FIDELIDADE_AUTO_OBS}`;
  };

  const resolvePlanoFidelidadePayload = async () => {
    if (planoFidelidadePayload) return planoFidelidadePayload;
    const payload = await fetchPlanoFidelidadePontosBravi();
    setPlanoFidelidadePayload(payload || null);
    return payload;
  };

  const handleTogglePlanoFidelidade = async () => {
    if (planoFidelidadeBusy) return;

    const enabling = !form.plano_fidelidade;
    if (!enabling) {
      set('plano_fidelidade', false);
      return;
    }

    setErr('');
    setForm((prev) => ({
      ...prev,
      plano_fidelidade: true,
      cota_contratada: prev.cota_contratada || '10 Segundos',
      obs: addPlanoFidelidadeObs(prev.obs),
    }));

    setPlanoFidelidadeBusy(true);
    try {
      const payload = await resolvePlanoFidelidadePayload();
      const rawNames = Array.isArray(payload?.pontos_nomes) ? payload.pontos_nomes : [];
      const uniqueNames = Array.from(new Set(rawNames.map((name) => String(name || '').trim()).filter(Boolean)));

      if (uniqueNames.length === 0) {
        setDraftNotice(`Plano Fidelidade ativado. Nenhum ponto base foi encontrado para ${PLANO_FIDELIDADE_CLIENTE}.`);
        return;
      }

      const pontosByName = new Map();
      for (const ponto of pontos) {
        const normalizedName = normalizeTextForMatch(ponto?.nome);
        if (!normalizedName || pontosByName.has(normalizedName)) continue;
        pontosByName.set(normalizedName, ponto);
      }

      const matched = [];
      const missing = [];
      for (const name of uniqueNames) {
        const ponto = pontosByName.get(normalizeTextForMatch(name));
        if (ponto) matched.push(ponto);
        else missing.push(name);
      }

      if (matched.length > 0) {
        setSelectedPontos((prev) => {
          const merged = new Map(prev.map((item) => [item.id, item]));
          matched.forEach((item) => merged.set(item.id, item));
          return Array.from(merged.values());
        });
      }

      if (matched.length === 0) {
        setDraftNotice('Plano Fidelidade ativado, mas os pontos de referência da Bravi não estão disponíveis na lista de pontos ativos.');
      } else if (missing.length > 0) {
        setDraftNotice(`Plano Fidelidade ativado: ${matched.length} ponto(s) adicionados automaticamente. ${missing.length} ponto(s) da referência da Bravi não foram encontrados entre os ativos.`);
      } else {
        setDraftNotice(`Plano Fidelidade ativado: ${matched.length} ponto(s) da referência da Bravi foram adicionados automaticamente.`);
      }
    } catch (e) {
      setErr(e.message || 'Erro ao aplicar pontos automáticos do Plano Fidelidade.');
    } finally {
      setPlanoFidelidadeBusy(false);
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setErr('');
    setResult(null);
    setValidationErrors(null);

    // Validação completa: TODOS os campos obrigatórios exceto email.
    // Valor por ponto é obrigatório exceto quando Plano Fidelidade está ativo.
    const missing = [];
    if (!form.tipo) missing.push('Tipo de negócio');
    if (!form.razao_social.trim()) missing.push('Razão Social');
    if (!form.via_agencia && !form.nome_fantasia.trim()) missing.push('Nome Fantasia');
    if (!form.via_agencia && !form.cnpj.trim()) missing.push(form.is_cpf ? 'CPF' : 'CNPJ');
    if (form.via_agencia && !form.pi_numero.trim()) missing.push('Número da PI');
    if (form.is_cpf && !form.endereco_cep.trim()) missing.push('Endereço ou CEP');
    if (selectedPontos.length === 0) missing.push('Pontos contratados (selecionar ao menos um)');
    if (!form.plano_fidelidade) {
      const pontosSemPreco = selectedPontos.filter(p => !pontoPrecos[p.id] || !String(pontoPrecos[p.id]).replace(/\D/g, '').replace(/^0+/, ''));
      if (pontosSemPreco.length) {
        missing.push(`Valor por ponto: ${pontosSemPreco.map(p => p.nome).join(', ')}`);
      }
    }
    if (!form.valor_mensal) missing.push('Valor mensal');
    if (!form.tipo_valor) missing.push('Tipo de valor (Líquido/Bruto)');
    if (!form.plano_fidelidade && !form.cota_contratada) missing.push('Cota contratada');
    if (!form.data_primeira_parcela && !form.via_agencia) missing.push('Data da primeira parcela');
    if (!form.data_inicio_veiculacao) missing.push('Data de início de veiculação');
    if (form.tipo !== 'Permuta' && !form.via_agencia && !form.dia_pagamento_dia) missing.push('Dia do pagamento');
    if (form.periodo_tipo === 'meses' && !form.periodo_meses) missing.push('Número de meses');
    if (form.periodo_tipo === 'datas' && !form.periodo_inicio) missing.push('Data de início do período');
    if (form.periodo_tipo === 'datas' && !form.periodo_fim) missing.push('Data de término do período');
    if (form.via_agencia && !form.agencia_nome.trim()) missing.push('Nome da agência');
    if (form.via_agencia && !form.comissao_pct) missing.push('Comissão da agência');
    // Em renovação, troca de material é obrigatório (Sim/Não).
    if (isRenovacao && form.troca_material !== true && form.troca_material !== false) {
      missing.push('Haverá troca de material? (Sim/Não)');
    }
    if (!form.responsavel_nome.trim()) missing.push('Nome do responsável pela compra');
    if (!form.responsavel_whatsapp.trim() && !form.responsavel_fixo.trim()) {
      missing.push('WhatsApp ou Telefone Fixo do responsável');
    } else {
      if (form.responsavel_whatsapp.trim()) {
        const phoneErr = validatePhone(form.responsavel_whatsapp);
        if (phoneErr) missing.push(`WhatsApp: ${phoneErr}`);
      }
      if (form.responsavel_fixo.trim()) {
        const fixoErr = validateFixoPhone(form.responsavel_fixo);
        if (fixoErr) missing.push(`Telefone Fixo: ${fixoErr}`);
      }
    }
    if (form.criativo_whatsapp.trim()) {
      const creativePhoneErr = validatePhone(form.criativo_whatsapp);
      if (creativePhoneErr) missing.push(`WhatsApp (Responsável pelos Criativos): ${creativePhoneErr}`);
    }
    // E-mail é opcional. Observações e P.I. também.

    if (missing.length) {
      setValidationErrors({ items: missing });
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      const cotaContratada = form.cota_contratada || (form.plano_fidelidade ? '10 Segundos' : '');
      const resolvedPermuta = isPermuta
        ? resolvePermutaSplit(form.valor_mensal, form.permuta_valor_servico, form.permuta_valor_receber)
        : null;
      fd.append('tipo', form.tipo);
      fd.append('venda_escritorio', form.venda_escritorio ? 'true' : 'false');
      fd.append('razao_social', form.razao_social.trim());
      fd.append('nome_fantasia', form.nome_fantasia.trim());
      fd.append('cnpj', form.cnpj.trim());
      fd.append('tipo_documento', form.is_cpf ? 'CPF' : 'CNPJ');
      if (form.is_cpf) fd.append('endereco_cep', form.endereco_cep.trim());
      fd.append('valor_mensal', form.valor_mensal.trim());
      fd.append('cota_contratada', cotaContratada);
      fd.append('plano_fidelidade', form.plano_fidelidade ? 'true' : 'false');
      fd.append('tipo_valor', form.tipo_valor);
      fd.append('via_agencia', form.via_agencia ? 'true' : 'false');
      if (form.via_agencia) {
        fd.append('agencia_nome', form.agencia_nome.trim());
        fd.append('comissao_pct', form.comissao_pct.trim());
        fd.append('pi_numero', form.pi_numero.trim());
      }
      if (form.troca_material === true) {
        fd.append('troca_material', 'true');
      } else if (form.troca_material === false) {
        fd.append('troca_material', 'false');
      }
      if (resolvedPermuta) {
        if (resolvedPermuta.servicoFormatted) fd.append('permuta_valor_servico', resolvedPermuta.servicoFormatted);
        if (resolvedPermuta.receberFormatted) fd.append('permuta_valor_receber', resolvedPermuta.receberFormatted);
      }
      fd.append('periodo_tipo', form.periodo_tipo);
      fd.append('periodo_meses', form.periodo_meses);
      fd.append('periodo_inicio', form.periodo_inicio);
      fd.append('periodo_fim', form.periodo_fim);
      fd.append('data_primeira_parcela', form.data_primeira_parcela);
      fd.append('data_inicio_veiculacao', form.data_inicio_veiculacao);
      fd.append('dia_pagamento_dia', form.dia_pagamento_dia);
      // Build dia_pagamento string for backward compat
      fd.append('dia_pagamento', form.dia_pagamento_dia ? `Dia ${form.dia_pagamento_dia} de cada mês` : '');
      fd.append('responsavel_nome', form.responsavel_nome.trim());
      fd.append('responsavel_whatsapp', form.responsavel_whatsapp.trim());
      fd.append('responsavel_fixo', form.responsavel_fixo.trim());
      fd.append('email', form.email.trim());
      fd.append('criativo_nome', form.criativo_nome.trim());
      fd.append('criativo_whatsapp', form.criativo_whatsapp.trim());
      fd.append('criativo_email', form.criativo_email.trim());
      fd.append('obs', form.obs.trim());
      fd.append('pontos_nomes', JSON.stringify(selectedPontos.map(p => p.nome)));
      fd.append('pontos_precos', JSON.stringify(
        selectedPontos.reduce((acc, p) => { if (pontoPrecos[p.id]) acc[p.nome] = pontoPrecos[p.id]; return acc; }, {})
      ));
      fd.append('vendedor_nome', currentUser
        ? currentUser.username || `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Vendedor'
        : 'Vendedor'
      );
      if (piFiles.length) piFiles.forEach(f => fd.append('pi', f));

      const res = await submitNovaVenda(fd);
      setResult({ ok: true, msg: res.message || 'Venda registrada e notificação enviada!', whatsapp: res.whatsapp_status || 'pendente' });

      try {
        await clearNovaVendaDraft();
      } catch {
        // non-blocking: venda já foi registrada com sucesso
      }

      setForm({ ...emptyForm });
      setSelectedPontos([]);
      setPontoPrecos({});
      setPiFiles([]);
      setSearch('');
      setDraftPayload(null);
      setDraftInfo(null);
      setDraftNotice('');
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
    ? isDark
      ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
      : 'border-orange-400 bg-orange-100 text-orange-700'
    : isDark
      ? 'border-white/10 bg-white/[0.03] text-brand-gray-400 hover:border-white/20 hover:text-white'
      : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-300 hover:text-neutral-900'}`;

  /* ─── preview da mensagem ─── */
  const msgPreview = buildMsgPreview({ form, selectedPontos, pontoPrecos, currentUser });

  return (
    <div className="space-y-5 max-w-3xl">
      <AnimatePresence>
        {validationErrors && (
          <motion.div
            key="validation-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setValidationErrors(null)} />
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className={`relative w-full max-w-md rounded-2xl border-2 shadow-2xl overflow-hidden ${isDark
                ? 'border-red-500/40 bg-gradient-to-br from-[#1a0a0a] to-[#0a0a0a]'
                : 'border-red-300 bg-white'}`}
            >
              <div className={`flex items-center gap-3 p-5 border-b ${isDark ? 'border-red-500/20 bg-red-500/[0.06]' : 'border-red-100 bg-red-50'}`}>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDark ? 'bg-red-500/20' : 'bg-red-100'}`}>
                  <AlertTriangle size={20} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Campos obrigatórios faltando</h3>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                    Preencha os itens abaixo antes de registrar a venda.
                  </p>
                </div>
                <button type="button" onClick={() => setValidationErrors(null)} className={`p-1.5 rounded-lg ${isDark ? 'text-brand-gray-400 hover:bg-white/10' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 max-h-[50vh] overflow-y-auto">
                <ul className="space-y-1.5">
                  {validationErrors.items.map((item, i) => (
                    <li key={i} className={`flex items-start gap-2 text-sm ${isDark ? 'text-brand-gray-200' : 'text-neutral-700'}`}>
                      <span className="text-red-500 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`p-4 border-t ${isDark ? 'border-white/10 bg-black/30' : 'border-neutral-100 bg-neutral-50'}`}>
                <button
                  type="button"
                  onClick={() => setValidationErrors(null)}
                  className="w-full rounded-xl bg-gradient-to-r from-red-500 to-red-600 py-2.5 px-4 text-sm font-semibold text-white shadow-md hover:scale-[1.01] active:scale-[0.99] transition-transform"
                >
                  Entendi, vou corrigir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
          Registrar venda
        </h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
          Preencha os dados da venda. Ao confirmar, uma notificação será disparada automaticamente
          via WhatsApp para o grupo/contato configurado.
        </p>
      </div>

      {draftPayload && (
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Rascunho disponível</h3>
              <p className={`text-xs mt-1 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                Última atualização: {fmtDateTime(draftInfo?.updated_at || draftInfo?.created_at || '') || 'agora'}.
                O anexo de P.I. não é salvo no rascunho e precisa ser selecionado novamente.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleLoadDraft}
                disabled={busy || draftBusy}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${isDark
                  ? 'border-brand-orange/40 text-brand-orange hover:bg-brand-orange/10'
                  : 'border-orange-300 text-orange-700 hover:bg-orange-50'}`}
              >
                Retomar rascunho
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                disabled={busy || draftBusy}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${isDark
                  ? 'border-white/15 text-brand-gray-300 hover:bg-white/5'
                  : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'}`}
              >
                Excluir rascunho
              </button>
            </div>
          </div>
        </section>
      )}

      {draftNotice && (
        <p className={`text-sm rounded-xl px-4 py-3 border ${isDark
          ? 'text-blue-300 bg-blue-500/10 border-blue-500/20'
          : 'text-blue-700 bg-blue-50 border-blue-200'}`}>
          {draftNotice}
        </p>
      )}

      {result && (
        <div className="space-y-2">
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

          {result.ok && result.whatsapp && (
            <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 border ${
              result.whatsapp === 'enviado'
                ? isDark ? 'bg-green-500/10 border-green-500/20' : 'bg-green-50 border-green-200'
                : result.whatsapp === 'nao_configurado'
                  ? isDark ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'
                  : isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'
            }`}>
              {result.whatsapp === 'enviado' ? (
                <>
                  <MessageCircle size={16} className="shrink-0 text-green-400" />
                  <span className={`text-sm font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                    WhatsApp enviado com sucesso
                  </span>
                </>
              ) : result.whatsapp === 'nao_configurado' ? (
                <>
                  <WifiOff size={16} className="shrink-0 text-yellow-400" />
                  <span className={`text-sm ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
                    WhatsApp não configurado — configure a Evolution API nas Configurações
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle size={16} className="shrink-0 text-red-400" />
                  <span className={`text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                    Falha ao enviar WhatsApp — tente reenviar manualmente
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Tipo de negócio */}
        <section className={card}>
          <h3 className={sectionTitle}>Tipo de negócio</h3>
          <div className="flex gap-3">
            {TIPOS_NEGOCIO.map(t => (
              <button key={t} type="button" onClick={() => setTipoNegocio(t)} className={toggleBtn(form.tipo === t)}>
                {t}
              </button>
            ))}
          </div>

          {/* Venda do Escritório */}
          <div className="flex items-center gap-3 mt-1">
            <button
              type="button"
              onClick={() => set('venda_escritorio', !form.venda_escritorio)}
              className={`w-10 h-5 rounded-full transition-colors relative ${form.venda_escritorio ? 'bg-brand-orange' : isDark ? 'bg-white/20' : 'bg-neutral-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.venda_escritorio ? 'left-5' : 'left-0.5'}`} />
            </button>
            <div>
              <label className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                Venda do Escritório
              </label>
              <p className={`text-[11px] mt-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                Entra na soma geral das metas, mas não é atribuída a nenhum vendedor específico.
              </p>
            </div>
          </div>

          {/* Renovação: lista de vendas anteriores realizadas pelo sistema */}
          {isRenovacao && (
            <div className={`mt-4 rounded-xl border p-4 ${isDark ? 'border-brand-orange/30 bg-brand-orange/[0.06]' : 'border-orange-200 bg-orange-50/60'}`}>
              <div className="flex items-start gap-2 mb-3">
                <RefreshCw size={16} className="text-brand-orange mt-0.5" />
                <div className="flex-1">
                  <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Vincular a uma venda anterior</div>
                  <p className={`text-xs mt-1 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                    Escolha uma venda já cadastrada para preencher os dados automaticamente. Caso não queira vincular, deixe em branco e siga o fluxo padrão.
                  </p>
                </div>
              </div>
              {loadingVendasAnt ? (
                <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                  <Loader2 size={14} className="animate-spin" /> Carregando vendas anteriores…
                </div>
              ) : vendasAntError ? (
                <div className="space-y-2">
                  <p className={`text-xs ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                    {vendasAntError}
                  </p>
                  <button
                    type="button"
                    onClick={retryLoadVendasAnteriores}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${isDark ? 'border-white/10 text-white/90 hover:bg-white/10' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}
                  >
                    <RefreshCw size={12} />
                    Tentar novamente
                  </button>
                </div>
              ) : vendasAnterioresOptions.length === 0 ? (
                <p className={`text-xs ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Nenhuma venda anterior disponível.</p>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <CustomSelect
                      value={vendaOrigemId}
                      onChange={aplicarVendaOrigem}
                      options={vendasAnterioresOptions}
                      placeholder="Selecionar venda anterior…"
                      isDark={isDark}
                    />
                  </div>
                  {vendaOrigemId && (
                    <button
                      type="button"
                      onClick={limparVendaOrigem}
                      className={`shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${isDark ? 'bg-white/5 border border-white/10 text-white/80 hover:bg-white/10' : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'}`}
                      title="Desvincular venda anterior"
                    >
                      <X size={12} /> Desvincular
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Dados do cliente */}
        <section className={card}>
          <h3 className={sectionTitle}>Dados do cliente</h3>

          {/* Toggle CPF (PJ x PF) */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => set('is_cpf', !form.is_cpf)}
              className={`w-10 h-5 rounded-full transition-colors relative ${form.is_cpf ? 'bg-brand-orange' : isDark ? 'bg-white/20' : 'bg-neutral-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.is_cpf ? 'left-5' : 'left-0.5'}`} />
            </button>
            <label className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              CPF (Pessoa Física)
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>{form.is_cpf ? 'Nome completo *' : 'Razão Social *'}</label>
              <input
                className={inp}
                value={form.razao_social}
                onChange={e => set('razao_social', e.target.value)}
                placeholder={form.is_cpf ? 'Nome completo do cliente' : 'Empresa LTDA'}
              />
            </div>
            <div>
              <label className={lbl}>
                Nome Fantasia {form.via_agencia || form.is_cpf
                  ? <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} normal-case font-normal`}>(opcional)</span>
                  : '*'}
              </label>
              <input
                className={inp}
                value={form.nome_fantasia}
                onChange={e => set('nome_fantasia', e.target.value)}
                placeholder="Nome fantasia da empresa"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>
                {form.is_cpf ? 'CPF' : 'CNPJ'} {form.via_agencia
                  ? <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} normal-case font-normal`}>(opcional via agência)</span>
                  : '*'}
              </label>
              <input
                className={inp}
                value={form.cnpj}
                onChange={e => set('cnpj', form.is_cpf ? fmtCpf(e.target.value) : fmtCnpj(e.target.value))}
                placeholder={form.is_cpf ? '000.000.000-00' : '00.000.000/0000-00'}
              />
            </div>
            {form.is_cpf && (
              <div>
                <label className={lbl}>Endereço ou CEP *</label>
                <input
                  className={inp}
                  value={form.endereco_cep}
                  onChange={e => set('endereco_cep', e.target.value)}
                  placeholder="Rua, número, bairro, cidade — ou CEP"
                />
              </div>
            )}
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
                  className={`inline-flex items-center gap-1.5 rounded-lg border text-xs px-2.5 py-1 font-medium ${isDark ? 'bg-brand-orange/15 border-brand-orange/30 text-brand-orange' : 'bg-orange-100 border-orange-300 text-orange-700'}`}
                >
                  {p.nome}
                  <button type="button" onClick={() => togglePonto(p)} className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-orange-900'}`}>
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

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pontoFilterCidade}
              onChange={e => setPontoFilterCidade(e.target.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none ${isDark
                ? 'bg-white/5 border border-white/10 text-white focus:border-brand-orange/40'
                : 'bg-white border border-neutral-200 text-neutral-900 focus:border-brand-orange/60'}`}
            >
              <option value="todas">Todas as cidades</option>
              {pontoCidades.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={pontoFilterTipo}
              onChange={e => setPontoFilterTipo(e.target.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none ${isDark
                ? 'bg-white/5 border border-white/10 text-white focus:border-brand-orange/40'
                : 'bg-white border border-neutral-200 text-neutral-900 focus:border-brand-orange/60'}`}
            >
              <option value="todos">Todos os tipos</option>
              {pontoTipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {(pontoFilterCidade !== 'todas' || pontoFilterTipo !== 'todos') && (
              <button
                type="button"
                onClick={() => { setPontoFilterCidade('todas'); setPontoFilterTipo('todos'); }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? 'text-brand-gray-400 hover:text-white hover:bg-white/5' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'}`}
              >
                <X size={11} /> Limpar
              </button>
            )}
            <span className={`text-xs ml-auto ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
              {filteredPontos.length} ponto{filteredPontos.length !== 1 ? 's' : ''}
            </span>
          </div>

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
          {selectedPontos.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                Valor por ponto {form.plano_fidelidade ? '(opcional — Plano Fidelidade ativo)' : '*'}
              </p>
              {selectedPontos.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className={`text-sm flex-1 min-w-0 truncate ${isDark ? 'text-white' : 'text-neutral-800'}`}>{p.nome}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>R$</span>
                    <input
                      className={`${inp} !w-32 text-right`}
                      value={pontoPrecos[p.id] || ''}
                      onChange={e => setPontoPrecos(pp => ({ ...pp, [p.id]: fmtCurrency(e.target.value) }))}
                      placeholder="0,00"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
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
                onChange={e => set('valor_mensal', fmtCurrency(e.target.value))}
                placeholder="0,00"
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

          {isPermuta && (
            <div className={`rounded-xl border p-3 space-y-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                Permuta (opcional)
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Parte em troca de serviço</label>
                  <input
                    className={inp}
                    value={form.permuta_valor_servico}
                    onChange={e => set('permuta_valor_servico', fmtCurrency(e.target.value))}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className={lbl}>Parte em recebimento (meta)</label>
                  <input
                    className={inp}
                    value={form.permuta_valor_receber}
                    onChange={e => set('permuta_valor_receber', fmtCurrency(e.target.value))}
                    placeholder="0,00"
                  />
                </div>
              </div>
              <p className={`text-[11px] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                Se preencher apenas um dos campos, o outro será inferido automaticamente com base no valor mensal.
                {permutaSplit.receberFormatted
                  ? ` Valor que entra na meta: R$ ${permutaSplit.receberFormatted}.`
                  : ''}
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>
                Data da primeira parcela {form.via_agencia ? <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} normal-case font-normal`}>(opcional via agência)</span> : '*'}
              </label>
              <input
                type="date"
                className={inp}
                value={form.data_primeira_parcela}
                onChange={e => set('data_primeira_parcela', e.target.value)}
              />
            </div>
            <div>
              <label className={lbl}>Data de início de veiculação *</label>
              <input
                type="date"
                className={inp}
                value={form.data_inicio_veiculacao}
                onChange={e => set('data_inicio_veiculacao', e.target.value)}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>
                Dia do pagamento {form.tipo === 'Permuta' ? <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} normal-case font-normal`}>(opcional para Permuta)</span> : form.via_agencia ? <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} normal-case font-normal`}>(opcional via agência)</span> : '*'}
              </label>
              <div className="relative">
                <select
                  className={inp}
                  value={form.dia_pagamento_dia}
                  onChange={e => set('dia_pagamento_dia', e.target.value)}
                >
                  <option value="">Selecionar dia...</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>Dia {d}</option>
                  ))}
                </select>
                {form.dia_pagamento_dia && (
                  <p className={`text-xs mt-1.5 font-medium ${isDark ? 'text-brand-orange' : 'text-orange-600'}`}>
                    Dia {form.dia_pagamento_dia} de cada mês.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>
                Cota contratada {form.plano_fidelidade ? <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} normal-case font-normal`}>(opcional no Plano Fidelidade)</span> : '*'}
              </label>
              <select
                className={inp}
                value={form.cota_contratada}
                onChange={e => set('cota_contratada', e.target.value)}
              >
                <option value="">Selecionar cota...</option>
                {COTAS_CONTRATADAS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className={`flex items-center gap-3 cursor-pointer select-none`}>
                <button
                  type="button"
                  onClick={handleTogglePlanoFidelidade}
                  disabled={planoFidelidadeBusy}
                  className={`w-10 h-5 rounded-full transition-colors relative disabled:opacity-70 disabled:cursor-wait ${form.plano_fidelidade ? 'bg-brand-orange' : isDark ? 'bg-white/20' : 'bg-neutral-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.plano_fidelidade ? 'left-5' : 'left-0.5'}`} />
                </button>
                <span className={`text-sm font-medium inline-flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-neutral-700'}`}>
                  Plano Fidelidade
                  {planoFidelidadeBusy ? <Loader2 size={13} className="animate-spin" /> : null}
                </span>
              </label>
            </div>
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
                <div className="sm:col-span-2">
                  <label className={lbl}>Número da PI *</label>
                  <input
                    className={inp}
                    value={form.pi_numero}
                    onChange={e => set('pi_numero', e.target.value)}
                    placeholder="Ex: PI-2026-0001"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Troca de material — só para Renovação */}
          {form.tipo === 'Renovação' && (
            <div className="max-w-md">
              <label className={lbl}>Haverá troca de material? *</label>
              <CustomSelect
                value={form.troca_material === true ? 'sim' : form.troca_material === false ? 'nao' : ''}
                onChange={(v) => set('troca_material', v === 'sim' ? true : v === 'nao' ? false : undefined)}
                options={[
                  { value: 'sim', label: 'Sim' },
                  { value: 'nao', label: 'Não' },
                ]}
                placeholder="Selecionar Sim ou Não…"
                isDark={isDark}
              />
              <p className={`text-xs mt-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                Quando a resposta for Não, o PDF técnico não será enviado ao cliente nesta renovação.
              </p>
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
              <label className={lbl}>
                WhatsApp {form.responsavel_fixo.trim()
                  ? <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} normal-case font-normal`}>(opcional — Fixo informado)</span>
                  : '*'}
              </label>
              <input
                className={inp}
                value={form.responsavel_whatsapp}
                onChange={e => set('responsavel_whatsapp', fmtPhone(e.target.value))}
                placeholder="(43) 99999-9999"
                inputMode="tel"
              />
              {(() => {
                const d = form.responsavel_whatsapp.replace(/\D/g, '');
                if (!d) {
                  return (
                    <p className={`text-[11px] mt-1.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                      11 dígitos: DDD + 9 + número. Ex: (43) 99999-9999.
                    </p>
                  );
                }
                const phoneErr = validatePhone(form.responsavel_whatsapp);
                if (phoneErr) {
                  return <p className="text-[11px] mt-1.5 text-red-500 font-medium">{phoneErr}</p>;
                }
                return <p className="text-[11px] mt-1.5 text-green-600 font-medium">Celular válido.</p>;
              })()}
            </div>
          </div>
          <div>
            <label className={lbl}>
              Telefone Fixo {form.responsavel_whatsapp.trim()
                ? <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} normal-case font-normal`}>(opcional — WhatsApp informado)</span>
                : <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} normal-case font-normal`}>(obrigatório se não houver WhatsApp)</span>}
            </label>
            <input
              className={inp}
              value={form.responsavel_fixo}
              onChange={e => set('responsavel_fixo', fmtFixoPhone(e.target.value))}
              placeholder="(43) 3333-4444"
              inputMode="tel"
            />
            {(() => {
              const d = form.responsavel_fixo.replace(/\D/g, '');
              if (!d) {
                return (
                  <p className={`text-[11px] mt-1.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                    10 dígitos: DDD + 8 dígitos. Ex: (43) 3333-4444.
                  </p>
                );
              }
              const fixoErr = validateFixoPhone(form.responsavel_fixo);
              if (fixoErr) {
                return <p className="text-[11px] mt-1.5 text-red-500 font-medium">{fixoErr}</p>;
              }
              return <p className="text-[11px] mt-1.5 text-green-600 font-medium">Telefone fixo válido.</p>;
            })()}
          </div>
          <div>
            <label className={lbl}>Email <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} font-normal`}>(opcional)</span></label>
            <input
              type="email"
              className={inp}
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="email@empresa.com.br"
            />
          </div>
        </section>

        {/* Responsável pelos criativos */}
        <section className={card}>
          <h3 className={sectionTitle}>Responsável pelos criativos <span className={`${isDark ? 'text-brand-gray-500' : 'text-neutral-400'} normal-case font-normal`}>(opcional)</span></h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Nome</label>
              <input
                className={inp}
                value={form.criativo_nome}
                onChange={e => set('criativo_nome', e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div>
              <label className={lbl}>WhatsApp</label>
              <input
                className={inp}
                value={form.criativo_whatsapp}
                onChange={e => set('criativo_whatsapp', fmtPhone(e.target.value))}
                placeholder="(43) 99999-9999"
                inputMode="tel"
              />
              {(() => {
                const d = form.criativo_whatsapp.replace(/\D/g, '');
                if (!d) return null;
                const phoneErr = validatePhone(form.criativo_whatsapp);
                if (phoneErr) return <p className="text-[11px] mt-1.5 text-red-500 font-medium">{phoneErr}</p>;
                return <p className="text-[11px] mt-1.5 text-green-600 font-medium">Celular válido.</p>;
              })()}
            </div>
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input
              type="email"
              className={inp}
              value={form.criativo_email}
              onChange={e => set('criativo_email', e.target.value)}
              placeholder="email@empresa.com.br"
            />
          </div>
        </section>

        {/* Observações */}
        <section className={card}>
          <h3 className={sectionTitle}>Observações</h3>
          <textarea
            className={`${inp} min-h-[80px] resize-y`}
            value={form.obs}
            onChange={e => set('obs', e.target.value)}
            placeholder="Informações adicionais, condições especiais, detalhes relevantes..."
            rows={3}
          />
        </section>

        {/* P.I. */}
        <section className={card}>
          <div className="flex items-center justify-between">
            <h3 className={sectionTitle}>P.I. — Pedido de Inserção</h3>
            <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Opcional</span>
          </div>

          {piFiles.length > 0 && (
            <div className="space-y-2">
              {piFiles.map((file, idx) => (
                <div key={idx} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${isDark ? 'border-brand-orange/30 bg-brand-orange/5' : 'border-orange-200 bg-orange-50'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="shrink-0 text-brand-orange" />
                    <span className={`text-sm truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{file.name}</span>
                    <span className={`text-xs shrink-0 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                      ({(file.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPiFiles(prev => prev.filter((_, i) => i !== idx))}
                    className={`ml-2 shrink-0 p-1 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-orange-100'}`}
                  >
                    <X size={14} className={isDark ? 'text-brand-gray-400' : 'text-neutral-500'} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer py-6 transition-colors ${isDark
            ? 'border-white/10 hover:border-brand-orange/40 hover:bg-brand-orange/5'
            : 'border-neutral-200 hover:border-brand-orange/40 hover:bg-orange-50'}`}>
            <Upload size={20} className={isDark ? 'text-brand-gray-400' : 'text-neutral-400'} />
            <span className={`text-sm ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
              {piFiles.length ? 'Adicionar mais PDFs' : 'Clique para anexar o(s) P.I. em PDF'}
            </span>
            <span className={`text-[11px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
              Você pode anexar vários arquivos (até 10).
            </span>
            <input type="file" accept=".pdf,application/pdf" multiple className="sr-only" onChange={handlePiChange} />
          </label>
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
        )}        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={busy || draftBusy}
            className={`inline-flex items-center gap-2.5 px-4 py-3 border font-semibold rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none ${isDark
              ? 'border-white/15 text-brand-gray-200 hover:bg-white/5'
              : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}
          >
            {draftBusy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {draftBusy ? 'Salvando...' : 'Salvar rascunho'}
          </button>

          <button
            type="submit"
            disabled={busy || draftBusy}
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
function buildMsgPreview({ form, selectedPontos, pontoPrecos, currentUser }) {
  if (!form.razao_social && selectedPontos.length === 0) return '';

  const vendedorNome = currentUser
    ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.username || 'Vendedor'
    : 'Vendedor';

  const isRenovacao = form.tipo === 'Renovação';
  const isPermuta = form.tipo === 'Permuta';
  const permutaSplit = isPermuta
    ? resolvePermutaSplit(form.valor_mensal, form.permuta_valor_servico, form.permuta_valor_receber)
    : null;
  const pontosList = selectedPontos.length
    ? selectedPontos.map(p => {
        const preco = pontoPrecos[p.id];
        return preco ? `  • ${p.nome} — R$ ${preco}` : `  • ${p.nome}`;
      }).join('\n')
    : '  • (nenhum selecionado)';

  let periodo = '';
  if (form.periodo_tipo === 'meses' && form.periodo_meses) {
    periodo = `${form.periodo_meses} ${Number(form.periodo_meses) === 1 ? 'mês' : 'meses'}`;
  } else if (form.periodo_tipo === 'datas' && form.periodo_inicio && form.periodo_fim) {
    periodo = `${fmtDate(form.periodo_inicio)} à ${fmtDate(form.periodo_fim)}`;
  }

  const lines = [
    `${isRenovacao ? '🔄 *RENOVAÇÃO*' : '🟠 *NOVA VENDA*'}${form.venda_escritorio ? ' 🏢 _(Escritório)_' : ''} — ${vendedorNome}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    form.cnpj
      ? `🏢 *${form.razao_social || '—'}*${form.nome_fantasia ? `\n_${form.nome_fantasia}_` : ''}\n_CNPJ: ${form.cnpj}_`
      : `🏢 *${form.razao_social || '—'}*${form.nome_fantasia ? `\n_${form.nome_fantasia}_` : ''}`,
    '',
    `📍 *PONTO${selectedPontos.length !== 1 ? 'S' : ''} CONTRATADO${selectedPontos.length !== 1 ? 'S' : ''}*`,
    pontosList,
    '',
    '💼 *CONDIÇÕES COMERCIAIS*',
    form.valor_mensal ? `💰 Valor mensal: *R$ ${form.valor_mensal}* _(${form.tipo_valor})_` : null,
    permutaSplit?.servicoFormatted ? `🔄 Permuta em serviço: *R$ ${permutaSplit.servicoFormatted}*` : null,
    permutaSplit?.receberFormatted ? `🎯 Permuta que entra na meta: *R$ ${permutaSplit.receberFormatted}*` : null,
    periodo ? `📅 Período: *${periodo}*` : null,
    form.data_inicio_veiculacao ? `📺 Data de início da veiculação: *${fmtDate(form.data_inicio_veiculacao)}*` : null,
    form.data_primeira_parcela ? `📆 Data da 1ª parcela: *${fmtDate(form.data_primeira_parcela)}*` : null,
    form.dia_pagamento_dia ? `📆 Dia de pagamento: *Dia ${form.dia_pagamento_dia} de cada mês*` : null,
    form.cota_contratada ? `⏱️ Cota contratada: *${form.cota_contratada}*` : null,
    form.plano_fidelidade ? `🤝 Plano Fidelidade: *Sim*` : null,
    form.via_agencia && form.agencia_nome ? `🤝 Via agência: *${form.agencia_nome}*${form.comissao_pct ? ` · Comissão: *${form.comissao_pct}%*` : ''}` : null,
    isRenovacao ? `🔁 Troca de material: *${form.troca_material === true ? 'Sim' : form.troca_material === false ? 'Não' : 'Não definido'}*` : null,
    '',
    form.responsavel_nome || form.responsavel_whatsapp || form.responsavel_fixo || form.email ? '👤 *RESPONSÁVEL PELO CLIENTE*' : null,
    form.responsavel_nome ? `Nome: ${form.responsavel_nome}` : null,
    form.responsavel_whatsapp ? `WhatsApp: ${form.responsavel_whatsapp}` : null,
    form.responsavel_fixo ? `Telefone Fixo: ${form.responsavel_fixo}` : null,
    form.email ? `Email: ${form.email}` : null,
    (form.criativo_nome || form.criativo_whatsapp || form.criativo_email) ? '' : null,
    (form.criativo_nome || form.criativo_whatsapp || form.criativo_email) ? '🎨 *RESPONSÁVEL PELOS CRIATIVOS*' : null,
    form.criativo_nome ? `Nome: ${form.criativo_nome}` : null,
    form.criativo_whatsapp ? `WhatsApp: ${form.criativo_whatsapp}` : null,
    form.criativo_email ? `Email: ${form.criativo_email}` : null,
    form.obs?.trim() ? '' : null,
    form.obs?.trim() ? `📝 *OBS:* ${form.obs.trim()}` : null,
  ].filter(l => l !== null);

  return lines.join('\n');
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

