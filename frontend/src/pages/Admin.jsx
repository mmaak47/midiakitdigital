import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn, Plus, Pencil, Trash2, Eye, EyeOff, X, Upload,
  Building2, Save
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { login, fetchAdminPontos, createPonto, updatePonto, deletePonto } from '../lib/api';

const DEFAULT_CIDADES = ['Londrina', 'Maringá', 'Balneário Camboriú', 'Itajaí'];
const DEFAULT_TIPOS = ['Elevador', 'Tela Indoor', 'Painel LED', 'Backlight', 'Frontlight', 'Totem Digital', 'Circuito Muffato', 'LED Posto', 'Video Wall'];
const PUBLICOS = ['A', 'B', 'A/B'];

const emptyForm = {
  nome: '', cidade: 'Londrina', tipo: 'Elevador', endereco: '',
  lat: '', lng: '', horario: '06:00 às 22:00', fluxo: '',
  insercoes: '', tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
  publico: 'A/B', telas: '1', preco: '', descricao: '', imagem: '',
  simulacao_tela: '', simulacao_arte: '', simulacao_preview: ''
};

const defaultScreen = {
  x: 20,
  y: 25,
  width: 45,
  height: 35,
  opacity: 0.92
};

function parseScreen(raw) {
  if (!raw) return { ...defaultScreen };
  try {
    return normalizeScreenConfig(JSON.parse(raw));
  } catch {
    return { ...defaultScreen };
  }
}

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
  const [simulationArtFile, setSimulationArtFile] = useState(null);
  const [simulationPreviewFile, setSimulationPreviewFile] = useState(null);
  const [simulationPreviewUrl, setSimulationPreviewUrl] = useState('');
  const [baseImagePreviewUrl, setBaseImagePreviewUrl] = useState('');
  const [screen, setScreen] = useState(defaultScreen);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [simulationError, setSimulationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

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
    setSimulationArtFile(null);
    setSimulationPreviewFile(null);
    setSimulationPreviewUrl('');
    setSimulationError('');
    setScreen({ ...defaultScreen });
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
      simulacao_preview: ponto.simulacao_preview || ''
    });
    setImageFile(null);
    setSimulationArtFile(null);
    setSimulationPreviewFile(null);
    setSimulationPreviewUrl(ponto.simulacao_preview || '');
    setSimulationError('');
    setScreen(parseScreen(ponto.simulacao_tela));
    setEditing(ponto);
  };

  const handleGenerateSimulation = async () => {
    setSimulationError('');
    if (!simulationArtFile) {
      setSimulationError('Selecione uma arte para gerar a simulação.');
      return;
    }

    const baseImageUrl = baseImagePreviewUrl || form.imagem || '';

    if (!baseImageUrl) {
      setSimulationError('Selecione a imagem base do ponto antes da simulação.');
      return;
    }

    const creativeUrl = URL.createObjectURL(simulationArtFile);
    setSimulationBusy(true);

    try {
      const result = await generateSimulationPreview({
        baseImageUrl,
        creativeImageUrl: creativeUrl,
        screen
      });

      const fileName = `simulacao-${Date.now()}.png`;
      const previewFile = new File([result.blob], fileName, { type: 'image/png' });
      setSimulationPreviewFile(previewFile);

      if (simulationPreviewUrl && simulationPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(simulationPreviewUrl);
      }
      setSimulationPreviewUrl(result.previewUrl);

      setForm((prev) => ({
        ...prev,
        simulacao_tela: JSON.stringify(result.screen)
      }));
    } catch (err) {
      setSimulationError(err.message || 'Falha ao gerar simulação.');
    } finally {
      URL.revokeObjectURL(creativeUrl);
      setSimulationBusy(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      const payload = {
        ...form,
        simulacao_tela: JSON.stringify(normalizeScreenConfig(screen))
      };
      Object.entries(payload).forEach(([k, v]) => fd.append(k, v ?? ''));
      if (imageFile) fd.append('imagem', imageFile);
      if (simulationArtFile) fd.append('simulacao_arte', simulationArtFile);
      if (simulationPreviewFile) fd.append('simulacao_preview', simulationPreviewFile);

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

  const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const filtered = pontos.filter(p =>
    !search || p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.cidade.toLowerCase().includes(search.toLowerCase())
  );

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
                  <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs">Preço</th>
                  <th className="text-left px-4 py-3 text-brand-gray-400 font-medium text-xs hidden lg:table-cell">Status</th>
                  <th className="text-right px-4 py-3 text-brand-gray-400 font-medium text-xs">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-brand-gray-500">Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-brand-gray-500">Nenhum ponto encontrado</td></tr>
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
                      Marque a área da tela, escolha a arte e gere o preview que entra na proposta comercial.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <FormField label="Tela X (%)" value={screen.x} onChange={(v) => setScreen((s) => normalizeScreenConfig({ ...s, x: Number(v) }))} type="number" min="0" max="95" step="1" />
                    <FormField label="Tela Y (%)" value={screen.y} onChange={(v) => setScreen((s) => normalizeScreenConfig({ ...s, y: Number(v) }))} type="number" min="0" max="95" step="1" />
                    <FormField label="Largura (%)" value={screen.width} onChange={(v) => setScreen((s) => normalizeScreenConfig({ ...s, width: Number(v) }))} type="number" min="3" max="100" step="1" />
                    <FormField label="Altura (%)" value={screen.height} onChange={(v) => setScreen((s) => normalizeScreenConfig({ ...s, height: Number(v) }))} type="number" min="3" max="100" step="1" />
                    <FormField label="Opacidade" value={screen.opacity} onChange={(v) => setScreen((s) => normalizeScreenConfig({ ...s, opacity: Number(v) }))} type="number" min="0.35" max="1" step="0.05" />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-brand-gray-300 hover:bg-white/10 cursor-pointer transition-colors">
                      <Upload size={16} />
                      {simulationArtFile ? simulationArtFile.name : 'Escolher arte da simulação'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => setSimulationArtFile(e.target.files[0] || null)}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleGenerateSimulation}
                      disabled={simulationBusy}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 text-sm font-medium"
                    >
                      {simulationBusy ? 'Gerando simulação...' : 'Gerar simulação'}
                    </button>
                  </div>

                  {simulationError && (
                    <p className="text-xs text-red-400">{simulationError}</p>
                  )}

                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                      <p className="text-[11px] text-brand-gray-500 px-1 pb-2">Imagem base do ponto</p>
                      {form.imagem || baseImagePreviewUrl ? (
                        <img
                          src={baseImagePreviewUrl || form.imagem}
                          alt="Base do ponto"
                          className="w-full h-44 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="h-44 rounded-lg border border-dashed border-white/15 flex items-center justify-center text-xs text-brand-gray-500">
                          Sem imagem base
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                      <p className="text-[11px] text-brand-gray-500 px-1 pb-2">Preview da simulação</p>
                      {simulationPreviewUrl ? (
                        <img
                          src={simulationPreviewUrl}
                          alt="Simulação"
                          className="w-full h-44 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="h-44 rounded-lg border border-dashed border-white/15 flex items-center justify-center text-xs text-brand-gray-500">
                          Gere uma simulação para visualizar
                        </div>
                      )}
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

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem para simulacao'));
    img.src = url;
  });
}

function drawCreativeCover(ctx, creative, targetX, targetY, targetW, targetH) {
  const imgAspect = creative.width / creative.height;
  const targetAspect = targetW / targetH;

  let srcX = 0;
  let srcY = 0;
  let srcW = creative.width;
  let srcH = creative.height;

  if (imgAspect > targetAspect) {
    srcW = Math.round(creative.height * targetAspect);
    srcX = Math.round((creative.width - srcW) / 2);
  } else {
    srcH = Math.round(creative.width / targetAspect);
    srcY = Math.round((creative.height - srcH) / 2);
  }

  ctx.drawImage(creative, srcX, srcY, srcW, srcH, targetX, targetY, targetW, targetH);
}

function normalizeScreenConfig(input) {
  const min = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const x = Math.min(95, Math.max(0, min(input?.x, 20)));
  const y = Math.min(95, Math.max(0, min(input?.y, 25)));
  const width = Math.min(100 - x, Math.max(3, min(input?.width, 45)));
  const height = Math.min(100 - y, Math.max(3, min(input?.height, 35)));
  const opacity = Math.min(1, Math.max(0.35, min(input?.opacity, 0.92)));

  return { x, y, width, height, opacity };
}

async function generateSimulationPreview({
  baseImageUrl,
  creativeImageUrl,
  screen,
  maxWidth = 1800
}) {
  const normalized = normalizeScreenConfig(screen);
  const [base, creative] = await Promise.all([
    loadImage(baseImageUrl),
    loadImage(creativeImageUrl)
  ]);

  const scale = base.width > maxWidth ? (maxWidth / base.width) : 1;
  const outW = Math.max(1, Math.round(base.width * scale));
  const outH = Math.max(1, Math.round(base.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponivel para simulacao');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, 0, 0, outW, outH);

  const x = Math.round((normalized.x / 100) * outW);
  const y = Math.round((normalized.y / 100) * outH);
  const w = Math.max(1, Math.round((normalized.width / 100) * outW));
  const h = Math.max(1, Math.round((normalized.height / 100) * outH));

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = normalized.opacity;
  drawCreativeCover(ctx, creative, x, y, w, h);

  const glow = ctx.createLinearGradient(x, y, x, y + h);
  glow.addColorStop(0, 'rgba(255,255,255,0.10)');
  glow.addColorStop(0.35, 'rgba(255,255,255,0.02)');
  glow.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = Math.max(1, Math.round(Math.min(outW, outH) * 0.0015));
  ctx.strokeRect(x, y, w, h);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error('Falha ao exportar imagem da simulacao'));
        return;
      }
      resolve(value);
    }, 'image/png', 0.92);
  });

  const previewUrl = URL.createObjectURL(blob);
  return { blob, previewUrl, screen: normalized };
}
