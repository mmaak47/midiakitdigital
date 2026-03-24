import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn, Plus, Pencil, Trash2, Eye, EyeOff, X, Upload,
  Building2, Save
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { login, fetchAdminPontos, createPonto, updatePonto, deletePonto } from '../lib/api';
import ScreenAreaEditor from '../components/admin/ScreenAreaEditor';
import { parseScreen, serializeSimulationConfig } from '../lib/simulation';

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
    setScreenSelection(null);
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
    setScreenSelection(parseScreen(ponto.simulacao_tela));
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
