import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn, Plus, Pencil, Trash2, Eye, EyeOff, X, Upload,
  Building2, Save, Copy, Check, Loader2, RefreshCcw
} from 'lucide-react';
import Navbar from '../components/Navbar';
import {
  login,
  fetchAdminPontos,
  createPonto,
  updatePonto,
  deletePonto,
  fetchEntornoCategories,
  fetchEntornoJobs,
  fetchEntornoJobStatus,
  requestEntornoAnalysis
} from '../lib/api';
import ScreenAreaEditor from '../components/admin/ScreenAreaEditor';
import PdfCalibrationPanel from '../components/admin/PdfCalibrationPanel';
import { parseScreen, serializeSimulationConfig } from '../lib/simulation';

const DEFAULT_CIDADES = ['Londrina', 'Maringá', 'Balneário Camboriú', 'Itajaí'];
const DEFAULT_TIPOS = ['Elevador', 'Tela Indoor', 'Painel LED', 'Backlight', 'Frontlight', 'Totem Digital', 'Circuito Muffato', 'LED Posto', 'Video Wall'];
const PUBLICOS = ['A', 'B', 'A/B'];
const ENTORNO_SEGMENTOS = [
  'clinica', 'hospital', 'educacao', 'escola', 'faculdade',
  'automotivo', 'varejo', 'restaurante', 'imobiliaria',
  'construtora', 'contabilidade', 'advocacia', 'industria', 'outro'
];

const emptyForm = {
  nome: '', cidade: 'Londrina', tipo: 'Elevador', endereco: '',
  lat: '', lng: '', horario: '06:00 às 22:00', fluxo: '',
  insercoes: '', tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
  publico: 'A/B', telas: '1', preco: '', descricao: '', imagem: '',
  simulacao_tela: '', simulacao_arte: '', simulacao_preview: '',
  arte_largura: '1920', arte_altura: '1080'
};

export default function Admin() {
  const [auth, setAuth] = useState(!!sessionStorage.getItem('admin_token'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [pontos, setPontos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | ponto object
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [baseImagePreviewUrl, setBaseImagePreviewUrl] = useState('');
  const [screenSelection, setScreenSelection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);

  const [entornoForm, setEntornoForm] = useState({
    segmento: 'clinica',
    cidade: '',
    raio: 800
  });
  const [entornoCategories, setEntornoCategories] = useState([]);
  const [entornoProviders, setEntornoProviders] = useState(null);
  const [entornoBusy, setEntornoBusy] = useState(false);
  const [entornoError, setEntornoError] = useState('');
  const [entornoJobs, setEntornoJobs] = useState([]);
  const [entornoCurrentJob, setEntornoCurrentJob] = useState(null);

  const [cidades, setCidades] = useState([]);
  const [tipos, setTipos] = useState([]);

  useEffect(() => {
    const savedCidades = localStorage.getItem('midia-kit-cidades');
    const savedTipos = localStorage.getItem('midia-kit-formatos');
    setCidades(savedCidades ? JSON.parse(savedCidades) : DEFAULT_CIDADES);
    setTipos(savedTipos ? JSON.parse(savedTipos) : DEFAULT_TIPOS);
  }, []);

  useEffect(() => {
    if (cidades.length > 0) localStorage.setItem('midia-kit-cidades', JSON.stringify(cidades));
  }, [cidades]);

  useEffect(() => {
    if (tipos.length > 0) localStorage.setItem('midia-kit-formatos', JSON.stringify(tipos));
  }, [tipos]);

  useEffect(() => {
    if (!imageFile) {
      setBaseImagePreviewUrl('');
      return;
    }
    const blobUrl = URL.createObjectURL(imageFile);
    setBaseImagePreviewUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [imageFile]);

  useEffect(() => {
    if (!auth) return;

    let cancelled = false;

    const loadCategories = async () => {
      try {
        const data = await fetchEntornoCategories(entornoForm.segmento);
        if (cancelled) return;
        setEntornoCategories(Array.isArray(data.categorias) ? data.categorias : []);
        setEntornoProviders(data.providers || null);
      } catch {
        if (cancelled) return;
        setEntornoCategories([]);
      }
    };

    loadCategories();
    return () => {
      cancelled = true;
    };
  }, [auth, entornoForm.segmento]);

  useEffect(() => {
    if (!auth) return;

    let cancelled = false;

    const loadJobs = async () => {
      try {
        const response = await fetchEntornoJobs({ limit: 15 });
        if (cancelled) return;
        setEntornoJobs(Array.isArray(response.jobs) ? response.jobs : []);
      } catch {
        if (cancelled) return;
        setEntornoJobs([]);
      }
    };

    loadJobs();
    const timer = setInterval(loadJobs, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [auth]);

  useEffect(() => {
    if (!entornoCurrentJob?.id) return;

    const status = String(entornoCurrentJob.status || '').toLowerCase();
    if (status === 'completed' || status === 'failed') return;

    let cancelled = false;
    const tick = async () => {
      try {
        const latest = await fetchEntornoJobStatus(entornoCurrentJob.id);
        if (cancelled) return;
        setEntornoCurrentJob(latest);
      } catch {
        if (cancelled) return;
      }
    };

    const timer = setInterval(tick, 3000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [entornoCurrentJob?.id, entornoCurrentJob?.status]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const data = await login(username, password);
      sessionStorage.setItem('admin_token', data.token);
      setAuth(true);
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const loadPontos = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminPontos();
      setPontos(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auth) loadPontos();
  }, [auth]);

  const openNew = () => {
    setForm(emptyForm);
    setImageFile(null);
    setScreenSelection(null);
    setPromptCopied(false);
    setEditing('new');
  };

  const openEdit = (ponto) => {
    setForm({
      nome: ponto.nome || '',
      cidade: ponto.cidade || 'Londrina',
      tipo: ponto.tipo || 'Elevador',
      endereco: ponto.endereco || '',
      lat: ponto.lat?.toString() || '',
      lng: ponto.lng?.toString() || '',
      horario: ponto.horario || '',
      fluxo: ponto.fluxo?.toString() || '',
      insercoes: ponto.insercoes?.toString() || '',
      tempo: ponto.tempo || '15s',
      loop: ponto.loop || '3 min',
      veiculacao: ponto.veiculacao || 'Vídeo sem áudio',
      publico: ponto.publico || 'A/B',
      telas: ponto.telas?.toString() || '1',
      preco: ponto.preco?.toString() || '',
      descricao: ponto.descricao || '',
      imagem: ponto.imagem || '',
      simulacao_tela: ponto.simulacao_tela || '',
      simulacao_arte: ponto.simulacao_arte || '',
      simulacao_preview: ponto.simulacao_preview || '',
      arte_largura: ponto.arte_largura?.toString() || '1920',
      arte_altura: ponto.arte_altura?.toString() || '1080'
    });
    setImageFile(null);
    setScreenSelection(parseScreen(ponto.simulacao_tela));
    setPromptCopied(false);
    setEditing(ponto);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      const payload = {
        ...form,
        simulacao_tela: serializeSimulationConfig({ corners: screenSelection })
      };
      Object.entries(payload).forEach(([k, v]) => fd.append(k, v ?? ''));
      if (imageFile) fd.append('imagem', imageFile);

      if (editing === 'new') {
        await createPonto(fd);
      } else {
        await updatePonto(editing.id, fd);
      }

      setEditing(null);
      loadPontos();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deseja realmente desativar este ponto?')) return;
    try {
      await deletePonto(id);
      loadPontos();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRunEntorno = async () => {
    setEntornoBusy(true);
    setEntornoError('');
    try {
      const payload = {
        segmento: entornoForm.segmento,
        cidade: entornoForm.cidade,
        raio: Number(entornoForm.raio) || 800
      };
      const response = await requestEntornoAnalysis(payload);
      if (response?.jobId) {
        const job = await fetchEntornoJobStatus(response.jobId);
        setEntornoCurrentJob(job);
      }
      const jobsResponse = await fetchEntornoJobs({ limit: 15 });
      setEntornoJobs(Array.isArray(jobsResponse.jobs) ? jobsResponse.jobs : []);
    } catch (err) {
      setEntornoError(err.message || 'Falha ao enfileirar análise de entorno');
    } finally {
      setEntornoBusy(false);
    }
  };

  const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const filtered = pontos.filter(p =>
    !search || p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.cidade.toLowerCase().includes(search.toLowerCase())
  );

  const artWidth = parseInt(form.arte_largura, 10) || 0;
  const artHeight = parseInt(form.arte_altura, 10) || 0;
  const artRatioText = formatRatio(artWidth, artHeight);

  const autoArtPrompt = useMemo(() => {
    if (!form.nome) return '';

    const resolution = artWidth > 0 && artHeight > 0 ? `${artWidth}x${artHeight}px` : '1920x1080px';
    const ratio = artRatioText || '16:9';

    return [
      `Crie uma arte publicitária para mídia OOH digital do ponto \"${form.nome}\".`,
      `Formato do ponto: ${form.tipo || 'Tela Indoor'} em ${form.cidade || 'Londrina'}.`,
      `Resolução obrigatória: ${resolution}.`,
      `Proporção obrigatória: ${ratio}.`,
      `Objetivo: alta legibilidade a distância, contraste forte e mensagem principal em até 7 palavras.`,
      `Direção visual: moderna, premium, limpa, com foco em impacto imediato.`,
      `Regras: não adicionar marcas d'água, não distorcer, manter margens de segurança de 5% em todos os lados.`,
      `Entrega final: 1 variação estática em PNG na resolução exata solicitada.`
    ].join(' ');
  }, [form.nome, form.tipo, form.cidade, artWidth, artHeight, artRatioText]);

  const handleCopyPrompt = async () => {
    if (!autoArtPrompt) return;
    try {
      await navigator.clipboard.writeText(autoArtPrompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1800);
    } catch {
      alert('Não foi possível copiar automaticamente.');
    }
  };

  // Login screen
  if (!auth) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navbar />
        <div className="pt-16 flex items-center justify-center min-h-screen">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm p-8"
          >
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-xl bg-brand-orange/10 border border-brand-orange/20 flex items-center justify-center mx-auto mb-4">
                <LogIn size={20} className="text-brand-orange" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Admin</h1>
              <p className="text-sm text-brand-gray-500">Acesso restrito à equipe Intermidia</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs text-brand-gray-400 mb-1.5">Usuário</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40 transition-colors"
                  placeholder="admin"
                  required
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-xs text-brand-gray-400 mb-1.5">Senha</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-10 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40 transition-colors"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-500 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {loginError && (
                <p className="text-red-400 text-xs">{loginError}</p>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
              >
                Entrar
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    );
  }

  // Admin panel
  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="pt-20 max-w-7xl mx-auto px-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Painel Administrativo</h1>
            <p className="text-sm text-brand-gray-500 mt-1">Gerencie os pontos de mídia</p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-sm"
          >
            <Plus size={16} />
            Novo ponto
          </button>
        </div>

        <EntornoAdminPanel
          form={entornoForm}
          setForm={setEntornoForm}
          cidades={cidades}
          categories={entornoCategories}
          providers={entornoProviders}
          busy={entornoBusy}
          error={entornoError}
          onRun={handleRunEntorno}
          currentJob={entornoCurrentJob}
          jobs={entornoJobs}
        />

        <PdfCalibrationPanel />

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou cidade..."
            className="w-full max-w-md px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-brand-gray-500 focus:outline-none focus:border-brand-orange/40 transition-colors"
          />
        </div>

        {/* Table */}
        <div className="border border-white/5 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/5">
                  <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs">Nome</th>
                  <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs hidden md:table-cell">Cidade</th>
                  <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs hidden md:table-cell">Tipo</th>
                  <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs hidden lg:table-cell">Telas</th>
                  <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs hidden lg:table-cell">Proporção</th>
                  <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs">Preço</th>
                  <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs hidden lg:table-cell">Status</th>
                  <th className="text-right px-4 py-3 text-brand-gray-400 font-medium text-xs">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-brand-gray-500">Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-brand-gray-500">Nenhum ponto encontrado</td></tr>
                ) : filtered.map((p, i) => (
                  <tr key={p.id} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${!p.ativo ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-gray-800 overflow-hidden shrink-0">
                          {p.imagem ? (
                            <img src={p.imagem} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Building2 size={14} className="text-brand-gray-600" />
                            </div>
                          )}
                        </div>
                        <span className="text-white font-medium">{p.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-brand-gray-400 hidden md:table-cell">{p.cidade}</td>
                    <td className="px-4 py-3 text-brand-gray-400 hidden md:table-cell">{p.tipo}</td>
                    <td className="px-4 py-3 text-brand-gray-400 hidden lg:table-cell">{p.telas}</td>
                    <td className="px-4 py-3 text-brand-gray-400 hidden lg:table-cell">{formatRatio(p.arte_largura, p.arte_altura) || '-'}</td>
                    <td className="px-4 py-3 text-brand-orange font-medium">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        p.ativo ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-2 hover:bg-white/10 rounded-lg text-brand-gray-400 hover:text-white transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-2 hover:bg-white/10 rounded-lg text-brand-gray-400 hover:text-red-400 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit / Create Modal */}
      <AnimatePresence>
        {editing !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setEditing(null)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-brand-dark border border-white/10 rounded-2xl p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">
                  {editing === 'new' ? 'Novo Ponto' : 'Editar Ponto'}
                </h2>
                <button
                  onClick={() => setEditing(null)}
                  className="p-2 hover:bg-white/10 rounded-lg text-brand-gray-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Nome *" value={form.nome} onChange={v => updateField('nome', v)} required />
                  <FormSelect label="Cidade" value={form.cidade} onChange={v => updateField('cidade', v)} options={cidades} />
                  <FormSelect label="Tipo" value={form.tipo} onChange={v => updateField('tipo', v)} options={tipos} />
                  <FormSelect label="Público" value={form.publico} onChange={v => updateField('publico', v)} options={PUBLICOS} />
                  <FormField label="Endereço" value={form.endereco} onChange={v => updateField('endereco', v)} className="md:col-span-2" />
                  <FormField label="Latitude" value={form.lat} onChange={v => updateField('lat', v)} type="number" step="any" />
                  <FormField label="Longitude" value={form.lng} onChange={v => updateField('lng', v)} type="number" step="any" />
                  <FormField label="Horário" value={form.horario} onChange={v => updateField('horario', v)} />
                  <FormField label="Fluxo mensal" value={form.fluxo} onChange={v => updateField('fluxo', v)} type="number" />
                  <FormField label="Inserções mensais" value={form.insercoes} onChange={v => updateField('insercoes', v)} type="number" />
                  <FormField label="Tempo" value={form.tempo} onChange={v => updateField('tempo', v)} />
                  <FormField label="Loop" value={form.loop} onChange={v => updateField('loop', v)} />
                  <FormField label="Veiculação" value={form.veiculacao} onChange={v => updateField('veiculacao', v)} />
                  <FormField label="Telas" value={form.telas} onChange={v => updateField('telas', v)} type="number" />
                  <FormField label="Preço (R$)" value={form.preco} onChange={v => updateField('preco', v)} type="number" step="0.01" />
                  <FormField label="Arte largura (px)" value={form.arte_largura} onChange={v => updateField('arte_largura', v)} type="number" min="1" />
                  <FormField label="Arte altura (px)" value={form.arte_altura} onChange={v => updateField('arte_altura', v)} type="number" min="1" />
                </div>

                <div>
                  <label className="block text-xs text-brand-gray-400 mb-1.5">Descrição</label>
                  <textarea
                    value={form.descricao}
                    onChange={e => updateField('descricao', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40 transition-colors resize-none"
                  />
                </div>

                {/* Image upload */}
                <div>
                  <label className="block text-xs text-brand-gray-400 mb-1.5">Imagem</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-brand-gray-300 hover:bg-white/10 cursor-pointer transition-colors">
                      <Upload size={16} />
                      {imageFile ? imageFile.name : 'Upload de imagem'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => setImageFile(e.target.files[0] || null)}
                        className="hidden"
                      />
                    </label>
                    {(form.imagem || imageFile) && (
                      <span className="text-xs text-brand-gray-500">
                        {imageFile ? 'Nova imagem selecionada' : 'Imagem existente'}
                      </span>
                    )}
                  </div>
                </div>

                <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Simulação do ponto</h3>
                    <p className="text-xs text-brand-gray-500 mt-1">
                      Defina aqui apenas a área útil da tela. A arte da campanha será enviada no modal de proposta.
                    </p>
                  </div>

                  {form.imagem || baseImagePreviewUrl ? (
                    <ScreenAreaEditor
                      imageUrl={baseImagePreviewUrl || form.imagem}
                      corners={screenSelection}
                      onChange={setScreenSelection}
                    />
                  ) : (
                    <div className="h-56 rounded-lg border border-dashed border-white/15 flex items-center justify-center text-xs text-brand-gray-500">
                      Envie a imagem base para habilitar a marcação da tela com o mouse
                    </div>
                  )}

                  <p className="text-[11px] text-brand-gray-500">
                    O preview final será gerado no modal de proposta com a arte da campanha selecionada.
                  </p>

                  <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray-300">Proporção da arte para este ponto</p>
                      <span className="px-2.5 py-1 rounded-full bg-brand-orange/15 text-brand-orange text-xs font-semibold">
                        {artRatioText || 'Defina largura e altura'}
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs text-brand-gray-400 mb-1.5">Prompt automático para IA generativa</label>
                      <textarea
                        value={autoArtPrompt}
                        readOnly
                        rows={5}
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-brand-gray-200 focus:outline-none resize-none"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={handleCopyPrompt}
                          disabled={!autoArtPrompt}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white transition-colors disabled:opacity-40"
                        >
                          {promptCopied ? <Check size={14} /> : <Copy size={14} />}
                          {promptCopied ? 'Prompt copiado' : 'Copiar prompt'}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200 disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="px-6 py-3 bg-white/5 border border-white/10 text-white font-medium rounded-xl hover:bg-white/10 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FormField({ label, value, onChange, className = '', type = 'text', ...props }) {
  return (
    <div className={className}>
      <label className="block text-xs text-brand-gray-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40 transition-colors"
        {...props}
      />
    </div>
  );
}

function EntornoAdminPanel({
  form,
  setForm,
  cidades,
  categories,
  providers,
  busy,
  error,
  onRun,
  currentJob,
  jobs
}) {
  const currentStatus = String(currentJob?.status || '').toLowerCase();
  const processing = currentStatus === 'queued' || currentStatus === 'running';

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Análise de entorno</h3>
          <p className="text-xs text-brand-gray-500 mt-1">Reprocessamento manual por segmento e cidade, com fila assíncrona e monitoramento de jobs.</p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-orange/40 bg-brand-orange/15 px-4 py-2 text-sm font-semibold text-brand-orange hover:bg-brand-orange/25 disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
          {busy ? 'Enfileirando...' : 'Reprocessar agora'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className="block text-xs text-brand-gray-400 mb-1.5">Segmento</label>
          <select
            value={form.segmento}
            onChange={(e) => setForm((prev) => ({ ...prev, segmento: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            {ENTORNO_SEGMENTOS.map((segmento) => (
              <option key={segmento} value={segmento} className="bg-brand-dark">{segmento}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-brand-gray-400 mb-1.5">Cidade</label>
          <select
            value={form.cidade}
            onChange={(e) => setForm((prev) => ({ ...prev, cidade: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="" className="bg-brand-dark">Todas</option>
            {cidades.map((cidade) => (
              <option key={cidade} value={cidade} className="bg-brand-dark">{cidade}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-brand-gray-400 mb-1.5">Raio (m)</label>
          <input
            type="number"
            min={200}
            max={2000}
            step={50}
            value={form.raio}
            onChange={(e) => setForm((prev) => ({ ...prev, raio: Number(e.target.value) || 800 }))}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-brand-gray-300">
          <p className="font-semibold uppercase tracking-wide text-brand-gray-400 mb-1">Provedores</p>
          {providers ? (
            <>
              <p>Ordem: {Array.isArray(providers.providerOrder) ? providers.providerOrder.join(' → ') : '-'}</p>
              <p className="mt-1">Disponíveis: {Object.entries(providers.availableProviders || {}).filter(([, ok]) => !!ok).map(([name]) => name).join(', ') || 'nenhum'}</p>
            </>
          ) : (
            <p>Carregando configuração...</p>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-brand-gray-300">
        <p className="font-semibold uppercase tracking-wide text-brand-gray-400 mb-1">Categorias do segmento</p>
        <p>{categories.length ? categories.join(', ') : 'Nenhuma categoria configurada para este segmento.'}</p>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-300">{error}</p>
      )}

      {currentJob && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-brand-gray-300">
          <p className="font-semibold uppercase tracking-wide text-brand-gray-400">Job atual #{currentJob.id}</p>
          <p className="mt-1">Status: <span className={processing ? 'text-brand-orange' : currentStatus === 'failed' ? 'text-red-300' : 'text-green-300'}>{currentJob.status}</span></p>
          <p className="mt-1">Processados: {currentJob.processed_points || 0}/{currentJob.total_points || 0} • Erros: {currentJob.error_count || 0}</p>
          {currentJob.last_error && <p className="mt-1 text-red-300">Último erro: {currentJob.last_error}</p>}
        </div>
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/[0.03] text-left text-brand-gray-400">
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">Segmento</th>
              <th className="px-3 py-2">Cidade</th>
              <th className="px-3 py-2">Raio</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Progresso</th>
              <th className="px-3 py-2">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-brand-gray-500">Nenhum job recente.</td>
              </tr>
            ) : jobs.map((job) => (
              <tr key={job.id} className="border-t border-white/5 text-brand-gray-300">
                <td className="px-3 py-2">#{job.id}</td>
                <td className="px-3 py-2">{job.segmento_analisado}</td>
                <td className="px-3 py-2">{job.cidade || 'Todas'}</td>
                <td className="px-3 py-2">{job.raio_m}m</td>
                <td className="px-3 py-2">{job.status}</td>
                <td className="px-3 py-2">{job.processed_points || 0}/{job.total_points || 0}</td>
                <td className="px-3 py-2">{job.updated_at ? new Date(job.updated_at).toLocaleString('pt-BR') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FormSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs text-brand-gray-400 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-brand-orange/40 transition-colors appearance-none"
      >
        {options.map(o => <option key={o} value={o} className="bg-brand-dark">{o}</option>)}
      </select>
    </div>
  );
}

function formatRatio(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return '';

  const gcd = (a, b) => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x || 1;
  };

  const div = gcd(w, h);
  return `${Math.round(w / div)}:${Math.round(h / div)}`;
}
