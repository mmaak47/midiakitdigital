import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn, Plus, Pencil, Trash2, Eye, EyeOff, X, Upload,
  Building2, Save, Loader2, RefreshCcw, Users, MapPinned, PanelsTopLeft, UserPlus, Settings,
  Copy, Check, MapPin
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
  requestEntornoAnalysis,
  fetchAdminUsers,
  createAdminUser,
  deleteAdminUser,
  updateAdminUserRole,
  fetchAdminSettings,
  fetchAdminPdfCache,
  invalidateAdminPdfCache,
  updateAdminSettings,
  geocodePoint
} from '../lib/api';
import ScreenAreaEditor from '../components/admin/ScreenAreaEditor';
import FocalPointSelector from '../components/admin/FocalPointSelector';
import UserModal from '../components/admin/UserModal';
import { defaultScreenStyle, parseSimulationConfig, parseScreen, serializeSimulationConfig } from '../lib/simulation';

const DEFAULT_CIDADES = ['Londrina', 'Maringá', 'Balneário Camboriú', 'Itajaí'];
const DEFAULT_TIPOS = ['Elevador', 'Tela Indoor', 'Painel LED', 'Backlight', 'Frontlight', 'Totem Digital', 'Circuito Muffato', 'LED Posto', 'Video Wall'];
const ELEVADOR_TIPO = 'Elevador';
const ELEVADOR_CATEGORIAS = ['Comercial', 'Residencial'];
const ELEVADOR_ARTE_LARGURA = '1080';
const ELEVADOR_ARTE_ALTURA = '1920';
const PUBLICOS = ['A', 'B', 'A/B'];
const ENTORNO_SEGMENTOS = [
  'clinica', 'hospital', 'educacao', 'escola', 'faculdade',
  'automotivo', 'varejo', 'restaurante', 'imobiliaria',
  'construtora', 'contabilidade', 'advocacia', 'industria', 'outro'
];
const USER_ROLES = [
  { value: 'admin', label: 'Admin (acesso total)' },
  { value: 'gerente_comercial', label: 'Gerente Comercial (aprova propostas)' },
  { value: 'vendedor', label: 'Vendedor (criar propostas)' }
];

const ADMIN_TABS = [
  { key: 'pontos', label: 'Pontos', icon: PanelsTopLeft },
  { key: 'entorno', label: 'Análise de entorno', icon: MapPinned },
  { key: 'usuarios', label: 'Usuários', icon: Users },
  { key: 'configuracoes', label: 'Configurações', icon: Settings }
];

const emptyForm = {
  nome: '', cidade: 'Londrina', tipo: 'Elevador', endereco: '',
  lat: '', lng: '', horario: '06:00 às 22:00', fluxo: '',
  insercoes: '', tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
  publico: 'A/B', telas: '1', preco: '', descricao: '', imagem: '', imagem2: '',
  simulacao_tela: '', simulacao_arte: '', simulacao_preview: '',
  arte_largura: ELEVADOR_ARTE_LARGURA, arte_altura: ELEVADOR_ARTE_ALTURA,
  elevador_categoria: 'Comercial',
  custo_operacional: '', tipo_fluxo: 'pessoas',
  imagem_foco_x: '50', imagem_foco_y: '50', imagem_foco_zoom: '100',
  foto_focal_point: 'center center',
  pdf_image_source: 'imagem2'
};

function enforceElevadorDimensions(nextForm) {
  if (nextForm?.tipo !== ELEVADOR_TIPO) {
    return {
      ...nextForm,
      elevador_categoria: ''
    };
  }
  return {
    ...nextForm,
    arte_largura: ELEVADOR_ARTE_LARGURA,
    arte_altura: ELEVADOR_ARTE_ALTURA,
    elevador_categoria: ELEVADOR_CATEGORIAS.includes(nextForm?.elevador_categoria)
      ? nextForm.elevador_categoria
      : 'Comercial'
  };
}

export default function Admin() {
  const location = useLocation();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('intermidia_theme') !== 'light';
  });
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
  const [imagem2File, setImagem2File] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [baseImagePreviewUrl, setBaseImagePreviewUrl] = useState('');
  const [secondImagePreviewUrl, setSecondImagePreviewUrl] = useState('');
  const [screenSelection, setScreenSelection] = useState(null);
  const [screenStyle, setScreenStyle] = useState(defaultScreenStyle);
  const [screenSelection2, setScreenSelection2] = useState(null);
  const [screenStyle2, setScreenStyle2] = useState(defaultScreenStyle);
  const [simulationFaceCount, setSimulationFaceCount] = useState(1);
  const [activeSimulationFace, setActiveSimulationFace] = useState(0);
  const [saving, setSaving] = useState(false);
  const [focusDragging, setFocusDragging] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCidade, setFilterCidade] = useState('todas');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [activeTab, setActiveTab] = useState('pontos');

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userModalInitialData, setUserModalInitialData] = useState(null);
  const [savingUser, setSavingUser] = useState(false);

  const [settings, setSettings] = useState({ lucro_minimo_percentual: 15 });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [lucroMinimoValue, setLucroMinimoValue] = useState(15);
  const [savingSettings, setSavingSettings] = useState(false);
  const [pdfCacheRows, setPdfCacheRows] = useState([]);
  const [pdfCacheLoading, setPdfCacheLoading] = useState(false);
  const [pdfCacheError, setPdfCacheError] = useState('');
  const [invalidatingCacheId, setInvalidatingCacheId] = useState(null);

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
  const [promptCopied, setPromptCopied] = useState(false);

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
    if (!imagem2File) {
      setSecondImagePreviewUrl('');
      return;
    }
    const blobUrl = URL.createObjectURL(imagem2File);
    setSecondImagePreviewUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [imagem2File]);

  useEffect(() => {
    if (!auth || activeTab !== 'entorno') return;

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
  }, [auth, activeTab]);

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

  useEffect(() => {
    if (activeTab === 'configuracoes' && auth) {
      loadSettings();
      loadPdfCache();
    }
  }, [activeTab, auth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('intermidia_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const data = await login(username, password);
      sessionStorage.setItem('admin_token', data.token);
      if (location.pathname === '/comercial') {
        sessionStorage.setItem('comercial_manual_login', '1');
      } else {
        sessionStorage.removeItem('comercial_manual_login');
      }
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

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const data = await fetchAdminUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setUsersError(err.message || 'Falha ao carregar usuários');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (auth) {
      loadPontos();
      loadUsers();
    }
  }, [auth]);

  const openNew = () => {
    setForm(enforceElevadorDimensions(emptyForm));
    setImageFile(null);
    setImagem2File(null);
    setGeoLoading(false);
    setGeoError('');
    setScreenSelection(null);
  };

  const openEdit = (ponto) => {
    setForm(enforceElevadorDimensions({
      nome: ponto.nome || '',
      cidade: ponto.cidade || 'Londrina',
      tipo: ponto.tipo || ELEVADOR_TIPO,
      elevador_categoria: ponto.elevador_categoria || 'Comercial',
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
      imagem2: ponto.imagem2 || '',
      simulacao_tela: ponto.simulacao_tela || '',
      simulacao_arte: ponto.simulacao_arte || '',
      simulacao_preview: ponto.simulacao_preview || '',
      arte_largura: ponto.arte_largura?.toString() || '1920',
      arte_altura: ponto.arte_altura?.toString() || '1080',
      custo_operacional: ponto.custo_operacional?.toString() || '',
      tipo_fluxo: ponto.tipo_fluxo || 'pessoas',
      imagem_foco_x: (Number.isFinite(Number(ponto.imagem_foco_x)) ? Number(ponto.imagem_foco_x) : 50).toString(),
      imagem_foco_y: (Number.isFinite(Number(ponto.imagem_foco_y)) ? Number(ponto.imagem_foco_y) : 50).toString(),
      imagem_foco_zoom: (Number.isFinite(Number(ponto.imagem_foco_zoom)) ? Number(ponto.imagem_foco_zoom) : 100).toString(),
      foto_focal_point: ponto.foto_focal_point || 'center center',
      pdf_image_source: ponto.pdf_image_source || 'imagem2'
    }));
    setImageFile(null);
    setImagem2File(null);
    setGeoLoading(false);
    setGeoError('');
    const screenConfig = parseSimulationConfig(ponto.simulacao_tela);
    const parsedFaces = Array.isArray(screenConfig?.faces) && screenConfig.faces.length
      ? screenConfig.faces
      : (screenConfig?.corners ? [{ corners: screenConfig.corners, style: screenConfig.style }] : []);
    const face1 = parsedFaces[0];
    const face2 = parsedFaces[1];
    setScreenSelection(face1?.corners || parseScreen(ponto.simulacao_tela));
    setScreenStyle(face1?.style || defaultScreenStyle);
    setScreenSelection2(face2?.corners || null);
    setScreenStyle2(face2?.style || defaultScreenStyle);
    setSimulationFaceCount(face2?.corners ? 2 : 1);
    setActiveSimulationFace(0);
    setEditing(ponto);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      const simulationFaces = [
        { corners: screenSelection, style: screenStyle },
        ...(simulationFaceCount === 2 && screenSelection2 ? [{ corners: screenSelection2, style: screenStyle2 }] : [])
      ].filter((face) => face?.corners);
      const payload = {
        ...form,
        simulacao_tela: serializeSimulationConfig({
          faces: simulationFaces,
          activeFaceIndex: activeSimulationFace
        })
      };
      Object.entries(payload).forEach(([k, v]) => fd.append(k, v ?? ''));
      if (imageFile) fd.append('imagem', imageFile);
      if (imagem2File) fd.append('imagem2', imagem2File);

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

  const splitName = (fullName, login) => {
    const normalized = String(fullName || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return { firstName: login, lastName: '-' };
    const parts = normalized.split(' ');
    if (parts.length === 1) return { firstName: parts[0], lastName: login || '-' };
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ') || (login || '-')
    };
  };

  const handleSaveUser = async (formData) => {
    setSavingUser(true);
    setUsersError('');
    try {
      if (userModalInitialData?.id) {
        await updateAdminUserRole(userModalInitialData.id, formData.tipoUsuario || 'vendedor');
      } else {
        const parsed = splitName(formData.nome, formData.login);
        const normalizedEmail = String(formData.email || '').trim() || `${String(formData.login || '').trim()}@intermidia.local`;
        await createAdminUser({
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          whatsapp: '',
          email: normalizedEmail,
          password: String(formData.senha || '').trim(),
          role: formData.tipoUsuario || 'vendedor'
        });
      }
      await loadUsers();
      setUserModalOpen(false);
      setUserModalInitialData(null);
    } catch (err) {
      setUsersError(err.message || 'Falha ao criar usuário');
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (id, usernameValue) => {
    if (!confirm(`Deseja remover o usuário ${usernameValue}?`)) return;
    setUsersError('');
    try {
      await deleteAdminUser(id);
      await loadUsers();
    } catch (err) {
      setUsersError(err.message || 'Falha ao remover usuário');
    }
  };

  const handleOpenNewUserModal = () => {
    setUserModalInitialData(null);
    setUserModalOpen(true);
  };

  const handleOpenEditUserModal = (user) => {
    setUserModalInitialData(user);
    setUserModalOpen(true);
  };

  const loadSettings = async () => {
    setSettingsLoading(true);
    setSettingsError('');
    try {
      const data = await fetchAdminSettings();
      setSettings(data);
      setLucroMinimoValue(data.lucro_minimo_percentual || 15);
    } catch (err) {
      setSettingsError(err.message || 'Falha ao carregar configurações');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError('');
    try {
      await updateAdminSettings({ lucro_minimo_percentual: Number(lucroMinimoValue) });
      await loadSettings();
    } catch (err) {
      setSettingsError(err.message || 'Falha ao salvar configurações');
    } finally {
      setSavingSettings(false);
    }
  };

  const loadPdfCache = async () => {
    setPdfCacheLoading(true);
    setPdfCacheError('');
    try {
      const rows = await fetchAdminPdfCache();
      setPdfCacheRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setPdfCacheRows([]);
      setPdfCacheError(err.message || 'Falha ao carregar cache de PDFs');
    } finally {
      setPdfCacheLoading(false);
    }
  };

  const handleInvalidatePdfCache = async (id) => {
    setInvalidatingCacheId(id);
    setPdfCacheError('');
    try {
      await invalidateAdminPdfCache(id);
      await loadPdfCache();
    } catch (err) {
      setPdfCacheError(err.message || 'Falha ao invalidar cache');
    } finally {
      setInvalidatingCacheId(null);
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

  const updateField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      return enforceElevadorDimensions(next);
    });
  };

  const filtered = pontos.filter((p) => {
    const searchTerm = search.trim().toLowerCase();
    const matchSearch = !searchTerm
      || p.nome.toLowerCase().includes(searchTerm)
      || p.cidade.toLowerCase().includes(searchTerm);
    const matchCidade = filterCidade === 'todas' || p.cidade === filterCidade;
    const matchTipo = filterTipo === 'todos' || p.tipo === filterTipo;
    return matchSearch && matchCidade && matchTipo;
  });

  const artWidth = parseInt(form.arte_largura, 10) || 0;
  const artHeight = parseInt(form.arte_altura, 10) || 0;
  const artRatioText = formatRatio(artWidth, artHeight);
  const previewFocoX = clampNumber(form.imagem_foco_x, 0, 100, 50);
  const previewFocoY = clampNumber(form.imagem_foco_y, 0, 100, 50);
  const previewFocoZoom = clampNumber(form.imagem_foco_zoom, 100, 220, 100);
  const imagePreviewForFocus = baseImagePreviewUrl || form.imagem;
  const hasBothImagesForPdf = Boolean(baseImagePreviewUrl || form.imagem) && Boolean(secondImagePreviewUrl || form.imagem2);
  const selectedPdfPreviewImage = (form.pdf_image_source === 'imagem2'
    ? (secondImagePreviewUrl || form.imagem2 || baseImagePreviewUrl || form.imagem || '')
    : (baseImagePreviewUrl || form.imagem || secondImagePreviewUrl || form.imagem2 || ''));
  const simulationSuggestedFocus = useMemo(() => deriveFocusFromSimulationString(form.simulacao_tela), [form.simulacao_tela]);
  const activeScreenSelection = activeSimulationFace === 1 ? screenSelection2 : screenSelection;
  const activeScreenStyle = activeSimulationFace === 1 ? screenStyle2 : screenStyle;
  const setActiveScreenSelection = activeSimulationFace === 1 ? setScreenSelection2 : setScreenSelection;
  const setActiveScreenStyle = activeSimulationFace === 1 ? setScreenStyle2 : setScreenStyle;

  const autoArtPrompt = useMemo(() => {
    if (!artWidth || !artHeight || !form.nome) return '';
    const ratio = artRatioText || `${artWidth}x${artHeight}`;
    return `Crie uma arte visual atraente com dimensões ${artWidth}x${artHeight}px (proporção ${ratio}) para ${form.tipo} localizado em ${form.cidade}. Ponto: "${form.nome}". ${form.descricao ? `Contexto: ${form.descricao}` : ''}. A arte deve chamar atenção e ser compatível com mídia digital outdoor.`;
  }, [artWidth, artHeight, artRatioText, form.nome, form.tipo, form.cidade, form.descricao]);

  const handleCopyPrompt = async () => {
    if (!autoArtPrompt) return;
    try {
      // Try modern API first
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(autoArtPrompt);
      } else {
        // Fallback for environments without clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = autoArtPrompt;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  const updateImageFocusFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clampNumber(((event.clientX - rect.left) / rect.width) * 100, 0, 100, 50);
    const y = clampNumber(((event.clientY - rect.top) / rect.height) * 100, 0, 100, 50);
    updateField('imagem_foco_x', String(Math.round(x)));
    updateField('imagem_foco_y', String(Math.round(y)));
  };

  // Login screen
  if (!auth) {
    return (
      <div
        className={`min-h-screen ${isDark ? 'bg-black text-white' : 'commercial-light bg-[#f4f5f7] text-neutral-900'}`}
        data-theme={isDark ? 'dark' : 'light'}
      >
        <Navbar commercial isDark={isDark} onToggleTheme={() => setIsDark((prev) => !prev)} />
        <div className="flex min-h-screen items-center justify-center px-6 pt-24 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className={`w-full max-w-md rounded-3xl border p-8 backdrop-blur ${isDark ? 'border-white/10 bg-white/[0.03] shadow-2xl shadow-black/30' : 'border-neutral-200 bg-white shadow-xl shadow-neutral-200/70'}`}
          >
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-orange/15 text-brand-orange">
                <LogIn size={20} />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Acesso administrativo</h1>
                <p className="text-sm text-brand-gray-400">Entre para gerenciar pontos, análises e usuários.</p>
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleLogin}>
              <div>
                <label className="mb-1.5 block text-xs text-brand-gray-400">Usuário ou e-mail</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40 transition-colors"
                  placeholder="admin ou email@empresa.com"
                  required
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-brand-gray-400">Senha</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40 transition-colors"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-500 transition-colors hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {loginError ? <p className="text-xs text-red-400">{loginError}</p> : null}

              <button
                type="submit"
                className="w-full rounded-xl bg-brand-orange py-3 font-semibold text-white transition-all duration-200 hover:scale-[1.01] hover:bg-brand-orange-hover active:scale-[0.99]"
              >
                Entrar
              </button>
            </form>
          </motion.div>
        </div>
        <footer className={`px-6 pb-6 text-center text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
          <span className="inline-flex items-center gap-1.5">
            <span>Desenvolvido por</span>
            <span className="font-semibold text-brand-orange animate-pulse">Maitê Doin</span>
          </span>
        </footer>
      </div>
    );
  }

  // Admin panel
  return (
    <div
      className={`min-h-screen ${isDark ? 'bg-black text-white' : 'commercial-light bg-[#f4f5f7] text-neutral-900'}`}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <Navbar commercial isDark={isDark} onToggleTheme={() => setIsDark((prev) => !prev)} />
      <div className="pt-20 max-w-7xl mx-auto px-6 pb-12">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Painel Administrativo</h1>
            <p className="text-sm text-brand-gray-500 mt-1">Pontos, entorno, calibração de PDF e usuários em menus separados.</p>
          </div>
          {activeTab === 'pontos' ? (
            <button
              onClick={openNew}
              className="orange-solid-btn flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-sm"
            >
              <Plus size={16} />
              Novo ponto
            </button>
          ) : null}
        </div>

        <div className="mb-6">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-2">
            {ADMIN_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${active ? 'bg-brand-orange text-white' : 'text-brand-gray-300 hover:bg-white/10 hover:text-white'}`}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'pontos' ? (
          <>
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome ou cidade..."
                className="w-full lg:max-w-md px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-brand-gray-500 focus:outline-none focus:border-brand-orange/40 transition-colors"
              />

              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <select
                  value={filterCidade}
                  onChange={(e) => setFilterCidade(e.target.value)}
                  className="w-full sm:w-52 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-brand-orange/40 transition-colors"
                >
                  <option value="todas" className="bg-brand-dark text-white">Todas as cidades</option>
                  {cidades.map((cidade) => (
                    <option key={cidade} value={cidade} className="bg-brand-dark text-white">
                      {cidade}
                    </option>
                  ))}
                </select>

                <select
                  value={filterTipo}
                  onChange={(e) => setFilterTipo(e.target.value)}
                  className="w-full sm:w-52 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-brand-orange/40 transition-colors"
                >
                  <option value="todos" className="bg-brand-dark text-white">Todos os tipos</option>
                  {tipos.map((tipo) => (
                    <option key={tipo} value={tipo} className="bg-brand-dark text-white">
                      {tipo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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
                    ) : filtered.map((p) => (
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
                        <td className="px-4 py-3 text-brand-gray-400 hidden md:table-cell">
                          {p.tipo}{p.tipo === ELEVADOR_TIPO && p.elevador_categoria ? ` - ${p.elevador_categoria}` : ''}
                        </td>
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
          </>
        ) : null}

        {activeTab === 'entorno' ? (
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
        ) : null}

        {activeTab === 'usuarios' ? (
          <UsersAdminPanel
            users={users}
            loading={usersLoading}
            error={usersError}
            onOpenNew={handleOpenNewUserModal}
            onOpenEdit={handleOpenEditUserModal}
            onDelete={handleDeleteUser}
            userRoles={USER_ROLES}
            onReload={loadUsers}
          />
        ) : null}

        {activeTab === 'configuracoes' ? (
          <div className="space-y-5">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Configurações do sistema</h3>
                <p className="text-xs text-brand-gray-500 mt-1">Configure parâmetros globais para propostas e vendas.</p>
              </div>

              {settingsError && <p className="mt-3 text-xs text-red-300">{settingsError}</p>}

              <form onSubmit={handleSaveSettings} className="mt-6 space-y-4 max-w-md">
                <div>
                  <label className="block text-xs text-brand-gray-400 mb-2">
                    Lucro Mínimo Obrigatório (%)
                  </label>
                  <p className="text-xs text-brand-gray-500 mb-2">
                    Vendedores precisarão de aprovação do Gerente Comercial se aplicarem desconto acima desse percentual.
                  </p>
                  <div className="flex items-end gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={lucroMinimoValue}
                      onChange={e => setLucroMinimoValue(Number(e.target.value))}
                      className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={savingSettings || settingsLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-orange/40 bg-brand-orange/15 px-4 py-2.5 text-sm font-semibold text-brand-orange hover:bg-brand-orange/25 disabled:opacity-50"
                    >
                      <Save size={15} />
                      {savingSettings ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </form>

              <div className="mt-6 p-4 bg-brand-orange/5 border border-brand-orange/20 rounded-xl">
                <p className="text-xs text-brand-orange leading-relaxed">
                  <strong>ℹ️ Como funciona:</strong> Quando um vendedor tenta criar uma proposta com desconto que ultrapassa o lucro mínimo obrigatório (desconto acima do valor configurado aqui), a proposta fica aguardando aprovação de um Gerente Comercial antes de poder ser finalizada.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Cache de PDFs</h3>
                  <p className="text-xs text-brand-gray-500 mt-1">Controle de combinações de cidades e validade dos PDFs em cache.</p>
                </div>
                <button
                  type="button"
                  onClick={loadPdfCache}
                  disabled={pdfCacheLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-50"
                >
                  <RefreshCcw size={14} className={pdfCacheLoading ? 'animate-spin' : ''} />
                  Atualizar
                </button>
              </div>

              {pdfCacheError ? <p className="mt-3 text-xs text-red-300">{pdfCacheError}</p> : null}

              <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.04] text-brand-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Combinação</th>
                      <th className="px-3 py-2 text-left font-medium">Cidades</th>
                      <th className="px-3 py-2 text-left font-medium">Tamanho</th>
                      <th className="px-3 py-2 text-left font-medium">Gerado em</th>
                      <th className="px-3 py-2 text-left font-medium">Downloads</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pdfCacheLoading ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-brand-gray-500">Carregando cache...</td>
                      </tr>
                    ) : !pdfCacheRows.length ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-brand-gray-500">Nenhum PDF em cache.</td>
                      </tr>
                    ) : (
                      pdfCacheRows.map((row) => {
                        const valid = Number(row.is_valid) === 1;
                        return (
                          <tr key={row.id} className="border-t border-white/10 text-white/90">
                            <td className="px-3 py-2 font-mono text-xs">{row.combination_key}</td>
                            <td className="px-3 py-2 text-xs text-brand-gray-300">{formatCityList(row.city_slugs)}</td>
                            <td className="px-3 py-2 text-xs">{formatCacheSize(row.file_size_kb)}</td>
                            <td className="px-3 py-2 text-xs">{formatDateBr(row.generated_at)}</td>
                            <td className="px-3 py-2 text-xs">{Number(row.download_count || 0)}</td>
                            <td className="px-3 py-2 text-xs">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 ${valid ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-white/15 bg-white/5 text-brand-gray-400'}`}>
                                {valid ? 'Valido' : 'Invalido'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {valid ? (
                                <button
                                  type="button"
                                  onClick={() => handleInvalidatePdfCache(row.id)}
                                  disabled={invalidatingCacheId === row.id}
                                  className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-white hover:bg-white/10 disabled:opacity-50"
                                >
                                  {invalidatingCacheId === row.id ? 'Invalidando...' : 'Invalidar'}
                                </button>
                              ) : (
                                <span className="text-brand-gray-500">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <UserModal
        isOpen={userModalOpen}
        onClose={() => {
          if (savingUser) return;
          setUserModalOpen(false);
          setUserModalInitialData(null);
        }}
        onSave={handleSaveUser}
        initialData={userModalInitialData}
      />

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
                  {form.tipo === ELEVADOR_TIPO ? (
                    <FormSelect label="Categoria do Elevador" value={form.elevador_categoria || 'Comercial'} onChange={v => updateField('elevador_categoria', v)} options={ELEVADOR_CATEGORIAS} />
                  ) : null}
                  <FormSelect label="Público" value={form.publico} onChange={v => updateField('publico', v)} options={PUBLICOS} />
                  <FormSelect label="Tipo de fluxo" value={form.tipo_fluxo} onChange={v => updateField('tipo_fluxo', v)} options={['pessoas', 'veiculos']} />
                  <div className="md:col-span-2">
                    <label className="block text-xs text-brand-gray-400 mb-1.5">Endereço</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.endereco}
                        onChange={e => updateField('endereco', e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-purple/50"
                        placeholder="Ex: Av. Higienópolis, 1234, Londrina"
                      />
                      <button
                        type="button"
                        disabled={!form.endereco.trim() || geoLoading}
                        onClick={async () => {
                          setGeoLoading(true);
                          setGeoError('');
                          try {
                            const { lat, lng } = await geocodePoint(form.endereco);
                            updateField('lat', String(lat));
                            updateField('lng', String(lng));
                          } catch (err) {
                            setGeoError(err.message);
                          } finally {
                            setGeoLoading(false);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2.5 bg-brand-purple/80 hover:bg-brand-purple disabled:opacity-40 text-white text-xs rounded-xl transition-colors shrink-0"
                      >
                        {geoLoading ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                        Localizar
                      </button>
                    </div>
                    {geoError && <p className="text-xs text-red-400 mt-1">{geoError}</p>}
                  </div>
                  <FormField label="Latitude" value={form.lat} onChange={v => updateField('lat', v)} type="number" step="any" />
                  <FormField label="Longitude" value={form.lng} onChange={v => updateField('lng', v)} type="number" step="any" />
                  <FormField label="Horário" value={form.horario} onChange={v => updateField('horario', v)} />
                  <FormField label="Fluxo mensal" value={form.fluxo} onChange={v => updateField('fluxo', v)} type="number" />
                  <FormField label="Inserções mensais" value={form.insercoes} onChange={v => updateField('insercoes', v)} type="number" />
                  <FormField label="Tempo" value={form.tempo} onChange={v => updateField('tempo', v)} />
                  <FormField label="Looping" value={form.loop} onChange={v => updateField('loop', v)} />
                  <FormField label="Veiculação" value={form.veiculacao} onChange={v => updateField('veiculacao', v)} />
                  <FormField label="Telas" value={form.telas} onChange={v => updateField('telas', v)} type="number" />
                  <FormField label="Preço (R$)" value={form.preco} onChange={v => updateField('preco', v)} type="number" step="0.01" />
                  <FormField label="Custo Operacional (R$)" value={form.custo_operacional} onChange={v => updateField('custo_operacional', v)} type="number" step="0.01" />
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
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
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

                {/* Imagem 2 upload (Elevador — segunda foto) */}
                <div>
                  <label className="block text-xs text-brand-gray-400 mb-1.5">Imagem 2 <span className="text-brand-gray-600">(opcional — segunda foto para Elevador)</span></label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-brand-gray-300 hover:bg-white/10 cursor-pointer transition-colors">
                      <Upload size={16} />
                      {imagem2File ? imagem2File.name : 'Upload de 2ª imagem'}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={e => setImagem2File(e.target.files[0] || null)}
                        className="hidden"
                      />
                    </label>
                    {(form.imagem2 || imagem2File) && (
                      <span className="text-xs text-brand-gray-500">
                        {imagem2File ? 'Nova imagem selecionada' : 'Imagem existente'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/95 p-3">
                  {hasBothImagesForPdf ? (
                    <div className="mb-3">
                      <label className="mb-2 block text-sm font-medium text-gray-700">Imagem usada no PDF</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateField('pdf_image_source', 'imagem')}
                          className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${form.pdf_image_source === 'imagem' ? 'border-[#E8591A] bg-[#E8591A] text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                        >
                          Imagem 1
                        </button>
                        <button
                          type="button"
                          onClick={() => updateField('pdf_image_source', 'imagem2')}
                          className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${form.pdf_image_source === 'imagem2' ? 'border-[#E8591A] bg-[#E8591A] text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                        >
                          Imagem 2
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mb-3 text-xs text-gray-500">A seleção da imagem do PDF aparece quando as duas imagens estiverem preenchidas.</p>
                  )}

                  <FocalPointSelector
                    value={form.foto_focal_point || 'center center'}
                    onChange={(next) => updateField('foto_focal_point', next)}
                    imageUrl={selectedPdfPreviewImage}
                  />
                </div>

                <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Simulação do ponto</h3>
                    <p className="text-xs text-brand-gray-500 mt-1">
                      Defina aqui apenas a área útil da tela. A arte da campanha será enviada no modal de proposta.
                    </p>
                  </div>

                  {form.imagem || baseImagePreviewUrl ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray-300">Faces do painel na simulação</p>
                          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSimulationFaceCount(1);
                                setActiveSimulationFace(0);
                              }}
                              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${simulationFaceCount === 1 ? 'bg-brand-orange text-white' : 'text-brand-gray-300 hover:bg-white/10 hover:text-white'}`}
                            >
                              1 face
                            </button>
                            <button
                              type="button"
                              onClick={() => setSimulationFaceCount(2)}
                              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${simulationFaceCount === 2 ? 'bg-brand-orange text-white' : 'text-brand-gray-300 hover:bg-white/10 hover:text-white'}`}
                            >
                              2 faces
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveSimulationFace(0)}
                            className={`rounded-lg border px-3 py-2 text-xs transition-colors ${activeSimulationFace === 0 ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}`}
                          >
                            Face 1
                          </button>
                          {simulationFaceCount === 2 ? (
                            <button
                              type="button"
                              onClick={() => setActiveSimulationFace(1)}
                              className={`rounded-lg border px-3 py-2 text-xs transition-colors ${activeSimulationFace === 1 ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}`}
                            >
                              Face 2
                            </button>
                          ) : null}
                        </div>

                        <p className="text-[11px] text-brand-gray-500">
                          {simulationFaceCount === 2
                            ? 'Selecione as duas áreas da tela usando as abas Face 1 e Face 2. A simulação aplicará a arte nas duas.'
                            : 'Use 2 faces quando o painel tiver mais de uma área visível para receber a mesma arte.'}
                        </p>
                      </div>

                      <ScreenAreaEditor
                        imageUrl={baseImagePreviewUrl || form.imagem}
                        corners={activeScreenSelection}
                        style={activeScreenStyle}
                        onChange={setActiveScreenSelection}
                        onStyleChange={setActiveScreenStyle}
                      />
                    </div>
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
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray-300">Enquadramento padrão no Explorar</p>
                      <span className="text-[11px] text-brand-gray-500">Salvo junto do ponto</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <FormField
                        label="Foco horizontal (%)"
                        value={form.imagem_foco_x}
                        onChange={v => updateField('imagem_foco_x', v)}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                      />
                      <FormField
                        label="Foco vertical (%)"
                        value={form.imagem_foco_y}
                        onChange={v => updateField('imagem_foco_y', v)}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                      />
                      <FormField
                        label="Zoom (%)"
                        value={form.imagem_foco_zoom}
                        onChange={v => updateField('imagem_foco_zoom', v)}
                        type="number"
                        min="100"
                        max="220"
                        step="1"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <RangeField
                        label={`Horizontal (${Math.round(previewFocoX)}%)`}
                        value={previewFocoX}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(next) => updateField('imagem_foco_x', String(next))}
                      />
                      <RangeField
                        label={`Vertical (${Math.round(previewFocoY)}%)`}
                        value={previewFocoY}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(next) => updateField('imagem_foco_y', String(next))}
                      />
                      <RangeField
                        label={`Zoom (${Math.round(previewFocoZoom)}%)`}
                        value={previewFocoZoom}
                        min={100}
                        max={220}
                        step={1}
                        onChange={(next) => updateField('imagem_foco_zoom', String(next))}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          updateField('imagem_foco_x', String(Math.round(simulationSuggestedFocus.x)));
                          updateField('imagem_foco_y', String(Math.round(simulationSuggestedFocus.y)));
                          updateField('imagem_foco_zoom', String(Math.round(simulationSuggestedFocus.zoom)));
                        }}
                        className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white transition-colors"
                      >
                        Usar foco automático da tela marcada
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateField('imagem_foco_x', '50');
                          updateField('imagem_foco_y', '50');
                          updateField('imagem_foco_zoom', '100');
                        }}
                        className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white transition-colors"
                      >
                        Resetar enquadramento
                      </button>
                    </div>

                    <div
                      className="rounded-xl border border-white/10 bg-black/35 overflow-hidden h-72 relative select-none cursor-crosshair"
                      onPointerDown={(event) => {
                        setFocusDragging(true);
                        event.currentTarget.setPointerCapture(event.pointerId);
                        updateImageFocusFromPointer(event);
                      }}
                      onPointerMove={(event) => {
                        if (focusDragging) updateImageFocusFromPointer(event);
                      }}
                      onPointerUp={(event) => {
                        if (focusDragging) {
                          updateImageFocusFromPointer(event);
                          setFocusDragging(false);
                        }
                      }}
                      onPointerCancel={() => setFocusDragging(false)}
                    >
                      {imagePreviewForFocus ? (
                        <>
                          <img
                            src={imagePreviewForFocus}
                            alt="Preview enquadramento"
                            className="w-full h-full object-cover"
                            style={{
                              objectPosition: `${previewFocoX}% ${previewFocoY}%`,
                              transform: `scale(${previewFocoZoom / 100})`,
                              transformOrigin: `${previewFocoX}% ${previewFocoY}%`
                            }}
                          />
                          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/25 to-transparent" />
                          <div
                            className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${previewFocoX}%`, top: `${previewFocoY}%` }}
                          >
                            <div className="w-8 h-8 rounded-full border border-brand-orange shadow-[0_0_0_999px_rgba(0,0,0,0.08)]" />
                            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-px h-4 bg-brand-orange/80" />
                            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 w-px h-4 bg-brand-orange/80" />
                            <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 h-px w-4 bg-brand-orange/80" />
                            <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 h-px w-4 bg-brand-orange/80" />
                          </div>
                          <div className="absolute left-3 bottom-3 rounded-lg bg-black/65 px-2 py-1 text-[11px] text-white/80 pointer-events-none">
                            Arraste para mover o foco
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-brand-gray-500">
                          Envie a imagem base para pré-visualizar o enquadramento
                        </div>
                      )}
                    </div>
                  </div>

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

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function formatCacheSize(valueKb) {
  const kb = Number(valueKb);
  if (!Number.isFinite(kb) || kb <= 0) return '-';
  if (kb > 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

function formatDateBr(value) {
  if (!value) return '-';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatCityList(citySlugsRaw) {
  try {
    const parsed = JSON.parse(citySlugsRaw || '[]');
    if (!Array.isArray(parsed) || !parsed.length) return '-';
    return parsed
      .map((city) => String(city || ''))
      .filter(Boolean)
      .map((city) => city.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '))
      .join(', ');
  } catch {
    return '-';
  }
}

function deriveFocusFromSimulationString(simulacaoTela) {
  const fallback = { x: 50, y: 50, zoom: 100 };
  if (!simulacaoTela) return fallback;

  try {
    const parsed = typeof simulacaoTela === 'string' ? JSON.parse(simulacaoTela) : simulacaoTela;
    const pointsSource = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.faces) && parsed.faces.length
        ? parsed.faces[0]?.corners
        : parsed?.corners);
    if (!Array.isArray(pointsSource) || pointsSource.length < 4) return fallback;
    const corners = pointsSource
      .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (corners.length < 4) return fallback;

    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = clampNumber(maxX - minX, 1, 100, 1);
    const height = clampNumber(maxY - minY, 1, 100, 1);
    const minSide = Math.min(width, height);

    return {
      x: clampNumber((minX + maxX) / 2, 0, 100, 50),
      y: clampNumber((minY + maxY) / 2, 0, 100, 50),
      zoom: clampNumber(Math.round(100 + Math.max(0, 32 - minSide) * 2), 100, 220, 100)
    };
  } catch {
    return fallback;
  }
}

function RangeField({ label, value, min, max, step = 1, onChange }) {
  return (
    <label className="block">
      <span className="block text-xs text-brand-gray-400 mb-1.5">{label}</span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
    </label>
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

function UsersAdminPanel({
  users,
  loading,
  error,
  onOpenNew,
  onOpenEdit,
  onDelete,
  userRoles,
  onReload
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Cadastro de usuários admin</h3>
          <p className="text-xs text-brand-gray-500 mt-1">Gerencie quem pode acessar o painel administrativo e defina permissões.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenNew}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8591A]/40 bg-[#E8591A]/15 px-4 py-2 text-sm font-semibold text-[#E8591A] hover:bg-[#E8591A]/25"
          >
            <UserPlus size={15} />
            Adicionar Usuário
          </button>
          <button
            type="button"
            onClick={onReload}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            <RefreshCcw size={15} />
            Atualizar lista
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/[0.03] text-left text-brand-gray-400">
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Usuário</th>
              <th className="px-3 py-2">Contato</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-brand-gray-500">Carregando usuários...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-brand-gray-500">Nenhum usuário cadastrado.</td>
              </tr>
            ) : users.map((user) => (
              <tr key={user.id} className="border-t border-white/5 text-brand-gray-300">
                <td className="px-3 py-2">
                  <div className="font-medium text-white">{[user.first_name, user.last_name].filter(Boolean).join(' ') || 'Sem nome'}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{user.username}</div>
                  {user.email ? <div className="text-[11px] text-brand-gray-500">{user.email}</div> : null}
                </td>
                <td className="px-3 py-2">
                  <div>{user.whatsapp || '-'}</div>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-block px-2 py-1 rounded-lg bg-brand-orange/10 text-brand-orange text-xs">
                    {userRoles.find(r => r.value === user.role)?.label || user.role}
                  </span>
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() => onOpenEdit(user)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-brand-gray-400 hover:bg-white/10"
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(user.id, user.username)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-red-300 hover:bg-red-400/10"
                  >
                    <Trash2 size={12} />
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-4 bg-brand-orange/5 border border-brand-orange/20 rounded-xl text-xs text-brand-gray-300">
        <p><strong>Permissões por Role:</strong></p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li><strong>Admin:</strong> Acesso total ao painel administrativo</li>
          <li><strong>Gerente Comercial:</strong> Pode visualizar e aprovar propostas que excedem lucro mínimo</li>
          <li><strong>Vendedor:</strong> Pode criar propostas, mas propostas precisam de aprovação se excederem limite de lucro</li>
        </ul>
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
