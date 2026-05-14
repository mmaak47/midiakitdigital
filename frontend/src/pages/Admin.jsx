import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn, Plus, Pencil, Trash2, Eye, EyeOff, X, Upload,
  Building2, Save, Loader2, RefreshCcw, Users, MapPinned, PanelsTopLeft, UserPlus, Settings,
  Copy, Check, MapPin, FileText, Download, Square, CheckSquare, Zap, ClipboardList, Activity,
  LogOut, Camera, Info, Send, Heart
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { normalizeHorarioForPdf } from '../lib/horarioUtils';
import {
  login,
  logout,
  fetchAdminPontos,
  createPonto,
  updatePonto,
  deletePonto,
  hardDeletePonto,
  fetchEntornoCategories,
  fetchEntornoJobs,
  fetchEntornoJobStatus,
  requestEntornoAnalysis,
  requestCensusAnalysis,
  fetchAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  updateAdminUserRole,
  fetchAdminSettings,
  fetchAdminPdfCache,
  invalidateAdminPdfCache,
  updateAdminSettings,
  testFinanceiroReminder,
  testPdfWhatsapp,
  syncGoogleOperatingHours,
  geocodePoint,
  fetchCurrentUser,
  fetchArteStats,
  uploadMyPhoto,
  uploadUserPhoto,
  downloadPontosImportTemplate,
  importPontosFromExcel
} from '../lib/api';
import ScreenAreaEditor from '../components/admin/ScreenAreaEditor';
import FocalPointSelector from '../components/admin/FocalPointSelector';
import CidadeFotosAdmin from '../components/admin/CidadeFotosAdmin';
import UserModal from '../components/admin/UserModal';
import NovaVendaTab from '../components/admin/NovaVendaTab';
import VendasListTab from '../components/admin/VendasListTab';
import AuditoriaLoopTab from '../components/admin/AuditoriaLoopTab';
import LeadsTab from '../components/admin/LeadsTab';
import FavoritesAnalyticsTab from '../components/admin/FavoritesAnalyticsTab';
import PropostasTab from '../components/admin/PropostasTab';
import WhatsappLogsTab from '../components/admin/WhatsappLogsTab';
import CustomSelect from '../components/CustomSelect';
import { defaultScreenStyle, parseSimulationConfig, parseScreen, serializeSimulationConfig } from '../lib/simulation';
import { generateTechnicalInfoPdf } from '../lib/technicalInfoPdf';
import { generateTechnicalInfoMobilePdf } from '../lib/technicalInfoMobilePdf';

const DEFAULT_CIDADES = ['Londrina', 'Maringá', 'Balneário Camboriú', 'Itajaí'];
const DEFAULT_TIPOS = ['Elevador', 'Tela Indoor', 'Painel LED', 'Backlight', 'Frontlight', 'Totem Digital', 'Circuito Muffato', 'LED Posto', 'Video Wall'];
const POINT_OWNER_OPTIONS = ['Intermídia', 'Parceiro'];
const ELEVADOR_TIPO = 'Elevador';
const ELEVADOR_CATEGORIAS = ['Comercial', 'Residencial'];
const ELEVADOR_ARTE_LARGURA = '1080';
const ELEVADOR_ARTE_ALTURA = '1920';
const PUBLICOS = ['A+', 'A', 'A/B+', 'A/B', 'A/B/C', 'B+', 'B', 'B/C+', 'B/C', 'C'];
const ENTORNO_SEGMENTOS = [
  'clinica', 'hospital', 'educacao', 'escola', 'faculdade',
  'automotivo', 'varejo', 'restaurante', 'imobiliaria',
  'construtora', 'contabilidade', 'advocacia', 'industria',
  'fitness', 'beleza', 'pet', 'farmacia', 'supermercado',
  'financeiro', 'turismo', 'coworking', 'tecnologia', 'outro'
];
const USER_ROLES = [
  { value: 'admin', label: 'Admin (acesso total)' },
  { value: 'diretor', label: 'Diretor (visão executiva: Gestão Comercial, Nova Venda e Vendas)' },
  { value: 'gerente_comercial', label: 'Gerente Comercial (aprova propostas)' },
  { value: 'vendedor', label: 'Vendedor (criar propostas)' }
];

const ADMIN_TAB_GROUPS = [
  { key: 'comercial', label: 'Comercial', tabs: [
    { key: 'vendas',           label: 'Nova Venda',         icon: Zap,           roles: ['admin', 'diretor', 'gerente_comercial', 'vendedor'] },
    { key: 'historico_vendas', label: 'Vendas',             icon: ClipboardList, roles: ['admin', 'diretor', 'gerente_comercial', 'vendedor'] },
    { key: 'gestao_comercial', label: 'Gestão Comercial',   icon: Activity,      roles: ['admin', 'diretor', 'gerente_comercial', 'vendedor'], href: '/comercial/gestao' },
    { key: 'leads',            label: 'Leads',              icon: UserPlus,      roles: ['admin', 'gerente_comercial'] },
    { key: 'favoritos',        label: 'Favoritos',          icon: Heart,         roles: ['admin', 'gerente_comercial'] },
    { key: 'propostas',        label: 'Propostas',          icon: FileText,      roles: ['admin', 'gerente_comercial'] },
    { key: 'auditoria_loop',   label: 'Auditoria de Loop',  icon: RefreshCcw,    roles: ['admin', 'gerente_comercial', 'vendedor'] },
  ]},
  { key: 'pontos_midia', label: 'Pontos & Mídia', tabs: [
    { key: 'pontos',   label: 'Pontos',             icon: PanelsTopLeft, roles: ['admin', 'gerente_comercial'] },
    { key: 'entorno',  label: 'Análise de Entorno', icon: MapPinned,     roles: ['admin', 'gerente_comercial'] },
  ]},
  { key: 'sistema', label: 'Sistema', tabs: [
    { key: 'usuarios',      label: 'Usuários',         icon: Users,    roles: ['admin'] },
    { key: 'whatsapp_logs', label: 'Envios WhatsApp', icon: Send,     roles: ['admin', 'gerente_comercial'] },
    { key: 'configuracoes', label: 'Configurações',    icon: Settings, roles: ['admin', 'gerente_comercial'] },
  ]},
];

function getVisibleGroups(role) {
  return ADMIN_TAB_GROUPS
    .map(g => ({ ...g, tabs: g.tabs.filter(t => !t.roles || t.roles.includes(role)) }))
    .filter(g => g.tabs.length > 0);
}

function getDefaultTab(role) {
  if (role === 'vendedor') return 'vendas';
  return 'vendas';
}

const emptyForm = {
  nome: '', cidade: 'Londrina', tipo: 'Elevador', endereco: '',
  lat: '', lng: '', horario: '06:00 às 22:00', fluxo: '',
  insercoes: '', tempo: '15s', loop: '3 min', veiculacao: 'Vídeo sem áudio',
  publico: 'A/B', owner_tag: 'Intermídia', telas: '1', preco: '', descricao: '', imagem: '', imagem2: '',
  simulacao_tela: '', simulacao_arte: '', simulacao_preview: '',
  arte_largura: ELEVADOR_ARTE_LARGURA, arte_altura: ELEVADOR_ARTE_ALTURA,
  elevador_categoria: 'Comercial',
  midia_largura_m: '',
  midia_altura_m: '',
  custo_operacional: '', tipo_fluxo: 'pessoas',
  imagem_foco_x: '50', imagem_foco_y: '50', imagem_foco_zoom: '100',
  foto_focal_point: 'center center',
  pdf_image_source: 'imagem2',
  disponibilidade: 'disponivel'
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
    elevador_categoria: ELEVADOR_CATEGORIAS.includes(nextForm?.elevador_categoria)
      ? nextForm.elevador_categoria
      : 'Comercial'
  };
}

export default function Admin() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('intermidia_theme') === 'dark';
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
  const [notice, setNotice] = useState(null); // { type: 'error'|'success'|'info', title?, message }
  const showNotice = (message, type = 'error', title = null) => setNotice({ type, message: String(message || ''), title });
  const [search, setSearch] = useState('');
  const [filterCidade, setFilterCidade] = useState('todas');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos'); // todos | ativo | inativo
  const [pontosSortKey, setPontosSortKey] = useState('nome');
  const [pontosSortDir, setPontosSortDir] = useState('asc');
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
  const [hoursSyncCity, setHoursSyncCity] = useState('');
  const [hoursSyncLimit, setHoursSyncLimit] = useState(60);
  const [hoursSyncRadiusMeters, setHoursSyncRadiusMeters] = useState(220);
  const [hoursSyncConfidence, setHoursSyncConfidence] = useState(0.56);
  const [hoursSyncOverwrite, setHoursSyncOverwrite] = useState(false);
  const [hoursSyncBusy, setHoursSyncBusy] = useState(false);
  const [hoursSyncResult, setHoursSyncResult] = useState(null);
  const [hoursSyncError, setHoursSyncError] = useState('');

  // Evolution API
  const [evoApiUrl, setEvoApiUrl] = useState('');
  const [evoInstance, setEvoInstance] = useState('');
  const [evoPdfInstance, setEvoPdfInstance] = useState('');
  const [evoApiKey, setEvoApiKey] = useState('');
  const [evoDestNumber, setEvoDestNumber] = useState('');
  const [evoFinanceiroNumber, setEvoFinanceiroNumber] = useState('');
  const [tvTickerMessage, setTvTickerMessage] = useState('');
  const [tvPostitGroupJid, setTvPostitGroupJid] = useState('');
  const [tvSaving, setTvSaving] = useState(false);
  const [tvSaveMsg, setTvSaveMsg] = useState('');
  const [evoSaving, setEvoSaving] = useState(false);
  const [evoSaveMsg, setEvoSaveMsg] = useState('');
  const [evoTestLoading, setEvoTestLoading] = useState(false);
  const [evoTestMsg, setEvoTestMsg] = useState('');
  const [pdfTestPhone, setPdfTestPhone] = useState('');
  const [pdfTestLoading, setPdfTestLoading] = useState(false);
  const [pdfTestLog, setPdfTestLog] = useState([]);
  const [pdfTestError, setPdfTestError] = useState('');

  // Usuário logado
  const [currentUser, setCurrentUser] = useState(null);
  const [welcomePopup, setWelcomePopup] = useState(null); // { nome, role, pct, realizado, meta }
  const [savingSettings, setSavingSettings] = useState(false);
  const [pdfCacheRows, setPdfCacheRows] = useState([]);
  const [pdfCacheLoading, setPdfCacheLoading] = useState(false);
  const [pdfCacheError, setPdfCacheError] = useState('');
  const [invalidatingCacheId, setInvalidatingCacheId] = useState(null);
  const [technicalPdfSelectedIds, setTechnicalPdfSelectedIds] = useState([]);
  const [technicalPdfCityFilter, setTechnicalPdfCityFilter] = useState('todas');
  const [technicalPdfSearch, setTechnicalPdfSearch] = useState('');
  const [technicalPdfBusy, setTechnicalPdfBusy] = useState(false);
  const [technicalPdfStatus, setTechnicalPdfStatus] = useState('');
  const [technicalPdfFormat, setTechnicalPdfFormat] = useState('desktop'); // 'desktop' | 'mobile'
  const [showTechnicalPdfFormatPicker, setShowTechnicalPdfFormatPicker] = useState(false);
  const technicalPdfFormatPickerRef = useRef(null);
  const [importExcelBusy, setImportExcelBusy] = useState(false);
  const importExcelInputRef = useRef(null);

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

  const [censusBusy, setCensusBusy] = useState(false);
  const [censusStatus, setCensusStatus] = useState('');
  const [censusCidade, setCensusCidade] = useState('');

  const [cidades, setCidades] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [promptCopied, setPromptCopied] = useState(false);
  const [arteStats, setArteStats] = useState(null);
  const [arteStatsLoading, setArteStatsLoading] = useState(false);
  const [arteStatsError, setArteStatsError] = useState('');

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
    if (activeTab === 'arte_ia' && auth) {
      loadArteStats();
    }
  }, [activeTab, auth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('intermidia_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const handleSessionError = (err) => {
    const message = String(err?.message || '');
    if (/token inválido|token invalido|expirad|autentica/i.test(message)) {
      sessionStorage.removeItem('admin_token');
      setAuth(false);
      setLoginError('Sua sessão expirou. Faça login novamente.');
      return true;
    }
    return false;
  };

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

  const handleLogout = () => {
    logout();
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('comercial_manual_login');
    setAuth(false);
    setCurrentUser(null);
    navigate('/comercial');
  };

  const handleUploadMyPhoto = async (file) => {
    try {
      const result = await uploadMyPhoto(file);
      setCurrentUser(prev => prev ? { ...prev, photo_url: result.photo_url } : prev);
    } catch (err) {
      showNotice(err.message);
    }
  };

  const handleUploadUserPhoto = async (userId, file) => {
    try {
      await uploadUserPhoto(userId, file);
      await loadUsers();
    } catch (err) {
      showNotice(err.message);
    }
  };

  const loadPontos = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminPontos();
      setPontos(data);
    } catch (err) {
      if (!handleSessionError(err)) {
        console.error(err);
      }
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
      if (!handleSessionError(err)) {
        setUsersError(err.message || 'Falha ao carregar usuários');
      }
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (auth) {
      loadPontos();
      loadUsers();
      // Carrega usuário atual e ajusta tab inicial pelo role
      fetchCurrentUser()
        .then(u => {
          setCurrentUser(u);
          // Mensagem de boas-vindas (1x por dia por sessão) ao fazer login manual no /comercial
          try {
            const flagKey = 'welcome_shown_' + new Date().toISOString().slice(0,10);
            if (sessionStorage.getItem('comercial_manual_login') === '1' && !sessionStorage.getItem(flagKey)) {
              const token = sessionStorage.getItem('admin_token');
              fetch('/api/gestao/monthly-summary', { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.ok ? r.json() : null)
                .then((snap) => {
                  setWelcomePopup({
                    nome: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
                    role: u.role,
                    pct: Number(snap?.pct_mensal || 0),
                    realizado: Number(snap?.realizado_mensal || 0),
                    meta: Number(snap?.meta_mensal || 0),
                  });
                  sessionStorage.setItem(flagKey, '1');
                  sessionStorage.removeItem('comercial_manual_login');
                })
                .catch(() => {});
            }
          } catch {}
          // Diretor e admin ficam no painel (/comercial) com as abas visíveis.
          // Gerente comercial e vendedor vão direto para /comercial/gestao.
          if (location.pathname === '/comercial' && u?.role && u.role !== 'admin' && u.role !== 'diretor') {
            navigate('/comercial/gestao', { replace: true });
            return;
          }
          setActiveTab(prev => {
            const visible = getVisibleGroups(u?.role).flatMap(g => g.tabs);
            // Respect ?tab=... query param (e.g. Gestão Comercial → Nova Venda shortcut)
            try {
              const search = new URLSearchParams(location.search || '');
              const requested = search.get('tab');
              if (requested && visible.find(t => t.key === requested)) {
                return requested;
              }
            } catch {}
            if (visible.find(t => t.key === prev)) return prev;
            return getDefaultTab(u?.role);
          });
        })
        .catch(() => {});
    }
  }, [auth, location.pathname, navigate]);

  useEffect(() => {
    const available = new Set(
      pontos
        .filter((point) => Number(point?.ativo) === 1)
        .map((point) => Number(point.id))
    );
    setTechnicalPdfSelectedIds((current) => current.filter((id) => available.has(Number(id))));
  }, [pontos]);

  const openNew = () => {
    setForm(enforceElevadorDimensions(emptyForm));
    setImageFile(null);
    setImagem2File(null);
    setGeoLoading(false);
    setGeoError('');
    setScreenSelection(null);
    setScreenStyle(defaultScreenStyle);
    setScreenSelection2(null);
    setScreenStyle2(defaultScreenStyle);
    setSimulationFaceCount(1);
    setActiveSimulationFace(0);
    setEditing('new');
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
      owner_tag: ponto.owner_tag || 'Intermídia',
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
      midia_largura_m: Number.isFinite(Number(ponto.midia_largura_m)) ? Number(ponto.midia_largura_m).toString() : '',
      midia_altura_m: Number.isFinite(Number(ponto.midia_altura_m)) ? Number(ponto.midia_altura_m).toString() : '',
      tipo_fluxo: ponto.tipo_fluxo || 'pessoas',
      imagem_foco_x: (Number.isFinite(Number(ponto.imagem_foco_x)) ? Number(ponto.imagem_foco_x) : 50).toString(),
      imagem_foco_y: (Number.isFinite(Number(ponto.imagem_foco_y)) ? Number(ponto.imagem_foco_y) : 50).toString(),
      imagem_foco_zoom: (Number.isFinite(Number(ponto.imagem_foco_zoom)) ? Number(ponto.imagem_foco_zoom) : 100).toString(),
      foto_focal_point: ponto.foto_focal_point || 'center center',
      pdf_image_source: ponto.pdf_image_source || 'imagem2',
      disponibilidade: ponto.disponibilidade || 'disponivel'
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
      showNotice(err.message, 'error', 'Erro ao salvar ponto');
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
      showNotice(err.message);
    }
  };

  const handleHardDelete = async (p) => {
    const name = p?.nome || 'este ponto';
    const confirm1 = confirm(`ATENÇÃO: Excluir PERMANENTEMENTE "${name}"?\n\nEssa ação não pode ser desfeita e removerá o ponto do banco de dados.`);
    if (!confirm1) return;
    const confirm2 = prompt(`Para confirmar a exclusão permanente, digite EXCLUIR:`);
    if (String(confirm2 || '').trim().toUpperCase() !== 'EXCLUIR') return;
    try {
      await hardDeletePonto(p.id);
      loadPontos();
    } catch (err) {
      showNotice(err.message);
    }
  };

  const handleDownloadExcelTemplate = async () => {
    try {
      await downloadPontosImportTemplate();
    } catch (err) {
      showNotice(err.message || 'Erro ao baixar o Excel de exemplo.');
    }
  };

  const handleOpenExcelImport = () => {
    if (importExcelBusy) return;
    importExcelInputRef.current?.click();
  };

  const handleImportExcelFile = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;

    setImportExcelBusy(true);
    try {
      const result = await importPontosFromExcel(file);
      await loadPontos();

      const createdCount = Number(result?.createdCount || 0);
      const errorCount = Number(result?.errorCount || 0);
      const firstErrors = Array.isArray(result?.errors) ? result.errors.slice(0, 5) : [];
      const detail = firstErrors.map((item) => `Linha ${item.row}: ${item.error}`).join('\n');

      showNotice([
        `Pontos criados: ${createdCount}`,
        `Erros: ${errorCount}`,
        detail ? `\nPrimeiros erros:\n${detail}` : ''
      ].filter(Boolean).join('\n'), errorCount > 0 ? 'info' : 'success', 'Importação concluída');
    } catch (err) {
      showNotice(err.message || 'Falha ao importar pontos via Excel.');
    } finally {
      setImportExcelBusy(false);
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
        const parsedEdit = splitName(formData.nome, formData.login);
        const editPayload = {
          firstName: parsedEdit.firstName,
          lastName: parsedEdit.lastName,
          username: String(formData.login || '').trim(),
          email: String(formData.email || '').trim(),
          whatsapp: String(formData.whatsapp || '').trim(),
          role: formData.tipoUsuario || 'vendedor',
          is_vendedor: formData.isVendedor,
        };
        if (String(formData.senha || '').trim()) {
          editPayload.password = String(formData.senha).trim();
        }
        await updateAdminUser(userModalInitialData.id, editPayload);
      } else {
        const parsed = splitName(formData.nome, formData.login);
        const normalizedEmail = String(formData.email || '').trim() || `${String(formData.login || '').trim()}@intermidia.local`;
        await createAdminUser({
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          whatsapp: String(formData.whatsapp || '').trim(),
          email: normalizedEmail,
          password: String(formData.senha || '').trim(),
          role: formData.tipoUsuario || 'vendedor',
          is_vendedor: formData.isVendedor,
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
      // Evolution API settings
      setEvoApiUrl(data.evolution_api_url || '');
      setEvoInstance(data.evolution_instance || '');
      setEvoPdfInstance(data.evolution_pdf_instance || '');
      setEvoApiKey(data.evolution_api_key || '');
      setEvoDestNumber(data.evolution_dest_number || '');
      setEvoFinanceiroNumber(data.evolution_financeiro_number || '');
      setTvTickerMessage(data.tv_ticker_message || '');
      setTvPostitGroupJid(data.tv_postit_group_jid || '');
    } catch (err) {
      if (!handleSessionError(err)) {
        setSettingsError(err.message || 'Falha ao carregar configurações');
      }
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

  const handleSaveEvoSettings = async (e) => {
    e.preventDefault();
    setEvoSaving(true);
    setEvoSaveMsg('');
    try {
      await updateAdminSettings({
        evolution_api_url: evoApiUrl.trim(),
        evolution_instance: evoInstance.trim(),
        evolution_pdf_instance: evoPdfInstance.trim(),
        evolution_api_key: evoApiKey.trim(),
        evolution_dest_number: evoDestNumber.trim(),
        evolution_financeiro_number: evoFinanceiroNumber.trim()
      });
      setEvoSaveMsg('Configurações salvas!');
      setTimeout(() => setEvoSaveMsg(''), 3000);
    } catch (err) {
      setEvoSaveMsg(`Erro: ${err.message}`);
    } finally {
      setEvoSaving(false);
    }
  };

  const handleSaveTvSettings = async (e) => {
    e.preventDefault();
    setTvSaving(true);
    setTvSaveMsg('');
    try {
      await updateAdminSettings({
        tv_ticker_message: tvTickerMessage.trim(),
        tv_postit_group_jid: tvPostitGroupJid.trim()
      });
      setTvSaveMsg('Configurações do Painel TV salvas!');
      setTimeout(() => setTvSaveMsg(''), 3000);
    } catch (err) {
      setTvSaveMsg(`Erro: ${err.message}`);
    } finally {
      setTvSaving(false);
    }
  };

  const handleTestFinanceiroReminder = async () => {
    setEvoTestLoading(true);
    setEvoTestMsg('');
    try {
      const data = await testFinanceiroReminder();
      setEvoTestMsg(`✓ Lembrete enviado com ${data.vendaCount} venda(s) pendente(s)`);
      setTimeout(() => setEvoTestMsg(''), 4000);
    } catch (err) {
      setEvoTestMsg(`Erro: ${err.message}`);
    } finally {
      setEvoTestLoading(false);
    }
  };

  const handleTestPdfWhatsapp = async () => {
    setPdfTestLoading(true);
    setPdfTestLog([]);
    setPdfTestError('');
    try {
      const data = await testPdfWhatsapp({ phone: pdfTestPhone.trim() });
      setPdfTestLog(data.log || []);
    } catch (err) {
      setPdfTestError(err.message);
    } finally {
      setPdfTestLoading(false);
    }
  };

  const handleRunHoursSync = async (dryRun = true) => {
    setHoursSyncBusy(true);
    setHoursSyncError('');
    setHoursSyncResult(null);
    try {
      const result = await syncGoogleOperatingHours({
        dryRun,
        overwrite: hoursSyncOverwrite,
        city: hoursSyncCity.trim(),
        limit: Number(hoursSyncLimit) || 60,
        radiusMeters: Number(hoursSyncRadiusMeters) || 220,
        confidenceThreshold: Number(hoursSyncConfidence) || 0.56
      });
      setHoursSyncResult(result || null);
    } catch (err) {
      if (!handleSessionError(err)) {
        setHoursSyncError(err.message || 'Falha na sincronização de horários');
      }
    } finally {
      setHoursSyncBusy(false);
    }
  };

  const loadPdfCache = async () => {
    setPdfCacheLoading(true);
    setPdfCacheError('');
    try {
      const rows = await fetchAdminPdfCache();
      setPdfCacheRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      if (!handleSessionError(err)) {
        setPdfCacheRows([]);
        setPdfCacheError(err.message || 'Falha ao carregar cache de PDFs');
      }
    } finally {
      setPdfCacheLoading(false);
    }
  };

  const loadArteStats = async () => {
    setArteStatsLoading(true);
    setArteStatsError('');
    try {
      const data = await fetchArteStats();
      setArteStats(data || null);
    } catch (err) {
      if (!handleSessionError(err)) {
        setArteStats(null);
        setArteStatsError(err.message || 'Falha ao carregar métricas de Arte IA');
      }
    } finally {
      setArteStatsLoading(false);
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

  const handleRunCensusAnalysis = async (force = false) => {
    setCensusBusy(true);
    setCensusStatus('');
    try {
      const result = await requestCensusAnalysis({ municipio: censusCidade || null, force });
      setCensusStatus(result?.message || 'Análise censitária iniciada com sucesso.');
    } catch (err) {
      setCensusStatus(`Erro: ${err.message || 'Falha ao iniciar análise'}`);
    } finally {
      setCensusBusy(false);
    }
  };

  const updateField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      return enforceElevadorDimensions(next);
    });
  };

  const filtered = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const base = pontos.filter((p) => {
      const matchSearch = !searchTerm
        || p.nome.toLowerCase().includes(searchTerm)
        || p.cidade.toLowerCase().includes(searchTerm)
        || String(p.owner_tag || '').toLowerCase().includes(searchTerm);
      const matchCidade = filterCidade === 'todas' || p.cidade === filterCidade;
      const matchTipo = filterTipo === 'todos' || p.tipo === filterTipo;
      const matchStatus = filterStatus === 'todos'
        || (filterStatus === 'ativo' && Number(p.ativo) === 1)
        || (filterStatus === 'inativo' && Number(p.ativo) !== 1);
      return matchSearch && matchCidade && matchTipo && matchStatus;
    });
    const comparators = {
      nome: (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'),
      cidade: (a, b) => String(a.cidade || '').localeCompare(String(b.cidade || ''), 'pt-BR'),
      tipo: (a, b) => String(a.tipo || '').localeCompare(String(b.tipo || ''), 'pt-BR'),
      owner_tag: (a, b) => String(a.owner_tag || '').localeCompare(String(b.owner_tag || ''), 'pt-BR'),
      telas: (a, b) => (Number(a.telas) || 0) - (Number(b.telas) || 0),
      preco: (a, b) => (Number(a.preco) || 0) - (Number(b.preco) || 0),
      ativo: (a, b) => (Number(b.ativo) || 0) - (Number(a.ativo) || 0),
    };
    const cmp = comparators[pontosSortKey] || comparators.nome;
    const dirMul = pontosSortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => dirMul * cmp(a, b));
  }, [pontos, search, filterCidade, filterTipo, filterStatus, pontosSortKey, pontosSortDir]);

  const togglePontosSort = (key) => {
    if (pontosSortKey === key) {
      setPontosSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setPontosSortKey(key);
      setPontosSortDir(key === 'preco' || key === 'telas' ? 'desc' : 'asc');
    }
  };

  const tiposContagem = useMemo(() => {
    const scope = pontos.filter((p) => {
      const matchCidade = filterCidade === 'todas' || p.cidade === filterCidade;
      const matchStatus = filterStatus === 'todos'
        || (filterStatus === 'ativo' && Number(p.ativo) === 1)
        || (filterStatus === 'inativo' && Number(p.ativo) !== 1);
      return matchCidade && matchStatus;
    });
    const counts = new Map();
    scope.forEach((p) => counts.set(p.tipo || 'Sem tipo', (counts.get(p.tipo || 'Sem tipo') || 0) + 1));
    return counts;
  }, [pontos, filterCidade, filterStatus]);

  const activeFiltersCount =
    (filterCidade !== 'todas' ? 1 : 0)
    + (filterTipo !== 'todos' ? 1 : 0)
    + (filterStatus !== 'todos' ? 1 : 0)
    + (search.trim() ? 1 : 0);

  const technicalPdfCandidates = useMemo(() => {
    const term = technicalPdfSearch.trim().toLowerCase();
    return pontos
      .filter((point) => Number(point?.ativo) === 1)
      .filter((point) => technicalPdfCityFilter === 'todas' || point.cidade === technicalPdfCityFilter)
      .filter((point) => {
        if (!term) return true;
        return String(point.nome || '').toLowerCase().includes(term)
          || String(point.cidade || '').toLowerCase().includes(term)
          || String(point.tipo || '').toLowerCase().includes(term);
      })
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  }, [pontos, technicalPdfSearch, technicalPdfCityFilter]);

  const technicalPdfSelectedPoints = useMemo(() => {
    const selectedIdSet = new Set(technicalPdfSelectedIds.map((value) => Number(value)));
    return pontos.filter((point) => selectedIdSet.has(Number(point.id)));
  }, [pontos, technicalPdfSelectedIds]);

  const handleToggleTechnicalPoint = (pointId) => {
    setTechnicalPdfSelectedIds((current) => {
      const id = Number(pointId);
      if (current.includes(id)) {
        return current.filter((value) => value !== id);
      }
      return [...current, id];
    });
  };

  const handleSelectAllTechnicalFiltered = () => {
    setTechnicalPdfSelectedIds((current) => {
      const next = new Set(current);
      technicalPdfCandidates.forEach((point) => next.add(Number(point.id)));
      return Array.from(next);
    });
  };

  const handleClearTechnicalSelection = () => {
    setTechnicalPdfSelectedIds([]);
  };

  const handleGenerateTechnicalPdf = async (formatOverride) => {
    if (!technicalPdfSelectedPoints.length) {
      showNotice('Selecione ao menos um ponto para gerar o PDF tecnico.', 'info', 'Selecione um ponto');
      return;
    }
    const format = formatOverride || technicalPdfFormat;
    setShowTechnicalPdfFormatPicker(false);
    setTechnicalPdfBusy(true);
    setTechnicalPdfStatus('Iniciando geracao...');
    try {
      if (format === 'mobile') {
        await generateTechnicalInfoMobilePdf(technicalPdfSelectedPoints, {
          onStatusChange: (status) => setTechnicalPdfStatus(status)
        });
      } else {
        await generateTechnicalInfoPdf(technicalPdfSelectedPoints, {
          onStatusChange: (status) => setTechnicalPdfStatus(status)
        });
      }
    } catch (error) {
      showNotice(error?.message || 'Falha ao gerar PDF tecnico.');
    } finally {
      setTechnicalPdfBusy(false);
      setTimeout(() => setTechnicalPdfStatus(''), 1800);
    }
  };

  useEffect(() => {
    if (!showTechnicalPdfFormatPicker) return undefined;
    const handler = (e) => {
      if (technicalPdfFormatPickerRef.current && !technicalPdfFormatPickerRef.current.contains(e.target)) {
        setShowTechnicalPdfFormatPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTechnicalPdfFormatPicker]);

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
        className={`min-h-screen relative overflow-hidden ${isDark ? 'bg-black text-white' : 'commercial-light bg-[#f4f5f7] text-neutral-900'}`}
        data-theme={isDark ? 'dark' : 'light'}
      >
        {/* Accent line + atmospheric gradients */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#FE5C2B] to-transparent opacity-80 z-20" />
        <div className={`pointer-events-none fixed -left-40 top-10 w-[520px] h-[520px] rounded-full opacity-70 ${isDark ? '' : ''}`}
          style={{ background: 'radial-gradient(circle, rgba(254,92,43,0.12) 0%, rgba(254,92,43,0.03) 45%, transparent 72%)' }} />
        <div className="pointer-events-none fixed -right-40 bottom-10 w-[480px] h-[480px] rounded-full opacity-70"
          style={{ background: 'radial-gradient(circle, rgba(232,89,26,0.10) 0%, rgba(232,89,26,0.02) 48%, transparent 74%)' }} />

        <Navbar commercial isDark={isDark} onToggleTheme={() => setIsDark((prev) => !prev)} />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6 pt-24 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className={`w-full max-w-md rounded-3xl border p-8 backdrop-blur ${isDark ? 'border-white/10 bg-white/[0.03] shadow-2xl shadow-black/30' : 'border-neutral-200/80 bg-white shadow-2xl shadow-[#FE5C2B]/10'}`}
          >
            <div className="mb-8 flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg ${isDark ? 'bg-brand-orange/15 text-brand-orange' : 'bg-gradient-to-br from-[#FE5C2B] to-[#C94A1A] text-white shadow-[#FE5C2B]/30'}`}>
                <LogIn size={20} />
              </div>
              <div>
                <h1 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>Bem-vindo de volta</h1>
                <p className={`text-sm ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Painel comercial Intermidia</p>
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleLogin}>
              <div>
                <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Usuário ou e-mail</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className={`w-full rounded-xl px-4 py-3 text-sm transition-colors focus:outline-none ${isDark ? 'border border-white/10 bg-white/5 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/40' : 'border border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:border-[#FE5C2B]/60 focus:bg-white'}`}
                  placeholder="admin ou email@empresa.com"
                  required
                  autoComplete="username"
                />
              </div>

              <div>
                <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Senha</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={`w-full rounded-xl px-4 py-3 pr-10 text-sm transition-colors focus:outline-none ${isDark ? 'border border-white/10 bg-white/5 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/40' : 'border border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:border-[#FE5C2B]/60 focus:bg-white'}`}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-brand-gray-500 hover:text-white' : 'text-neutral-400 hover:text-neutral-700'}`}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {loginError ? <p className="text-xs text-red-500 font-medium">{loginError}</p> : null}

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] py-3 font-semibold text-white shadow-lg shadow-[#FE5C2B]/30 transition-all duration-200 hover:scale-[1.01] hover:shadow-xl hover:shadow-[#FE5C2B]/40 active:scale-[0.99]"
              >
                Entrar
              </button>

              <div className={`rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${isDark ? 'border-white/10 bg-white/[0.02] text-brand-gray-300' : 'border-[#FFD9C6] bg-[#FFF4EC] text-[#8B3A14]'}`}>
                💡 <strong>Dica rápida:</strong> use sempre <strong>/gestao</strong>. Gerente e vendedor entram direto na Gestão Comercial.
              </div>
            </form>
          </motion.div>
        </div>
        <footer className={`relative z-10 px-6 pb-6 text-center text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
          <span className="inline-flex items-center gap-1.5">
            <span>Desenvolvido por</span>
            <span className="font-semibold text-brand-orange animate-pulse">Maitê Doin</span>
          </span>
        </footer>
      </div>
    );
  }

  // Admin panel — theme helpers
  const th = {
    card: isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-white shadow-sm',
    inp: isDark
      ? 'bg-white/5 border border-white/10 text-white placeholder:text-brand-gray-500 focus:border-brand-orange/40'
      : 'bg-white border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/60',
    lbl: isDark ? 'text-brand-gray-400' : 'text-neutral-600',
    sectionTitle: isDark ? 'text-white' : 'text-neutral-900',
    sectionDesc: isDark ? 'text-brand-gray-500' : 'text-neutral-500',
    tableHead: isDark ? 'bg-white/[0.03] border-b border-white/5' : 'bg-neutral-50 border-b border-neutral-200',
    tableHeadText: isDark ? 'text-brand-gray-400' : 'text-neutral-500',
    tableRow: isDark ? 'border-b border-white/5 hover:bg-white/[0.02]' : 'border-b border-neutral-100 hover:bg-neutral-50',
    tableCell: isDark ? 'text-brand-gray-400' : 'text-neutral-600',
    tableName: isDark ? 'text-white' : 'text-neutral-900',
    btnGhost: isDark ? 'text-brand-gray-400 hover:bg-white/10 hover:text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
    btnOutline: isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50',
    tabInactive: isDark ? 'text-brand-gray-300 hover:bg-white/10 hover:text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
    divider: isDark ? 'divide-white/5' : 'divide-neutral-100',
    selectOpt: isDark ? 'bg-brand-dark text-white' : 'bg-white text-neutral-900',
    thumbBg: isDark ? 'bg-brand-gray-800' : 'bg-neutral-100',
    badge: (ok) => ok
      ? (isDark ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-700 border border-green-200')
      : (isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600 border border-red-200'),
  };
  return (
    <div
      className={`min-h-screen relative ${isDark ? 'bg-black text-white' : 'commercial-light bg-[#f4f5f7] text-neutral-900'}`}
      data-theme={isDark ? 'dark' : 'light'}
    >
      {/* Accent line + atmospheric gradients */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#FE5C2B] to-transparent opacity-80 z-20" />
      {!isDark && (
        <>
          <div className="pointer-events-none fixed -left-40 top-20 w-[520px] h-[520px] rounded-full opacity-60" style={{ background: 'radial-gradient(circle, rgba(254,92,43,0.10) 0%, rgba(254,92,43,0.03) 45%, transparent 72%)' }} />
          <div className="pointer-events-none fixed -right-40 top-1/2 w-[480px] h-[480px] rounded-full opacity-60" style={{ background: 'radial-gradient(circle, rgba(232,89,26,0.08) 0%, rgba(232,89,26,0.02) 48%, transparent 74%)' }} />
        </>
      )}

      <Navbar commercial isDark={isDark} onToggleTheme={() => setIsDark((prev) => !prev)} />
      <AnimatePresence>
        {welcomePopup && (
          <WelcomePopup data={welcomePopup} isDark={isDark} onClose={() => setWelcomePopup(null)} onGoToGestao={() => { setWelcomePopup(null); navigate('/comercial/gestao'); }} />
        )}
      </AnimatePresence>
      <div className="relative z-10 pt-20 max-w-7xl mx-auto px-6 pb-12">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className={`inline-flex items-center justify-center w-11 h-11 rounded-2xl ${isDark ? 'bg-white/10' : 'bg-gradient-to-br from-[#FE5C2B] to-[#C94A1A] shadow-lg shadow-[#FE5C2B]/25'}`}>
              <Settings size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {currentUser ? `${(() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })()}, ${(currentUser.first_name || currentUser.username || '').split(' ')[0]}` : 'Painel'}
              </h1>
              <p className={`text-sm mt-0.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                {currentUser?.role === 'admin' ? 'Acesso total ao sistema'
                  : currentUser?.role === 'diretor' ? 'Visão executiva: Nova Venda, Vendas e Gestão Comercial'
                  : currentUser?.role === 'gerente_comercial' ? 'Gerente Comercial'
                  : currentUser?.role === 'vendedor' ? 'Vendedor'
                  : 'Painel comercial'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="flex items-center gap-3">
                <label className="relative cursor-pointer group">
                  {currentUser.photo_url ? (
                    <img src={currentUser.photo_url} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-brand-orange/40 group-hover:border-brand-orange transition-colors" />
                  ) : (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${isDark ? 'bg-brand-orange/20 text-brand-orange' : 'bg-orange-100 text-orange-700'} border-2 border-transparent group-hover:border-brand-orange transition-colors`}>
                      {(currentUser.first_name?.[0] || currentUser.username?.[0] || '?').toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-brand-orange flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={9} className="text-white" />
                  </div>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { if (e.target.files?.[0]) handleUploadMyPhoto(e.target.files[0]); e.target.value = ''; }} />
                </label>
                <div className="hidden sm:block">
                  <p className={`text-sm font-semibold leading-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>{[currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || currentUser.username}</p>
                  <p className={`text-xs capitalize ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{String(currentUser.role || '').replace('_', ' ')}</p>
                </div>
              </div>
            )}
            <button onClick={handleLogout} title="Sair" className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${isDark ? 'text-red-400 hover:bg-red-400/10 border border-red-400/20' : 'text-red-600 hover:bg-red-50 border border-red-200'}`}>
              <LogOut size={16} />
              <span className="hidden sm:inline">Sair</span>
            </button>
            {activeTab === 'pontos' ? (
              <div className="flex items-center gap-2">
                <input
                  ref={importExcelInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleImportExcelFile}
                />
                <button
                  type="button"
                  onClick={handleDownloadExcelTemplate}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    isDark
                      ? 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                      : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 shadow-sm'
                  }`}
                >
                  <Download size={15} />
                  <span className="hidden sm:inline">Excel exemplo</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenExcelImport}
                  disabled={importExcelBusy}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                    isDark
                      ? 'border border-brand-orange/40 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20'
                      : 'border border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'
                  }`}
                >
                  {importExcelBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  <span className="hidden sm:inline">Importar Excel</span>
                </button>
                <button
                  onClick={openNew}
                  className="orange-solid-btn flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white font-semibold rounded-xl shadow-lg shadow-[#FE5C2B]/25 hover:shadow-xl hover:shadow-[#FE5C2B]/35 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-sm"
                >
                  <Plus size={16} />
                  Novo ponto
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-6 space-y-2">
          {getVisibleGroups(currentUser?.role).map((group) => (
            <div key={group.key} className={`rounded-2xl border p-2 transition-shadow ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200/80 bg-white shadow-[0_2px_12px_-4px_rgba(254,92,43,0.08)] hover:shadow-[0_4px_18px_-6px_rgba(254,92,43,0.14)]'}`}>
              <div className="flex flex-wrap items-center gap-1">
                <span className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider select-none ${isDark ? 'text-white/30' : 'text-neutral-400'}`}>
                  {group.label}
                </span>
                {group.tabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => tab.href ? navigate(tab.href) : setActiveTab(tab.key)}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${active ? 'bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white shadow-md shadow-[#FE5C2B]/25 -translate-y-px' : th.tabInactive}`}
                    >
                      <Icon size={15} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {activeTab === 'pontos' ? (
          <>
            <div className={`mb-4 rounded-xl border px-3 py-2 text-xs flex items-start gap-2 ${isDark ? 'border-brand-orange/30 bg-brand-orange/10 text-brand-orange' : 'border-[#FFCFB8] bg-[#FFF0EA] text-[#C94A1A]'}`}>
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                Importação por Excel: preencha o modelo e envie o arquivo em <strong>.xlsx</strong>, <strong>.xls</strong> ou <strong>.csv</strong>.
                Foto/imagem não é obrigatória no Excel e pode ser adicionada depois no sistema.
              </span>
            </div>

            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative w-full lg:max-w-md">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou cidade..."
                  className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <div className="w-full sm:w-52">
                  <CustomSelect
                    value={filterCidade === 'todas' ? '' : filterCidade}
                    onChange={(v) => setFilterCidade(v || 'todas')}
                    options={[
                      { value: '', label: 'Todas as cidades' },
                      ...Array.from(new Set([
                        ...cidades,
                        ...pontos.map((p) => p.cidade).filter(Boolean)
                      ]))
                        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
                        .map((c) => ({ value: c, label: c }))
                    ]}
                    placeholder="Todas as cidades"
                    isDark={isDark}
                  />
                </div>

                <div className="w-full sm:w-40">
                  <CustomSelect
                    value={filterStatus === 'todos' ? '' : filterStatus}
                    onChange={(v) => setFilterStatus(v || 'todos')}
                    options={[
                      { value: '', label: 'Todos os status' },
                      { value: 'ativo', label: 'Apenas ativos' },
                      { value: 'inativo', label: 'Apenas inativos' },
                    ]}
                    placeholder="Todos os status"
                    isDark={isDark}
                  />
                </div>
              </div>
            </div>

            {/* Formato chips — replaces simple select with count per format */}
            <div className="mb-4">
              <div className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-2 ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>
                Filtrar por formato
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFilterTipo('todos')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors min-h-[34px] ${
                    filterTipo === 'todos'
                      ? 'bg-brand-orange text-white border border-brand-orange'
                      : isDark
                        ? 'bg-white/[0.03] text-brand-gray-300 border border-white/10 hover:border-brand-orange/40 hover:text-white'
                        : 'bg-white text-neutral-700 border border-neutral-200 hover:border-brand-orange/40 hover:text-[#C94A1A] shadow-sm'
                  }`}
                >
                  Todos <span className="opacity-70">({pontos.length})</span>
                </button>
                {tipos.map((tipo) => {
                  const count = tiposContagem.get(tipo) || 0;
                  const active = filterTipo === tipo;
                  return (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setFilterTipo(active ? 'todos' : tipo)}
                      disabled={count === 0 && !active}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors min-h-[34px] ${
                        active
                          ? 'bg-brand-orange text-white border border-brand-orange'
                          : isDark
                            ? 'bg-white/[0.03] text-brand-gray-300 border border-white/10 hover:border-brand-orange/40 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed'
                            : 'bg-white text-neutral-700 border border-neutral-200 hover:border-brand-orange/40 hover:text-[#C94A1A] shadow-sm disabled:opacity-35 disabled:cursor-not-allowed'
                      }`}
                    >
                      {active && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                      {tipo} <span className="opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Applied filters bar */}
            {activeFiltersCount > 0 && (
              <div className={`mb-4 rounded-xl border p-3 flex flex-wrap items-center gap-2 ${
                isDark ? 'bg-brand-orange/[0.05] border-brand-orange/25' : 'bg-[#FFF0EA] border-[#FFCFB8]'
              }`}>
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-brand-orange' : 'text-[#C94A1A]'}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
                  {activeFiltersCount} filtro{activeFiltersCount > 1 ? 's' : ''} aplicado{activeFiltersCount > 1 ? 's' : ''}
                </span>
                <span className={`text-xs ${isDark ? 'text-white/40' : 'text-neutral-400'}`}>·</span>
                <span className={`text-xs font-medium ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>
                  {filtered.length} de {pontos.length} pontos
                </span>
                <button
                  type="button"
                  onClick={() => { setSearch(''); setFilterCidade('todas'); setFilterTipo('todos'); setFilterStatus('todos'); }}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full text-white bg-brand-orange hover:bg-[#E85A25] transition-colors"
                >
                  <X size={13} />
                  Limpar tudo
                </button>
              </div>
            )}

            <div className={`border rounded-2xl overflow-hidden ${isDark ? 'border-white/5' : 'border-neutral-200'}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={th.tableHead}>
                      {[
                        { key: 'nome', label: 'Nome', cls: '' },
                        { key: 'cidade', label: 'Cidade', cls: 'hidden md:table-cell' },
                        { key: 'tipo', label: 'Tipo', cls: 'hidden md:table-cell' },
                        { key: 'owner_tag', label: 'Origem', cls: 'hidden xl:table-cell' },
                        { key: 'telas', label: 'Telas', cls: 'hidden lg:table-cell' },
                      ].map((col) => {
                        const active = pontosSortKey === col.key;
                        return (
                          <th key={col.key} className={`text-left px-4 py-3 ${th.tableHeadText} font-medium text-xs ${col.cls}`}>
                            <button
                              type="button"
                              onClick={() => togglePontosSort(col.key)}
                              className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors ${active ? 'text-brand-orange' : (isDark ? 'hover:text-white' : 'hover:text-neutral-900')}`}
                            >
                              {col.label}
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.45 }}>
                                {active ? (
                                  pontosSortDir === 'asc'
                                    ? <polyline points="18 15 12 9 6 15"/>
                                    : <polyline points="6 9 12 15 18 9"/>
                                ) : (
                                  <><polyline points="7 15 12 20 17 15"/><polyline points="17 9 12 4 7 9"/></>
                                )}
                              </svg>
                            </button>
                          </th>
                        );
                      })}
                      <th className={`text-left px-4 py-3 ${th.tableHeadText} font-medium text-xs hidden lg:table-cell`}>Proporção</th>
                      <th className={`text-left px-4 py-3 ${th.tableHeadText} font-medium text-xs`}>
                        <button type="button" onClick={() => togglePontosSort('preco')} className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors ${pontosSortKey === 'preco' ? 'text-brand-orange' : (isDark ? 'hover:text-white' : 'hover:text-neutral-900')}`}>
                          Preço
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: pontosSortKey === 'preco' ? 1 : 0.45 }}>
                            {pontosSortKey === 'preco' ? (pontosSortDir === 'asc' ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>) : (<><polyline points="7 15 12 20 17 15"/><polyline points="17 9 12 4 7 9"/></>)}
                          </svg>
                        </button>
                      </th>
                      <th className={`text-left px-4 py-3 ${th.tableHeadText} font-medium text-xs hidden lg:table-cell`}>
                        <button type="button" onClick={() => togglePontosSort('ativo')} className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors ${pontosSortKey === 'ativo' ? 'text-brand-orange' : (isDark ? 'hover:text-white' : 'hover:text-neutral-900')}`}>
                          Status
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: pontosSortKey === 'ativo' ? 1 : 0.45 }}>
                            {pontosSortKey === 'ativo' ? (pontosSortDir === 'asc' ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>) : (<><polyline points="7 15 12 20 17 15"/><polyline points="17 9 12 4 7 9"/></>)}
                          </svg>
                        </button>
                      </th>
                      <th className={`text-right px-4 py-3 ${th.tableHeadText} font-medium text-xs`}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={9} className={`px-4 py-12 text-center ${th.sectionDesc}`}>Carregando...</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={9} className={`px-4 py-12 text-center ${th.sectionDesc}`}>Nenhum ponto encontrado</td></tr>
                    ) : filtered.map((p) => (
                      <tr key={p.id} className={`${th.tableRow} transition-colors ${!p.ativo ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg overflow-hidden shrink-0 ${th.thumbBg}`}>
                              {(p.imagem || p.imagem2) ? (
                                <img src={p.imagem || p.imagem2} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Building2 size={14} className="text-brand-gray-600" />
                                </div>
                              )}
                            </div>
                            <span className={`font-medium ${th.tableName}`}>{p.nome}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 ${th.tableCell} hidden md:table-cell`}>{p.cidade}</td>
                        <td className={`px-4 py-3 ${th.tableCell} hidden md:table-cell`}>
                          {p.tipo}{p.tipo === ELEVADOR_TIPO && p.elevador_categoria ? ` - ${p.elevador_categoria}` : ''}
                          {(p.tipo === 'Frontlight' || p.tipo === 'Backlight') && (
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              p.disponibilidade === 'indisponivel'
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-emerald-500/15 text-emerald-400'
                            }`}>
                              {p.disponibilidade === 'indisponivel' ? 'Indisp.' : 'Disp.'}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 ${th.tableCell} hidden xl:table-cell`}>{p.owner_tag || 'Intermídia'}</td>
                        <td className={`px-4 py-3 ${th.tableCell} hidden lg:table-cell`}>{p.telas}</td>
                        <td className={`px-4 py-3 ${th.tableCell} hidden lg:table-cell`}>{formatRatio(p.arte_largura, p.arte_altura) || '-'}</td>
                        <td className="px-4 py-3 text-brand-orange font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco)}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${th.badge(p.ativo)}`}>
                            {p.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(p)}
                              className={`p-2 rounded-lg transition-colors ${th.btnGhost}`}
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className={`p-2 rounded-lg transition-colors ${isDark ? 'text-brand-gray-400 hover:bg-white/10 hover:text-amber-400' : 'text-neutral-500 hover:bg-amber-50 hover:text-amber-600'}`}
                              title={Number(p.ativo) === 1 ? 'Desativar ponto (soft delete)' : 'Ponto já inativo'}
                              disabled={Number(p.ativo) !== 1}
                            >
                              <EyeOff size={14} />
                            </button>
                            {currentUser?.role === 'admin' && (
                              <button
                                onClick={() => handleHardDelete(p)}
                                className={`p-2 rounded-lg transition-colors ${isDark ? 'text-brand-gray-400 hover:bg-red-500/20 hover:text-red-400' : 'text-neutral-500 hover:bg-red-50 hover:text-red-600'}`}
                                title="Excluir permanentemente (admin)"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
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
          <>
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
              isDark={isDark}
            />

            {/* Census Audience Profile Analysis */}
            <section className={`mb-6 rounded-2xl border p-4 sm:p-5 ${th.card}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.sectionTitle}`}>Perfis Censitários (IBGE + OSM)</h3>
                  <p className={`text-xs mt-1 ${th.sectionDesc}`}>
                    Classifica os pontos por perfil de audiência (Alta Renda, Massa/Varejo, Jovem/Universitário, Terceira Idade)
                    usando dados do Censo 2022 (IBGE) e POIs do OpenStreetMap. Use &ldquo;Forçar Reanálise&rdquo; após atualizar pontos.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className={`text-xs ${th.lbl}`}>Cidade (deixe em branco para todas)</label>
                  <select
                    value={censusCidade}
                    onChange={(e) => setCensusCidade(e.target.value)}
                    className={`rounded-lg px-3 py-2 text-sm focus:outline-none ${th.inp}`}
                  >
                    <option value="">Todas as cidades</option>
                    {cidades.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => handleRunCensusAnalysis(false)}
                  disabled={censusBusy}
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-400 hover:bg-sky-500/25 disabled:opacity-50"
                >
                  {censusBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                  Analisar novos pontos
                </button>
                <button
                  type="button"
                  onClick={() => handleRunCensusAnalysis(true)}
                  disabled={censusBusy}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500/25 disabled:opacity-50"
                >
                  {censusBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                  Forçar Reanálise (aplicar novo algoritmo)
                </button>
              </div>
              {censusStatus && (
                <p className={`mt-3 text-xs ${censusStatus.startsWith('Erro') ? 'text-red-400' : 'text-sky-400'}`}>
                  {censusStatus}
                </p>
              )}
            </section>
          </>
        ) : null}

        {activeTab === 'arte_ia' ? (
          <section className={`rounded-2xl border p-4 sm:p-5 ${th.card}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.sectionTitle}`}>Métricas de geração de Arte IA</h3>
                <p className={`text-xs mt-1 ${th.sectionDesc}`}>
                  Total de gerações, custo acumulado e padrões de uso por resolução/ponto.
                </p>
              </div>
              <button
                type="button"
                onClick={loadArteStats}
                disabled={arteStatsLoading}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${isDark ? 'border-brand-orange/40 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
              >
                {arteStatsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                Atualizar
              </button>
            </div>

            {arteStatsError ? (
              <p className="mt-3 text-xs text-red-400">{arteStatsError}</p>
            ) : null}

            {!arteStatsLoading && !arteStatsError && arteStats ? (
              <>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                    <div className={`text-[11px] uppercase tracking-wide ${th.sectionDesc}`}>Total de gerações</div>
                    <div className={`mt-1 text-xl font-bold ${th.sectionTitle}`}>{Number(arteStats.total_geracoes || 0).toLocaleString('pt-BR')}</div>
                  </div>
                  <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                    <div className={`text-[11px] uppercase tracking-wide ${th.sectionDesc}`}>Custo total (USD)</div>
                    <div className={`mt-1 text-xl font-bold ${th.sectionTitle}`}>US$ {Number(arteStats.custo_total_usd || 0).toFixed(4)}</div>
                  </div>
                  <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                    <div className={`text-[11px] uppercase tracking-wide ${th.sectionDesc}`}>Custo médio (USD)</div>
                    <div className={`mt-1 text-xl font-bold ${th.sectionTitle}`}>US$ {Number(arteStats.custo_medio_usd || 0).toFixed(4)}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                    <h4 className={`text-xs font-semibold uppercase tracking-wide ${th.sectionTitle}`}>Resoluções mais geradas</h4>
                    <div className="mt-2 space-y-1.5">
                      {(arteStats.resolucoes_mais_usadas || []).length === 0 ? (
                        <p className={`text-xs ${th.sectionDesc}`}>Sem dados ainda.</p>
                      ) : (
                        (arteStats.resolucoes_mais_usadas || []).map((row) => (
                          <div key={row.res} className="flex items-center justify-between text-sm">
                            <span className={th.sectionTitle}>{row.res}</span>
                            <span className={th.sectionDesc}>{row.c} geração(ões)</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                    <h4 className={`text-xs font-semibold uppercase tracking-wide ${th.sectionTitle}`}>Pontos com mais regenerações</h4>
                    <div className="mt-2 space-y-1.5">
                      {(arteStats.pontos_mais_regenerados || []).length === 0 ? (
                        <p className={`text-xs ${th.sectionDesc}`}>Sem dados ainda.</p>
                      ) : (
                        (arteStats.pontos_mais_regenerados || []).map((row) => (
                          <div key={`${row.ponto_id}-${row.ponto_nome}`} className="flex items-center justify-between text-sm gap-2">
                            <span className={`truncate ${th.sectionTitle}`}>{row.ponto_nome || `Ponto ${row.ponto_id}`}</span>
                            <span className={`shrink-0 ${th.sectionDesc}`}>{row.total_geracoes}x</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'usuarios' ? (
          <UsersAdminPanel
            users={users}
            loading={usersLoading}
            error={usersError}
            onOpenNew={handleOpenNewUserModal}
            onOpenEdit={handleOpenEditUserModal}
            onDelete={handleDeleteUser}
            onUploadPhoto={handleUploadUserPhoto}
            userRoles={USER_ROLES}
            onReload={loadUsers}
            isDark={isDark}
          />
        ) : null}

        {activeTab === 'vendas' ? (
          <NovaVendaTab
            isDark={isDark}
            pontos={pontos.filter(p => Number(p.ativo) === 1)}
            currentUser={currentUser}
          />
        ) : null}

        {activeTab === 'historico_vendas' ? (
          <VendasListTab isDark={isDark} pontos={pontos.filter(p => Number(p.ativo) === 1)} currentUser={currentUser} />
        ) : null}

        {activeTab === 'auditoria_loop' ? (
          <AuditoriaLoopTab isDark={isDark} pontos={pontos} />
        ) : null}

        {activeTab === 'leads' ? (
          <LeadsTab isDark={isDark} />
        ) : null}

        {activeTab === 'favoritos' ? (
          <FavoritesAnalyticsTab isDark={isDark} />
        ) : null}

        {activeTab === 'propostas' ? (
          <PropostasTab isDark={isDark} />
        ) : null}

        {activeTab === 'whatsapp_logs' ? (
          <WhatsappLogsTab isDark={isDark} />
        ) : null}

        {activeTab === 'painel_tv' ? (
          <section className={`rounded-2xl border p-4 sm:p-5 ${th.card}`}>
            <div>
              <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.sectionTitle}`}>Painel TV</h3>
              <p className={`text-xs mt-1 ${th.sectionDesc}`}>Configure o Flash Intermidia e o grupo do WhatsApp que alimenta o mural do painel.</p>
            </div>

            <form onSubmit={handleSaveTvSettings} className="mt-5 space-y-4 max-w-3xl">
              <div>
                <label className={`block text-xs mb-1.5 ${th.lbl}`}>
                  Flash Intermidia (texto da faixa)
                </label>
                <input
                  className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                  value={tvTickerMessage}
                  onChange={e => setTvTickerMessage(e.target.value)}
                  placeholder="Texto exibido na faixa inferior do /painel-tv"
                />
              </div>

              <div>
                <label className={`block text-xs mb-1.5 ${th.lbl}`}>
                  Grupo WhatsApp do mural (JID)
                </label>
                <input
                  className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                  value={tvPostitGroupJid}
                  onChange={e => setTvPostitGroupJid(e.target.value)}
                  placeholder="120363XXXXXX@g.us"
                />
                <p className={`mt-1.5 text-xs ${th.sectionDesc}`}>
                  Mensagens recebidas nesse grupo viram post-its automaticamente no Painel TV.
                </p>
              </div>

              <button
                type="submit"
                disabled={tvSaving}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors ${isDark ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
              >
                {tvSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {tvSaving ? 'Salvando...' : 'Salvar Painel TV'}
              </button>

              {tvSaveMsg && (
                <p className={`text-xs mt-2 px-3 py-2 rounded-lg ${
                  tvSaveMsg.startsWith('Configurações')
                    ? `text-green-300 bg-green-500/10 border border-green-500/20`
                    : `text-red-300 bg-red-500/10 border border-red-500/20`
                }`}>
                  {tvSaveMsg}
                </p>
              )}
            </form>
          </section>
        ) : null}

        {activeTab === 'configuracoes' ? (
          <div className="space-y-5">
            <CidadeFotosAdmin />

            <section className={`rounded-2xl border p-4 sm:p-5 ${th.card}`}>
              <div>
                <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.sectionTitle}`}>Configurações do sistema</h3>
                <p className={`text-xs mt-1 ${th.sectionDesc}`}>Configure parâmetros globais para propostas e vendas.</p>
              </div>

              {settingsError && <p className="mt-3 text-xs text-red-300">{settingsError}</p>}

              <form onSubmit={handleSaveSettings} className="mt-6 space-y-4 max-w-md">
                <div>
                  <label className={`block text-xs mb-2 ${th.lbl}`}>
                    Lucro Mínimo Obrigatório (%)
                  </label>
                  <p className={`text-xs mb-2 ${th.sectionDesc}`}>
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
                      className={`flex-1 px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                    />
                    <button
                      type="submit"
                      disabled={savingSettings || settingsLoading}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${isDark ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
                    >
                      <Save size={15} />
                      {savingSettings ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </form>

              <div className={`mt-6 p-4 rounded-xl ${isDark ? 'bg-brand-orange/5 border border-brand-orange/20' : 'bg-orange-50 border border-orange-200'}`}>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-brand-orange' : 'text-orange-700'}`}>
                  <strong><Info size={12} className="inline mr-1" />Como funciona:</strong> Quando um vendedor tenta criar uma proposta com desconto que ultrapassa o lucro mínimo obrigatório (desconto acima do valor configurado aqui), a proposta fica aguardando aprovação de um Gerente Comercial antes de poder ser finalizada.
                </p>
              </div>
            </section>

            <section className={`rounded-2xl border p-4 sm:p-5 ${th.card}`}>
              <div>
                <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.sectionTitle}`}>Sincronizar horario via Google</h3>
                <p className={`text-xs mt-1 ${th.sectionDesc}`}>
                  Busca horario real pelo nome + coordenada de cada ponto. Sem horario no Google, sem escrita no banco.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className={`block text-xs mb-1.5 ${th.lbl}`}>Cidade (opcional)</label>
                  <input
                    type="text"
                    value={hoursSyncCity}
                    onChange={(event) => setHoursSyncCity(event.target.value)}
                    placeholder="Ex: Londrina"
                    className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none ${th.inp}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs mb-1.5 ${th.lbl}`}>Limite</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={hoursSyncLimit}
                    onChange={(event) => setHoursSyncLimit(Number(event.target.value))}
                    className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none ${th.inp}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs mb-1.5 ${th.lbl}`}>Raio (m)</label>
                  <input
                    type="number"
                    min="50"
                    max="2000"
                    step="10"
                    value={hoursSyncRadiusMeters}
                    onChange={(event) => setHoursSyncRadiusMeters(Number(event.target.value))}
                    className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none ${th.inp}`}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[220px_auto] md:items-end">
                <div>
                  <label className={`block text-xs mb-1.5 ${th.lbl}`}>Confianca minima</label>
                  <input
                    type="number"
                    min="0.2"
                    max="0.95"
                    step="0.01"
                    value={hoursSyncConfidence}
                    onChange={(event) => setHoursSyncConfidence(Number(event.target.value))}
                    className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none ${th.inp}`}
                  />
                </div>
                <label className={`inline-flex items-center gap-2 text-xs ${th.sectionDesc}`}>
                  <input
                    type="checkbox"
                    checked={hoursSyncOverwrite}
                    onChange={(event) => setHoursSyncOverwrite(Boolean(event.target.checked))}
                    className="h-4 w-4 rounded border-white/20 bg-black text-brand-orange focus:ring-brand-orange/40"
                  />
                  Sobrescrever horario existente (se desmarcado, atualiza apenas pontos sem horario)
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRunHoursSync(true)}
                  disabled={hoursSyncBusy}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${isDark ? 'border-blue-500/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25' : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                >
                  {hoursSyncBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                  Dry-run (sem salvar)
                </button>
                <button
                  type="button"
                  onClick={() => handleRunHoursSync(false)}
                  disabled={hoursSyncBusy}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${isDark ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
                >
                  {hoursSyncBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Executar e salvar
                </button>
              </div>

              {hoursSyncError ? <p className="mt-3 text-xs text-red-300">{hoursSyncError}</p> : null}

              {hoursSyncResult ? (
                <div className={`mt-4 rounded-xl border p-3 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50'}`}>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div>
                      <span className={th.sectionDesc}>Analisados</span>
                      <p className={`font-semibold ${th.tableName}`}>{Number(hoursSyncResult.summary?.totalProcessed || 0)}</p>
                    </div>
                    <div>
                      <span className={th.sectionDesc}>Atualizados</span>
                      <p className={`font-semibold ${th.tableName}`}>{Number(hoursSyncResult.summary?.updated || 0)}</p>
                    </div>
                    <div>
                      <span className={th.sectionDesc}>Com match</span>
                      <p className={`font-semibold ${th.tableName}`}>{Number(hoursSyncResult.summary?.matched || 0)}</p>
                    </div>
                    <div>
                      <span className={th.sectionDesc}>Sem alteracao</span>
                      <p className={`font-semibold ${th.tableName}`}>{Number(hoursSyncResult.summary?.skipped || 0)}</p>
                    </div>
                  </div>

                  <div className={`mt-3 max-h-72 overflow-auto rounded-lg border ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
                    <table className="w-full text-xs">
                      <thead className={`${isDark ? 'bg-white/[0.04] text-brand-gray-400' : 'bg-neutral-100 text-neutral-500'}`}>
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Ponto</th>
                          <th className="px-3 py-2 text-left font-medium">Acao</th>
                          <th className="px-3 py-2 text-left font-medium">Confianca</th>
                          <th className="px-3 py-2 text-left font-medium">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(hoursSyncResult.results) ? hoursSyncResult.results : []).slice(0, 120).map((row) => (
                          <tr key={`${row.pointId}-${row.pointName}`} className={`border-t ${isDark ? 'border-white/10 text-white/90' : 'border-neutral-200 text-neutral-800'}`}>
                            <td className="px-3 py-2">{row.pointName}</td>
                            <td className="px-3 py-2">{row.action || '-'}</td>
                            <td className="px-3 py-2">{typeof row.matchConfidence === 'number' ? row.matchConfidence.toFixed(3) : '-'}</td>
                            <td className={`px-3 py-2 ${th.sectionDesc}`}>{row.reason || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </section>

            <section className={`rounded-2xl border p-4 sm:p-5 ${th.card}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.sectionTitle}`}>PDF tecnico por pontos</h3>
                  <p className={`text-xs mt-1 ${th.sectionDesc}`}>Escolha os pontos e exporte o arquivo "Informacoes Tecnicas Intermidia" com foto, nome, resolucao e especificacoes de entrega.</p>
                </div>
                {/* Split button: generate + format picker */}
                <div className="relative flex-shrink-0" ref={technicalPdfFormatPickerRef}>
                  <div className={`flex rounded-xl overflow-hidden border ${technicalPdfBusy || !technicalPdfSelectedPoints.length ? 'opacity-50 pointer-events-none' : ''} ${isDark ? 'border-brand-orange/40' : 'border-orange-300'}`}>
                    {/* Main button */}
                    <button
                      type="button"
                      onClick={() => handleGenerateTechnicalPdf()}
                      disabled={technicalPdfBusy || !technicalPdfSelectedPoints.length}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${isDark ? 'bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
                    >
                      {technicalPdfBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                      {technicalPdfBusy
                        ? 'Processando PDF...'
                        : technicalPdfFormat === 'mobile' ? 'Gerar PDF mobile' : 'Gerar PDF tecnico'}
                    </button>
                    {/* Format toggle */}
                    <button
                      type="button"
                      onClick={() => setShowTechnicalPdfFormatPicker((v) => !v)}
                      disabled={technicalPdfBusy || !technicalPdfSelectedPoints.length}
                      className={`px-2.5 text-sm ${isDark ? 'border-l border-brand-orange/25 bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25' : 'border-l border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
                      aria-label="Escolher formato"
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                        <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>

                  {/* Dropdown */}
                  {showTechnicalPdfFormatPicker && (
                    <div className={`absolute right-0 mt-1.5 w-64 z-50 rounded-xl shadow-xl overflow-hidden border ${isDark ? 'bg-[#1A1A1A] border-white/10' : 'bg-white border-neutral-200'}`}>
                      {[
                        { value: 'desktop', label: 'Versão padrão', sub: 'Layout 16:9 — desktop' },
                        { value: 'mobile', label: 'Versão mobile', sub: 'Layout 9:16 — celular' },
                      ].map(({ value, label, sub }) => {
                        const sel = technicalPdfFormat === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => { setTechnicalPdfFormat(value); handleGenerateTechnicalPdf(value); }}
                            className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${sel ? (isDark ? 'bg-brand-orange/10 text-brand-orange' : 'bg-orange-50 text-orange-700') : (isDark ? 'text-white hover:bg-white/5' : 'text-neutral-700 hover:bg-neutral-50')}`}
                          >
                            <span className="flex-1">
                              <span className="block font-semibold">{label}</span>
                              <span className={`block text-xs mt-0.5 ${isDark ? 'text-white/40' : 'text-neutral-400'}`}>{sub}</span>
                            </span>
                            {sel && <Download size={13} className={isDark ? 'text-brand-orange' : 'text-orange-500'} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto_auto]">
                <input
                  type="text"
                  value={technicalPdfSearch}
                  onChange={(event) => setTechnicalPdfSearch(event.target.value)}
                  placeholder="Buscar ponto por nome, cidade ou tipo..."
                  className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none ${th.inp}`}
                />
                <select
                  value={technicalPdfCityFilter}
                  onChange={(event) => setTechnicalPdfCityFilter(event.target.value)}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none ${th.inp}`}
                >
                  <option value="todas" className={th.selectOpt}>Todas as cidades</option>
                  {cidades.map((cidade) => (
                    <option key={cidade} value={cidade} className={th.selectOpt}>{cidade}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSelectAllTechnicalFiltered}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${th.btnOutline}`}
                >
                  <CheckSquare size={14} />
                  Selecionar filtrados
                </button>
                <button
                  type="button"
                  onClick={handleClearTechnicalSelection}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${th.btnOutline}`}
                >
                  <Square size={14} />
                  Limpar
                </button>
              </div>

              <div className={`mt-4 rounded-xl border p-3 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50'}`}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className={`inline-flex items-center gap-1.5 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                    <FileText size={14} className="text-brand-orange" />
                    {technicalPdfSelectedPoints.length} ponto(s) selecionado(s)
                  </span>
                  {technicalPdfStatus ? (
                    <span className={`text-brand-orange`}>{technicalPdfStatus}</span>
                  ) : (
                    <span className={th.sectionDesc}>Este processo pode levar alguns segundos.</span>
                  )}
                </div>

                <div className={`mt-3 max-h-72 overflow-auto rounded-lg border ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
                  {technicalPdfCandidates.length ? (
                    <ul className={`divide-y ${th.divider}`}>
                      {technicalPdfCandidates.map((point) => {
                        const checked = technicalPdfSelectedIds.includes(Number(point.id));
                        return (
                          <li key={point.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                            <label className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 ${th.tableName}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleTechnicalPoint(point.id)}
                                className="h-4 w-4 rounded border-white/20 bg-black text-brand-orange focus:ring-brand-orange/40"
                              />
                              <span className="min-w-0 truncate">{point.nome}</span>
                            </label>
                            <span className={`text-xs ${th.tableCell}`}>{point.cidade} • {point.tipo}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className={`px-3 py-6 text-center text-xs ${th.sectionDesc}`}>Nenhum ponto encontrado para esse filtro.</p>
                  )}
                </div>
              </div>
            </section>

            <section className={`rounded-2xl border p-4 sm:p-5 ${th.card}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.sectionTitle}`}>Cache de PDFs</h3>
                  <p className={`text-xs mt-1 ${th.sectionDesc}`}>Controle de combinações de cidades e validade dos PDFs em cache.</p>
                </div>
                <button
                  type="button"
                  onClick={loadPdfCache}
                  disabled={pdfCacheLoading}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs disabled:opacity-50 ${th.btnOutline}`}
                >
                  <RefreshCcw size={14} className={pdfCacheLoading ? 'animate-spin' : ''} />
                  Atualizar
                </button>
              </div>

              {pdfCacheError ? <p className="mt-3 text-xs text-red-300">{pdfCacheError}</p> : null}

              <div className={`mt-4 overflow-x-auto rounded-xl border ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
                <table className="w-full text-sm">
                  <thead className={`${isDark ? 'bg-white/[0.04] text-brand-gray-400' : 'bg-neutral-50 text-neutral-500'}`}>
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
                        <td colSpan={7} className={`px-3 py-6 text-center ${th.sectionDesc}`}>Nenhum PDF em cache.</td>
                      </tr>
                    ) : (
                      pdfCacheRows.map((row) => {
                        const valid = Number(row.is_valid) === 1;
                        return (
                          <tr key={row.id} className={`border-t ${isDark ? 'border-white/10 text-white/90' : 'border-neutral-100 text-neutral-800'}`}>
                            <td className="px-3 py-2 font-mono text-xs">{row.combination_key}</td>
                            <td className={`px-3 py-2 text-xs ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{formatCityList(row.city_slugs)}</td>
                            <td className="px-3 py-2 text-xs">{formatCacheSize(row.file_size_kb)}</td>
                            <td className="px-3 py-2 text-xs">{formatDateBr(row.generated_at)}</td>
                            <td className="px-3 py-2 text-xs">{Number(row.download_count || 0)}</td>
                            <td className="px-3 py-2 text-xs">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 ${valid
                                ? (isDark ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-green-200 bg-green-50 text-green-700')
                                : (isDark ? 'border-white/15 bg-white/5 text-brand-gray-400' : 'border-neutral-200 bg-neutral-50 text-neutral-500')}`}>
                                {valid ? 'Valido' : 'Invalido'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {valid ? (
                                <button
                                  type="button"
                                  onClick={() => handleInvalidatePdfCache(row.id)}
                                  disabled={invalidatingCacheId === row.id}
                                  className={`rounded-md border px-2 py-1 disabled:opacity-50 ${th.btnOutline}`}
                                >
                                  {invalidatingCacheId === row.id ? 'Invalidando...' : 'Invalidar'}
                                </button>
                              ) : (
                                <span className={th.sectionDesc}>-</span>
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

            {/* WAHA — WhatsApp */}
            <section className={`rounded-2xl border p-4 sm:p-5 ${th.card}`}>
              <div className="flex items-center gap-2 mb-1">
                <Zap size={15} className="text-brand-orange" />
                <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.sectionTitle}`}>
                  Integração WhatsApp — WAHA
                </h3>
              </div>
              <p className={`text-xs mb-5 ${th.sectionDesc}`}>
                Configure aqui os dados do WAHA para disparo automático de notificações de nova venda.
                Preencha e salve antes de usar a aba <strong className={th.lbl}>Nova Venda</strong>.
              </p>

              {evoSaveMsg && (
                <p className={`text-xs mb-4 rounded-xl px-3 py-2 border ${evoSaveMsg.startsWith('Erro')
                  ? 'text-red-300 bg-red-500/10 border-red-500/20'
                  : 'text-green-300 bg-green-500/10 border-green-500/20'}`}>
                  {evoSaveMsg}
                </p>
              )}

              <form onSubmit={handleSaveEvoSettings} className="space-y-4 max-w-lg">
                <div>
                  <label className={`block text-xs mb-1.5 ${th.lbl}`}>URL da API</label>
                  <input
                    type="url"
                    className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                    value={evoApiUrl}
                    onChange={e => setEvoApiUrl(e.target.value)}
                    placeholder="https://midiakit.redeintermidia.com/waha"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs mb-1.5 ${th.lbl}`}>Instância (vendas / avisos)</label>
                    <input
                      className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                      value={evoInstance}
                      onChange={e => setEvoInstance(e.target.value)}
                      placeholder="intermidia"
                    />
                    <p className={`mt-1.5 text-xs ${th.sectionDesc}`}>Usada para notificações de vendas e grupos internos.</p>
                  </div>
                  <div>
                    <label className={`block text-xs mb-1.5 ${th.lbl}`}>API Key</label>
                    <input
                      type="password"
                      className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                      value={evoApiKey}
                      onChange={e => setEvoApiKey(e.target.value)}
                      placeholder="••••••••••••"
                    />
                  </div>
                </div>
                <div>
                  <label className={`block text-xs mb-1.5 ${th.lbl}`}>Instância — Envio de PDF Técnico</label>
                  <input
                    className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                    value={evoPdfInstance}
                    onChange={e => setEvoPdfInstance(e.target.value)}
                    placeholder="aux adm"
                  />
                  <p className={`mt-1.5 text-xs ${th.sectionDesc}`}>
                    Instância usada para disparar os PDFs técnicos ao cliente após a venda. Se vazio, usa a instância principal acima.
                  </p>
                </div>
                <div>
                  <label className={`block text-xs mb-1.5 ${th.lbl}`}>
                    Número / Grupo de destino
                  </label>
                  <input
                    className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                    value={evoDestNumber}
                    onChange={e => setEvoDestNumber(e.target.value)}
                    placeholder="5543999999999 ou ID do grupo"
                  />
                  <p className={`mt-1.5 text-xs ${th.sectionDesc}`}>
                    Para número individual use o formato: 55 + DDD + número (ex: 5543999990000).
                    Para grupos, use o ID do grupo com @g.us (ex: 120363XXXXXX@g.us).
                  </p>
                </div>
                <div>
                  <label className={`block text-xs mb-1.5 ${th.lbl}`}>
                    Número do Financeiro (lembrete semanal)
                  </label>
                  <input
                    className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                    value={evoFinanceiroNumber}
                    onChange={e => setEvoFinanceiroNumber(e.target.value)}
                    placeholder="5543999990000"
                  />
                  <p className={`mt-1.5 text-xs ${th.sectionDesc}`}>
                    Toda segunda-feira às 08:30 será enviado um lembrete com os contratos pendentes de assinatura.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={evoSaving}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors ${isDark ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
                >
                  {evoSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {evoSaving ? 'Salvando...' : 'Salvar configuração'}
                </button>
                <button
                  type="button"
                  onClick={handleTestFinanceiroReminder}
                  disabled={evoTestLoading || !evoFinanceiroNumber}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors ${isDark ? 'border-blue-500/40 bg-blue-500/15 text-blue-400 hover:bg-blue-500/25' : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                >
                  {evoTestLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {evoTestLoading ? 'Enviando...' : 'Testar lembrete'}
                </button>
                {evoTestMsg && (
                  <p className={`text-xs mt-2 px-3 py-2 rounded-lg ${
                    evoTestMsg.startsWith('✓')
                      ? `text-green-300 bg-green-500/10 border border-green-500/20`
                      : `text-red-300 bg-red-500/10 border border-red-500/20`
                  }`}>
                    {evoTestMsg}
                  </p>
                )}
              </form>

              {/* ── Teste de envio de PDF técnico ── */}
              <div className={`mt-6 pt-6 border-t ${isDark ? 'border-white/8' : 'border-neutral-200'}`}>
                <h4 className={`text-xs font-semibold uppercase tracking-wide mb-1 ${th.sectionTitle}`}>
                  Testar envio de PDF técnico
                </h4>
                <p className={`text-xs mb-4 ${th.sectionDesc}`}>
                  Gera os PDFs técnicos com os primeiros pontos cadastrados e envia para o número informado.
                  Não registra venda nem notifica o grupo interno.
                </p>
                <div className="flex gap-2 max-w-lg">
                  <input
                    type="tel"
                    value={pdfTestPhone}
                    onChange={e => setPdfTestPhone(e.target.value)}
                    placeholder="5543999999999 (DDI+DDD+número)"
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${th.inp}`}
                  />
                  <button
                    type="button"
                    onClick={handleTestPdfWhatsapp}
                    disabled={pdfTestLoading || !pdfTestPhone.trim()}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors flex-shrink-0 ${isDark ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
                  >
                    {pdfTestLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    {pdfTestLoading ? 'Enviando...' : 'Enviar teste'}
                  </button>
                </div>

                {(pdfTestLog.length > 0 || pdfTestError) && (
                  <div className={`mt-3 rounded-xl p-3 text-xs font-mono space-y-1 max-w-lg ${isDark ? 'bg-black/30 border border-white/8' : 'bg-neutral-50 border border-neutral-200'}`}>
                    {pdfTestLog.map((line, i) => (
                      <div key={i} className={line.startsWith('ERRO') ? 'text-red-400' : isDark ? 'text-green-400' : 'text-green-700'}>
                        {line.startsWith('ERRO') ? '✗' : '✓'} {line}
                      </div>
                    ))}
                    {pdfTestError && (
                      <div className="text-red-400">✗ {pdfTestError}</div>
                    )}
                  </div>
                )}
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
        isDark={isDark}
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
              className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto border rounded-2xl p-6 ${isDark ? 'bg-brand-dark border-white/10' : 'bg-white border-neutral-200 shadow-xl'}`}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">
                  {editing === 'new' ? 'Novo Ponto' : 'Editar Ponto'}
                </h2>
                <button
                  onClick={() => setEditing(null)}
                  className={`p-2 rounded-lg transition-colors ${th.btnGhost}`}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Nome *" value={form.nome} onChange={v => updateField('nome', v)} required />
                  <FormSelect label="Cidade" value={form.cidade} onChange={v => updateField('cidade', v)} options={cidades} />
                  <FormSelect label="Tipo" value={form.tipo} onChange={v => updateField('tipo', v)} options={tipos} />
                  <FormCombo label="Origem do ponto (interno)" value={form.owner_tag || 'Intermídia'} onChange={v => updateField('owner_tag', v)} options={POINT_OWNER_OPTIONS} placeholder="Digite ou selecione" />
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
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-purple/50 ${th.inp}`}
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
                  <div className="md:col-span-2">
                    <label className={`block text-xs mb-1.5 ${th.lbl}`}>Horário</label>
                    <textarea
                      value={form.horario}
                      onChange={e => updateField('horario', e.target.value)}
                      rows={2}
                      placeholder="Ex: 09h às 21h de sexta a terça-feira - Às quintas-feiras, o horário é reduzido, iniciando às 14h e encerrando às 21h"
                      className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors resize-y ${th.inp}`}
                    />
                    {form.horario && (
                      <div className={`mt-1.5 flex items-start gap-2 text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                        <span className="shrink-0 font-semibold mt-px">Preview PDF:</span>
                        <span className={`font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          {normalizeHorarioForPdf(form.horario)}
                        </span>
                      </div>
                    )}
                  </div>
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
                  {form.tipo === 'Frontlight' || form.tipo === 'Backlight' ? (
                    <>
                      <FormField label="Largura fisica (m)" value={form.midia_largura_m} onChange={v => updateField('midia_largura_m', v)} type="number" step="0.01" min="0" />
                      <FormField label="Altura fisica (m)" value={form.midia_altura_m} onChange={v => updateField('midia_altura_m', v)} type="number" step="0.01" min="0" />
                      <div className="md:col-span-2">
                        <label className={`block text-xs mb-1.5 ${th.lbl}`}>Disponibilidade</label>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => updateField('disponibilidade', 'disponivel')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                              form.disponibilidade === 'disponivel'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : isDark ? 'bg-white/5 text-brand-gray-500 border border-white/10' : 'bg-neutral-100 text-neutral-400 border border-neutral-200'
                            }`}
                          >
                            <Check size={14} /> Disponível
                          </button>
                          <button
                            type="button"
                            onClick={() => updateField('disponibilidade', 'indisponivel')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                              form.disponibilidade === 'indisponivel'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                                : isDark ? 'bg-white/5 text-brand-gray-500 border border-white/10' : 'bg-neutral-100 text-neutral-400 border border-neutral-200'
                            }`}
                          >
                            <X size={14} /> Indisponível
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>

                <div>
                  <label className="block text-xs text-brand-gray-400 mb-1.5">Descrição</label>
                  <textarea
                    value={form.descricao}
                    onChange={e => updateField('descricao', e.target.value)}
                    rows={3}
                    className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors resize-none ${th.inp}`}
                  />
                </div>

                {/* Image upload */}
                <div>
                  <label className={`block text-xs mb-1.5 ${th.lbl}`}>Imagem</label>
                  <div className="flex items-center gap-4">
                    <label className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm cursor-pointer transition-colors ${th.btnOutline}`}>
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
                  <label className={`block text-xs mb-1.5 ${th.lbl}`}>Imagem 2 <span className={th.sectionDesc}>(opcional — segunda foto para Elevador)</span></label>
                  <div className="flex items-center gap-4">
                    <label className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm cursor-pointer transition-colors ${th.btnOutline}`}>
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

                <section className={`rounded-xl border p-4 space-y-4 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-neutral-50'}`}>
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
                          <div className={`inline-flex rounded-lg border p-1 ${isDark ? 'border-white/10 bg-white/5' : 'border-neutral-200 bg-neutral-50'}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setSimulationFaceCount(1);
                                setActiveSimulationFace(0);
                              }}
                              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${simulationFaceCount === 1 ? 'bg-brand-orange text-white' : th.tabInactive}`}
                            >
                              1 face
                            </button>
                            <button
                              type="button"
                              onClick={() => setSimulationFaceCount(2)}
                              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${simulationFaceCount === 2 ? 'bg-brand-orange text-white' : th.tabInactive}`}
                            >
                              2 faces
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveSimulationFace(0)}
                            className={`rounded-lg border px-3 py-2 text-xs transition-colors ${activeSimulationFace === 0 ? (isDark ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange' : 'border-orange-300 bg-orange-50 text-orange-700') : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}`}
                          >
                            Face 1
                          </button>
                          {simulationFaceCount === 2 ? (
                            <button
                              type="button"
                              onClick={() => setActiveSimulationFace(1)}
                              className={`rounded-lg border px-3 py-2 text-xs transition-colors ${activeSimulationFace === 1 ? (isDark ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange' : 'border-orange-300 bg-orange-50 text-orange-700') : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}`}
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
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-brand-orange/15 text-brand-orange' : 'bg-orange-50 text-orange-700'}`}>
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

      {/* System notice modal (replaces native alerts) */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setNotice(null)}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl border shadow-2xl ${
                isDark
                  ? 'bg-brand-gray-900 border-white/10 text-white'
                  : 'bg-white border-neutral-200 text-neutral-900'
              }`}
            >
              <div className="flex items-start gap-3 p-5">
                <div
                  className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    notice.type === 'success'
                      ? (isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-600')
                      : notice.type === 'info'
                        ? (isDark ? 'bg-sky-500/15 text-sky-300' : 'bg-sky-50 text-sky-600')
                        : (isDark ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-600')
                  }`}
                >
                  {notice.type === 'success' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  ) : notice.type === 'info' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold leading-tight">
                    {notice.title || (
                      notice.type === 'success' ? 'Tudo certo'
                        : notice.type === 'info' ? 'Aviso'
                        : 'Não foi possível concluir'
                    )}
                  </h3>
                  <p className={`mt-1 text-sm whitespace-pre-line ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                    {notice.message}
                  </p>
                </div>
              </div>
              <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50'} rounded-b-2xl`}>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange/90 text-white text-sm font-semibold shadow-sm transition-colors"
                >
                  Entendi
                </button>
              </div>
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
  const dark = typeof window !== 'undefined' && localStorage.getItem('intermidia_theme') === 'dark';
  return (
    <div className={className}>
      <label className={`block text-xs mb-1.5 ${dark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${dark
          ? 'bg-white/5 border border-white/10 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/40'
          : 'bg-white border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/60'}`}
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
  jobs,
  isDark = true
}) {
  const currentStatus = String(currentJob?.status || '').toLowerCase();
  const processing = currentStatus === 'queued' || currentStatus === 'running';

  return (
    <section className={`mb-6 rounded-2xl border p-4 sm:p-5 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-white shadow-sm'}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className={`text-sm font-semibold uppercase tracking-wide ${isDark ? 'text-white' : 'text-neutral-900'}`}>Análise de entorno</h3>
          <p className={`text-xs mt-1 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Reprocessamento manual por segmento e cidade, com fila assíncrona e monitoramento de jobs.</p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50 ${isDark ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
          {busy ? 'Enfileirando...' : 'Reprocessar agora'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className={`block text-xs mb-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>Segmento</label>
          <select
            value={form.segmento}
            onChange={(e) => setForm((prev) => ({ ...prev, segmento: e.target.value }))}
            className={`w-full rounded-xl px-3 py-2 text-sm ${isDark ? 'border border-white/10 bg-white/5 text-white' : 'border border-neutral-200 bg-white text-neutral-900'}`}
          >
            {ENTORNO_SEGMENTOS.map((segmento) => (
              <option key={segmento} value={segmento} className={isDark ? 'bg-brand-dark' : 'bg-white'}>{segmento}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-xs mb-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>Cidade</label>
          <select
            value={form.cidade}
            onChange={(e) => setForm((prev) => ({ ...prev, cidade: e.target.value }))}
            className={`w-full rounded-xl px-3 py-2 text-sm ${isDark ? 'border border-white/10 bg-white/5 text-white' : 'border border-neutral-200 bg-white text-neutral-900'}`}
          >
            <option value="" className={isDark ? 'bg-brand-dark' : 'bg-white'}>Todas</option>
            {cidades.map((cidade) => (
              <option key={cidade} value={cidade} className={isDark ? 'bg-brand-dark' : 'bg-white'}>{cidade}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-xs mb-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>Raio (m)</label>
          <input
            type="number"
            min={200}
            max={2000}
            step={50}
            value={form.raio}
            onChange={(e) => setForm((prev) => ({ ...prev, raio: Number(e.target.value) || 800 }))}
            className={`w-full rounded-xl px-3 py-2 text-sm ${isDark ? 'border border-white/10 bg-white/5 text-white' : 'border border-neutral-200 bg-white text-neutral-900'}`}
          />
        </div>

        <div className={`rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-black/20 text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-600'}`}>
          <p className={`font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Provedores</p>
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

      <div className={`mt-3 rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-black/20 text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-600'}`}>
        <p className={`font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Categorias do segmento</p>
        <p>{categories.length ? categories.join(', ') : 'Nenhuma categoria configurada para este segmento.'}</p>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-300">{error}</p>
      )}

      {currentJob && (
        <div className={`mt-3 rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-black/20 text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-600'}`}>
          <p className={`font-semibold uppercase tracking-wide ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Job atual #{currentJob.id}</p>
          <p className="mt-1">Status: <span className={processing ? 'text-brand-orange' : currentStatus === 'failed' ? 'text-red-300' : 'text-green-300'}>{currentJob.status}</span></p>
          <p className="mt-1">Processados: {currentJob.processed_points || 0}/{currentJob.total_points || 0} • Erros: {currentJob.error_count || 0}</p>
          {currentJob.last_error && <p className="mt-1 text-red-300">Último erro: {currentJob.last_error}</p>}
        </div>
      )}

      <div className={`mt-3 overflow-x-auto rounded-xl border ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
        <table className="w-full text-xs">
          <thead>
            <tr className={`text-left ${isDark ? 'bg-white/[0.03] text-brand-gray-400' : 'bg-neutral-50 text-neutral-500'}`}>
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
  onUploadPhoto,
  userRoles,
  onReload,
  isDark = true
}) {
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-white shadow-sm'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className={`text-sm font-semibold uppercase tracking-wide ${isDark ? 'text-white' : 'text-neutral-900'}`}>Cadastro de usuários admin</h3>
          <p className={`text-xs mt-1 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Gerencie quem pode acessar o painel administrativo e defina permissões.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenNew}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${isDark ? 'border-[#E8591A]/40 bg-[#E8591A]/15 text-[#E8591A] hover:bg-[#E8591A]/25' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
          >
            <UserPlus size={15} />
            Adicionar Usuário
          </button>
          <button
            type="button"
            onClick={onReload}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${isDark ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
          >
            <RefreshCcw size={15} />
            Atualizar lista
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}

      <div className={`mt-4 overflow-x-auto rounded-xl border ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
        <table className="w-full text-xs">
          <thead>
            <tr className={`text-left ${isDark ? 'bg-white/[0.03] text-brand-gray-400' : 'bg-neutral-50 text-neutral-500'}`}>
              <th className="px-3 py-2">Foto</th>
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
                <td colSpan={6} className={`px-3 py-4 text-center ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Carregando usuários...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className={`px-3 py-4 text-center ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Nenhum usuário cadastrado.</td>
              </tr>
            ) : users.map((user) => (
              <tr key={user.id} className={`border-t ${isDark ? 'border-white/5 text-brand-gray-300' : 'border-neutral-100 text-neutral-600'}`}>
                <td className="px-3 py-2">
                  <label className="relative cursor-pointer group">
                    {user.photo_url ? (
                      <img src={user.photo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-white/10 group-hover:border-brand-orange transition-colors" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isDark ? 'bg-brand-orange/20 text-brand-orange' : 'bg-orange-100 text-orange-700'} group-hover:ring-2 ring-brand-orange transition-all`}>
                        {(user.first_name?.[0] || user.username?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { if (e.target.files?.[0]) onUploadPhoto(user.id, e.target.files[0]); e.target.value = ''; }} />
                  </label>
                </td>
                <td className="px-3 py-2">
                  <div className={`font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>{[user.first_name, user.last_name].filter(Boolean).join(' ') || 'Sem nome'}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{user.username}</div>
                  {user.email ? <div className="text-[11px] text-brand-gray-500">{user.email}</div> : null}
                </td>
                <td className="px-3 py-2">
                  <div>{user.whatsapp || '-'}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-1 rounded-lg text-xs ${isDark ? 'bg-brand-orange/10 text-brand-orange' : 'bg-orange-50 text-orange-700'}`}>
                    {userRoles.find(r => r.value === user.role)?.label || user.role}
                  </span>
                  {user.is_vendedor ? (
                    <span className={`ml-1 inline-block px-2 py-1 rounded-lg text-xs ${isDark ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-700'}`}>
                      Vendedor
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() => onOpenEdit(user)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${isDark ? 'text-brand-gray-400 hover:bg-white/10' : 'text-neutral-500 hover:bg-neutral-100'}`}
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(user.id, user.username)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${isDark ? 'text-red-300 hover:bg-red-400/10' : 'text-red-600 hover:bg-red-50'}`}
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

      <div className={`mt-4 p-4 rounded-xl text-xs ${isDark ? 'bg-brand-orange/5 border border-brand-orange/20 text-brand-gray-300' : 'bg-orange-50 border border-orange-200 text-neutral-600'}`}>
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
  const dark = typeof window !== 'undefined' && localStorage.getItem('intermidia_theme') === 'dark';
  return (
    <div>
      <label className={`block text-xs mb-1.5 ${dark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors appearance-none ${dark
          ? 'bg-white/5 border border-white/10 text-white focus:border-brand-orange/40'
          : 'bg-white border border-neutral-200 text-neutral-900 focus:border-brand-orange/60'}`}
      >
        {options.map(o => <option key={o} value={o} className={dark ? 'bg-brand-dark' : 'bg-white text-neutral-900'}>{o}</option>)}
      </select>
    </div>
  );
}

// Combobox: list with predefined suggestions but allows typing custom values.
function FormCombo({ label, value, onChange, options, placeholder }) {
  const dark = typeof window !== 'undefined' && localStorage.getItem('intermidia_theme') === 'dark';
  const listId = `combo-${(label || 'opt').replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label className={`block text-xs mb-1.5 ${dark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>{label}</label>
      <input
        list={listId}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        className={`w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors ${dark
          ? 'bg-white/5 border border-white/10 text-white placeholder:text-brand-gray-500 focus:border-brand-orange/40'
          : 'bg-white border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/60'}`}
      />
      <datalist id={listId}>
        {(options || []).map(o => <option key={o} value={o} />)}
      </datalist>
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

function WelcomePopup({ data, isDark, onClose, onGoToGestao }) {
  const { nome, pct, realizado, meta } = data;
  const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
  const primeiroNome = String(nome || '').split(' ')[0] || 'chefe';
  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  let frase;
  let emoji;
  if (meta <= 0) {
    frase = 'A meta mensal ainda não foi cadastrada — que tal já começar faturando?';
    emoji = '🚀';
  } else if (pct >= 100) {
    frase = `Meta batida: ${pct}% conquistados! Vamos passar dos 120%?`;
    emoji = '🏆';
  } else if (pct >= 75) {
    frase = `Você já está com ${pct}% da meta. Falta pouco, bora fechar!`;
    emoji = '🔥';
  } else if (pct >= 40) {
    frase = `A meta mensal está ${pct}% concluída. Ritmo bom, bora acelerar!`;
    emoji = '⚡';
  } else if (pct > 0) {
    frase = `A meta mensal está ${pct}% concluída. Bora vender, ${primeiroNome}!`;
    emoji = '💪';
  } else {
    frase = `Meta mensal zerada por enquanto. Bora abrir o mês com chave de ouro!`;
    emoji = '✨';
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`relative w-full max-w-md rounded-3xl border overflow-hidden shadow-2xl ${
          isDark
            ? 'border-white/10 bg-gradient-to-br from-[#1A0F0A] via-[#231610] to-[#1A0F0A]'
            : 'border-[#FFD9C6] bg-gradient-to-br from-white via-[#FFF8F3] to-[#FFEAD8]'
        }`}
      >
        <div className="pointer-events-none absolute -right-24 -top-24 w-72 h-72 rounded-full" style={{ background: 'radial-gradient(circle, rgba(254,92,43,0.22) 0%, transparent 70%)' }} />
        <div className="pointer-events-none absolute -left-16 -bottom-16 w-56 h-56 rounded-full" style={{ background: 'radial-gradient(circle, rgba(254,92,43,0.14) 0%, transparent 70%)' }} />

        <button
          type="button"
          onClick={onClose}
          className={`absolute top-4 right-4 z-20 rounded-lg p-1.5 transition-colors ${isDark ? 'text-brand-gray-400 hover:bg-white/10 hover:text-white' : 'text-neutral-500 hover:bg-white hover:text-neutral-800'}`}
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        <div className="relative p-7">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FE5C2B] to-[#C94A1A] text-3xl shadow-lg shadow-[#FE5C2B]/30">
              {emoji}
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-brand-orange/80' : 'text-[#C94A1A]'}`}>Bem-vindo de volta</p>
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                {saudacao}, {primeiroNome}!
              </h2>
            </div>
          </div>

          <p className={`text-[15px] leading-relaxed ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>
            {frase}
          </p>

          {meta > 0 && (
            <div className="mt-5">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Progresso do mês</span>
                <span className={`text-lg font-bold ${pct >= 100 ? 'text-green-500' : isDark ? 'text-white' : 'text-[#C94A1A]'}`}>{pct}%</span>
              </div>
              <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-white'}`}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                  className={`h-full ${pct >= 100 ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A]'}`}
                />
              </div>
              <div className={`flex justify-between text-xs mt-2 ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                <span>Realizado: <strong className={isDark ? 'text-white' : 'text-neutral-900'}>{fmtBRL(realizado)}</strong></span>
                <span>Meta: <strong className={isDark ? 'text-white' : 'text-neutral-900'}>{fmtBRL(meta)}</strong></span>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={onGoToGestao}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] py-2.5 px-4 text-sm font-semibold text-white shadow-lg shadow-[#FE5C2B]/25 transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
            >
              Ir para Gestão Comercial
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors ${isDark ? 'bg-white/5 text-white hover:bg-white/10 border border-white/10' : 'bg-white text-neutral-700 hover:bg-neutral-50 border border-neutral-200'}`}
            >
              Continuar aqui
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
