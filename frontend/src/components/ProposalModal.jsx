import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bold,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Italic,
  List,
  Download,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Map,
  MapPinned,
  Plus,
  Presentation,
  QrCode,
  Radio,
  Route,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  Trophy,
  Underline,
  X,
  Zap
} from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { useFavorites } from '../context/FavoritesContext';
import {
  campaignTotals,
  generateStrategicJustification,
  getSegmentDisplayName,
  OBJETIVOS,
  SEGMENTOS
} from '../lib/strategy';
import { buildProposalPricing } from '../lib/proposal';
import { generateProposalPdf } from '../lib/midiaKitPdf';
import { generateProposalMobilePdf } from '../lib/midiaKitMobilePdf';
import {
  defaultDisplaySettings,
  defaultMediaParams,
  generateSimulationPreview,
  normalizeDisplaySettings,
  parseSimulationConfig
} from '../lib/simulation';
import { criarPropostaPublica, uploadProposalImage, fetchClientAddressAnalysis, fetchEntornoScores, gerarTextoProposta, fetchCurrentUser } from '../lib/api';
import { buildSelectionMapDataUrl, downloadSelectionMapPng } from '../lib/mapSnapshot';
import CustomSelect from './CustomSelect';
import ArteAIPanel from './ArteAIPanel';
import PresentationMode from './PresentationMode';
import QuickPresentationMode from './QuickPresentationMode';

const DEFAULT_ENTORNO_RADIUS = 800;

// High-realism preset applied automatically
const REALISM_PRESET = normalizeDisplaySettings({
  ...defaultDisplaySettings,
  brightness: 1.35,
  reflection: 0.32,
  spill: 0.28,
  ledPixelIntensity: 0.30,
  ledPixelSize: 6,
  glare: 0.22
});

const WIZARD_STEPS = [
  { id: 1, label: 'Dados' },
  { id: 2, label: 'Desconto' },
  { id: 3, label: 'Artes' },
  { id: 4, label: 'Revisão' },
  { id: 5, label: 'Editar PDF' },
  { id: 6, label: 'Gerar' },
];

const STEP_TITLES = {
  1: 'Dados da proposta',
  2: 'Desconto comercial',
  3: 'Artes por ponto',
  4: 'Revisão da proposta',
  5: 'Editar PDF final',
  6: 'Gerar proposta',
};

function getPointPreviewUrl(point, requireGeneratedPreview = false) {
  if (!point) return '';
  if (requireGeneratedPreview) {
    return point.proposalSimulationPreview || '';
  }
  return point.proposalSimulationPreview || point.simulacao_preview || '';
}

const DRAFT_STORAGE_KEY = 'proposal-draft';

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDraft(data) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

export function clearProposalDraft() {
  try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ignore */ }
}

const PDF_POINT_EDITABLE_FIELDS = [
  { key: 'nome', label: 'Nome do ponto', type: 'text', placeholder: 'Nome exibido no PDF' },
  { key: 'cidade', label: 'Cidade', type: 'text', placeholder: 'Cidade exibida no PDF' },
  { key: 'tipo', label: 'Tipo', type: 'text', placeholder: 'Ex: Elevador, Painel LED' },
  { key: 'endereco', label: 'Endereço', type: 'text', placeholder: 'Endereço para o cliente' },
  { key: 'publico', label: 'Público', type: 'text', placeholder: 'Ex: A/B+, Clínicas' },
  { key: 'fluxo', label: 'Fluxo', type: 'number', placeholder: 'Ex: 120000' },
  { key: 'telas', label: 'Pontos de impacto', type: 'number', placeholder: 'Ex: 4' },
  { key: 'insercoes', label: 'Inserções mín.', type: 'number', placeholder: 'Ex: 720' },
  { key: 'tempo', label: 'Tempo da peça', type: 'text', placeholder: 'Ex: 15s' },
  { key: 'loop', label: 'Loop', type: 'text', placeholder: 'Ex: 3 min' },
  { key: 'veiculacao', label: 'Veiculação', type: 'text', placeholder: 'Ex: Vídeo sem áudio' },
  { key: 'horario', label: 'Horário', type: 'text', placeholder: 'Ex: 6h às 23h' },
  { key: 'preco', label: 'Investimento/mês', type: 'text', placeholder: 'Ex: 3250 ou 3.250,00' },
  { key: 'lat', label: 'Latitude (opcional)', type: 'text', placeholder: 'Ex: -23.30452' },
  { key: 'lng', label: 'Longitude (opcional)', type: 'text', placeholder: 'Ex: -51.16958' }
];

function parseLocaleNumber(rawValue) {
  const source = String(rawValue ?? '').trim();
  if (!source) return null;
  const sanitized = source
    .replace(/\s+/g, '')
    .replace(/R\$/gi, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercentage(value, min = 0, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function formatBrlCurrencyInput(rawValue) {
  const digits = String(rawValue ?? '').replace(/\D+/g, '');
  if (!digits) return '';
  const cents = Number(digits);
  if (!Number.isFinite(cents)) return '';
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSellerPhotoUrl(value) {
  const source = String(value || '').trim();
  if (!source || source.startsWith('blob:')) return '';
  return source;
}

const GENERIC_SELLER_NAME_VALUES = new Set([
  'usuario',
  'usuaria',
  'user',
  'vendedor',
  'vendedora',
  'comercial',
  'admin'
]);

function isGenericSellerName(value) {
  const normalized = normalizeComparableText(value);
  return GENERIC_SELLER_NAME_VALUES.has(normalized);
}

function normalizeStrategicTopicLine(value) {
  return String(value ?? '')
    .replace(/^([\-*•]+|\d+[.)])\s*/u, '')
    .trim();
}

function parseStrategicTopics(value, maxItems = 8) {
  return String(value ?? '')
    .split(/\r?\n+/)
    .map((line) => normalizeStrategicTopicLine(line))
    .filter(Boolean)
    .slice(0, maxItems);
}

function stringifyStrategicTopics(lines = []) {
  return lines
    .map((line) => normalizeStrategicTopicLine(line))
    .filter(Boolean)
    .join('\n');
}

function buildSellerSignatureFromCurrentUser(user) {
  const safeUser = user && typeof user === 'object' ? user : {};
  const displayName = String(safeUser.name || '').trim();
  const fullName = [safeUser.first_name, safeUser.last_name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  const username = String(safeUser.username || '').trim();
  const email = String(safeUser.email || '').trim();
  const emailLocal = email.split('@')[0] || '';
  const fallbackFromEmail = emailLocal
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
  let sellerName = fullName || displayName || username;
  if ((!sellerName || isGenericSellerName(sellerName)) && fallbackFromEmail) {
    sellerName = fallbackFromEmail;
  }
  return {
    nome: sellerName,
    email,
    telefone: String(safeUser.whatsapp || '').trim(),
    photoUrl: normalizeSellerPhotoUrl(safeUser.photo_url || safeUser.photoUrl || '')
  };
}

function createProposalOption(overrides = {}, indexHint = 0) {
  const now = Date.now();
  const random = Math.random().toString(36).slice(2, 7);
  const toText = (value) => (value === null || value === undefined ? '' : String(value));
  const rawTitle = toText(overrides.title ?? overrides.titulo);
  return {
    id: String(overrides.id || `proposal-opt-${now}-${random}-${indexHint}`),
    title: rawTitle.trim() ? rawTitle : `Proposta ${indexHint + 1}`,
    points: toText(overrides.points ?? overrides.quantidade_pontos),
    pricePerPoint: toText(overrides.pricePerPoint ?? overrides.valor_por_ponto),
    totalValue: toText(overrides.totalValue ?? overrides.valor_total),
    months: toText(overrides.months ?? overrides.duracao_meses),
    note: toText(overrides.note ?? overrides.observacao)
  };
}

function normalizeProposalOptionsForForm(options = []) {
  const source = Array.isArray(options) ? options : [];
  const normalized = source
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, index) => createProposalOption(entry, index));
  return normalized.length ? normalized : [createProposalOption({}, 0)];
}

function normalizeProposalOptionsForPayload(options = []) {
  return normalizeProposalOptionsForForm(options)
    .map((entry, index) => {
      const pointsParsed = parseLocaleNumber(entry.points);
      const pricePerPointParsed = parseLocaleNumber(entry.pricePerPoint);
      const totalValueParsed = parseLocaleNumber(entry.totalValue);
      const monthsParsed = parseLocaleNumber(entry.months);
      const note = String(entry.note || '').trim();
      return {
        title: String(entry.title || '').trim() || `Proposta ${index + 1}`,
        points: Number.isFinite(pointsParsed) ? Math.max(0, Math.round(pointsParsed)) : null,
        pricePerPoint: Number.isFinite(pricePerPointParsed) ? Math.max(0, pricePerPointParsed) : null,
        totalValue: Number.isFinite(totalValueParsed) ? Math.max(0, totalValueParsed) : null,
        months: Number.isFinite(monthsParsed) ? Math.max(1, Math.round(monthsParsed)) : null,
        note
      };
    })
    .filter((entry) => entry.points || entry.pricePerPoint || entry.totalValue || entry.months || entry.note);
}

function applyPdfPointEdit(point, edit = {}) {
  if (!point) return point;
  const next = { ...point };

  const textKeys = ['nome', 'cidade', 'tipo', 'endereco', 'publico', 'loop', 'veiculacao', 'horario'];
  textKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(edit, key)) {
      next[key] = String(edit[key] ?? '').trim();
    }
  });

  if (Object.prototype.hasOwnProperty.call(edit, 'tempo')) {
    const tempo = String(edit.tempo ?? '').trim();
    next.tempo = tempo;
    next.tempo_insercao = tempo;
  }

  const intKeys = ['fluxo', 'telas', 'insercoes'];
  intKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(edit, key)) {
      const parsed = parseLocaleNumber(edit[key]);
      next[key] = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
    }
  });

  if (Object.prototype.hasOwnProperty.call(edit, 'preco')) {
    const parsed = parseLocaleNumber(edit.preco);
    next.preco = Number.isFinite(parsed) ? parsed : null;
    next.precoFinal = Number.isFinite(parsed) ? parsed : null;
  }

  if (Object.prototype.hasOwnProperty.call(edit, 'lat')) {
    const parsed = parseLocaleNumber(edit.lat);
    next.lat = Number.isFinite(parsed) ? parsed : null;
  }
  if (Object.prototype.hasOwnProperty.call(edit, 'lng')) {
    const parsed = parseLocaleNumber(edit.lng);
    next.lng = Number.isFinite(parsed) ? parsed : null;
  }

  return next;
}

function buildPricingSummaryFromPoints(points = []) {
  const originalTotal = points.reduce((sum, point) => {
    const value = Number(point?.precoOriginal ?? point?.preco_tabela ?? point?.preco ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const finalTotal = points.reduce((sum, point) => {
    const value = Number(point?.precoFinal ?? point?.preco ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const discountTotal = Math.max(0, originalTotal - finalTotal);
  const discountPercentage = originalTotal > 0 ? (discountTotal / originalTotal) * 100 : 0;

  return {
    originalTotal,
    finalTotal,
    discountTotal,
    discountPercentage,
    hasDiscount: discountTotal > 0.01
  };
}

function applyAgencyCommissionToSummary(summary = {}, { enabled = false, percent = 0 } = {}) {
  const safeSummary = summary && typeof summary === 'object' ? summary : {};
  const finalTotal = Number(safeSummary.finalTotal ?? 0);
  const normalizedFinal = Number.isFinite(finalTotal) ? finalTotal : 0;
  const normalizedPercent = clampPercentage(percent);
  const shouldApply = Boolean(enabled) && normalizedPercent > 0;
  const agencyCommissionAmount = shouldApply ? normalizedFinal * (normalizedPercent / 100) : 0;
  const finalTotalWithCommission = normalizedFinal + agencyCommissionAmount;

  return {
    ...safeSummary,
    agencyCommissionEnabled: shouldApply,
    agencyCommissionPercent: shouldApply ? normalizedPercent : 0,
    agencyCommissionAmount,
    finalTotalWithCommission,
    hasAgencyCommission: shouldApply && agencyCommissionAmount > 0.0001
  };
}

export default function ProposalModal({ onClose, open = true, selectedPoints = null, isDark = true }) {
  const { favorites } = useFavorites();
  const sourcePoints = selectedPoints ?? favorites;
  const [wizardStep, setWizardStep] = useState(1);
  const [showPresentation, setShowPresentation] = useState(false);
  const [showQuickPresentation, setShowQuickPresentation] = useState(false);
  const [clientModePresentation, setClientModePresentation] = useState(false);

  const draft = useMemo(() => loadDraft(), []);
  const draftForm = draft?.form && typeof draft.form === 'object' ? draft.form : {};
  const draftProposalOptions = normalizeProposalOptionsForForm(draftForm.proposalOptions);

  const [form, setForm] = useState(() => {
    const sellerName = String(draftForm.sellerName || '').trim();
    const sellerEmail = String(draftForm.sellerEmail || '').trim();
    const sellerPhone = String(draftForm.sellerPhone || '').trim();
    const sellerPhotoUrl = normalizeSellerPhotoUrl(draftForm.sellerPhotoUrl || draftForm.seller_photo_url || '');
    return {
      clientName: '',
      clientAddress: '',
      proposalSubtitle: '',
      strategicTopics: '',
      segmento: 'clinica',
      objetivo: 'reconhecimento de marca',
      publicos: [],
      selectedCities: [],
      duracao_meses: '',
      customCommercialNote: '',
      agencyCommissionEnabled: false,
      agencyCommissionPercent: '',
      ...draftForm,
      proposalOptions: draftProposalOptions,
      sellerName,
      sellerEmail,
      sellerPhone,
      sellerPhotoUrl
    };
  });
  const [analysisMode, setAnalysisMode] = useState(draft?.analysisMode || 'segmento');
  const [discountConfig, setDiscountConfig] = useState(() => ({
    mode: 'none',
    valueType: 'percentage',
    percentage: '',
    amount: '',
    targetPointIds: [],
    perPoint: {},
    ...(draft?.discountConfig || {})
  }));
  const [pdfPointEdits, setPdfPointEdits] = useState(() => {
    if (!draft?.pdfPointEdits || typeof draft.pdfPointEdits !== 'object') return {};
    return draft.pdfPointEdits;
  });
  const [pdfExcludedPointIds, setPdfExcludedPointIds] = useState(() => {
    if (!Array.isArray(draft?.pdfExcludedPointIds)) return [];
    return draft.pdfExcludedPointIds.map((id) => String(id));
  });
  const [editingPdfPointId, setEditingPdfPointId] = useState(null);
  const [advancedRealismOpen, setAdvancedRealismOpen] = useState(false);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [simulationError, setSimulationError] = useState('');
  const [simulationResults, setSimulationResults] = useState({});
  const [pointArtAssignments, setPointArtAssignments] = useState(() => {
    if (!draft?.pointArtAssignments || typeof draft.pointArtAssignments !== 'object') return {};
    return draft.pointArtAssignments;
  });
  const [simulationSettings, setSimulationSettings] = useState(REALISM_PRESET);
  const [mediaParams, setMediaParams] = useState({ ...defaultMediaParams });
  const [activePreviewPointId, setActivePreviewPointId] = useState(null);
  const [showPreviewLightbox, setShowPreviewLightbox] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFormat, setPdfFormat] = useState('desktop'); // 'desktop' | 'mobile'
  const [showPdfFormatPicker, setShowPdfFormatPicker] = useState(false);
  const pdfFormatPickerRef = useRef(null);
  // FEAT-11: IA text generation
  const [aiTextBusy, setAiTextBusy] = useState(false);
  // FEAT-1: Share / public link
  const [shareModal, setShareModal] = useState(null); // null | { url, token, expires_at }
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [sessionExpiredModal, setSessionExpiredModal] = useState({ open: false, message: '' });
  const [pdfSections, setPdfSections] = useState({ methodology: true, entornoEvidence: true, coverage: false, impact: true, mapPrint: false });
  const [connectMapPoints, setConnectMapPoints] = useState(true);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapStatus, setMapStatus] = useState('');
  const [entornoRefreshKey, setEntornoRefreshKey] = useState(0);
  const [entorno, setEntorno] = useState({
    loading: false,
    jobId: null,
    coverage: 0,
    scoresByPoint: {},
    updatedAt: null,
    error: ''
  });
  const [clientAnalysis, setClientAnalysis] = useState({
    loading: false,
    location: null,
    byPoint: {},
    rankedPoints: [],
    error: ''
  });
  const customCommercialNoteRef = useRef(null);

  const isSessionExpiredError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return /token|expirad|autentica|unauthoriz|401/.test(message);
  };

  const triggerSessionExpiredModal = (message) => {
    try { sessionStorage.removeItem('admin_token'); } catch { /* ignore */ }
    setSessionExpiredModal({
      open: true,
      message: message || 'Sua sessão expirou. Faça login novamente para continuar.'
    });
  };

  const handleAuthExpired = (error, message) => {
    if (!isSessionExpiredError(error)) return false;
    triggerSessionExpiredModal(message);
    return true;
  };

  const goToCommercialLogin = () => {
    if (typeof window === 'undefined') return;
    window.location.assign('/comercial');
  };

  const updateCommercialNoteWithSelection = (builder) => {
    const textarea = customCommercialNoteRef.current;
    const currentValue = String(form.customCommercialNote || '');
    const selectionStart = textarea?.selectionStart ?? currentValue.length;
    const selectionEnd = textarea?.selectionEnd ?? currentValue.length;
    const result = builder(currentValue, selectionStart, selectionEnd);
    if (!result || typeof result.nextValue !== 'string') return;

    setForm((prev) => ({ ...prev, customCommercialNote: result.nextValue }));

    requestAnimationFrame(() => {
      const target = customCommercialNoteRef.current;
      if (!target) return;
      const start = Number.isFinite(result.nextSelectionStart) ? result.nextSelectionStart : result.nextValue.length;
      const end = Number.isFinite(result.nextSelectionEnd) ? result.nextSelectionEnd : start;
      target.focus();
      target.setSelectionRange(start, end);
    });
  };

  const wrapCommercialNoteSelection = (leftToken, rightToken, fallbackText) => {
    updateCommercialNoteWithSelection((value, start, end) => {
      const selected = value.slice(start, end);
      const middle = selected || fallbackText;
      const insertion = `${leftToken}${middle}${rightToken}`;
      return {
        nextValue: `${value.slice(0, start)}${insertion}${value.slice(end)}`,
        nextSelectionStart: start + leftToken.length,
        nextSelectionEnd: start + leftToken.length + middle.length,
      };
    });
  };

  const addCommercialNoteBulletList = () => {
    updateCommercialNoteWithSelection((value, start, end) => {
      const selected = value.slice(start, end);
      if (selected) {
        const listed = selected
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            return /^-\s+/.test(trimmed) ? line : `- ${line}`;
          })
          .join('\n');
        return {
          nextValue: `${value.slice(0, start)}${listed}${value.slice(end)}`,
          nextSelectionStart: start,
          nextSelectionEnd: start + listed.length,
        };
      }

      const bullet = value && !value.endsWith('\n') ? '\n- item' : '- item';
      const insertionStart = start;
      return {
        nextValue: `${value.slice(0, start)}${bullet}${value.slice(end)}`,
        nextSelectionStart: insertionStart + bullet.length - 4,
        nextSelectionEnd: insertionStart + bullet.length,
      };
    });
  };

  const addCommercialNoteLineBreak = () => {
    updateCommercialNoteWithSelection((value, start, end) => {
      const insertion = '\n';
      const nextCursor = start + insertion.length;
      return {
        nextValue: `${value.slice(0, start)}${insertion}${value.slice(end)}`,
        nextSelectionStart: nextCursor,
        nextSelectionEnd: nextCursor,
      };
    });
  };

  const mergeEntornoMetrics = (points, scoresByPoint = {}) => {
    const safePoints = Array.isArray(points) ? points : [];
    return safePoints.map((point) => {
      const hit = scoresByPoint?.[point?.id] || scoresByPoint?.[String(point?.id)] || null;
      return {
        ...point,
        entornoMetrics: point?.entornoMetrics || hit || null
      };
    });
  };

  const ensurePointsWithEntorno = async (points) => {
    return mergeEntornoMetrics(points, entorno.scoresByPoint || {});
  };

  const handleRefreshEntorno = () => {
    setEntornoRefreshKey((current) => current + 1);
  };

  const persistSimulationPreview = async (previewBlob, previewUrl = '') => {
    if (previewBlob instanceof Blob) {
      const serverUrl = await uploadProposalImage(previewBlob);
      return serverUrl || '';
    }

    // If we don't have the blob in memory, keep only stable non-blob URLs.
    if (previewUrl && !String(previewUrl).startsWith('blob:')) {
      return previewUrl;
    }
    return '';
  };

  // Auto-save draft whenever form-related state changes
  useEffect(() => {
    saveDraft({
      form,
      discountConfig,
      analysisMode,
      pdfSections,
      pdfPointEdits,
      pdfExcludedPointIds,
      pointArtAssignments
    });
  }, [form, discountConfig, analysisMode, pdfSections, pdfPointEdits, pdfExcludedPointIds, pointArtAssignments]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadSellerSignature = async () => {
      try {
        const user = await fetchCurrentUser();
        if (cancelled) return;
        const seller = buildSellerSignatureFromCurrentUser(user);
        setForm((current) => {
          const next = { ...current };
          let changed = false;
          const currentSellerName = String(current.sellerName || '').trim();

          if ((!currentSellerName || isGenericSellerName(currentSellerName)) && seller.nome) {
            next.sellerName = seller.nome;
            changed = true;
          }
          if (!String(current.sellerEmail || '').trim() && seller.email) {
            next.sellerEmail = seller.email;
            changed = true;
          }
          if (!String(current.sellerPhone || '').trim() && seller.telefone) {
            next.sellerPhone = seller.telefone;
            changed = true;
          }
          if (!String(current.sellerPhotoUrl || '').trim() && seller.photoUrl) {
            next.sellerPhotoUrl = seller.photoUrl;
            changed = true;
          }

          return changed ? next : current;
        });
      } catch {
        // Silent fallback: signature fields can still be preenchidos manualmente.
      }
    };

    loadSellerSignature();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!showPdfFormatPicker) return undefined;
    const handler = (e) => {
      if (pdfFormatPickerRef.current && !pdfFormatPickerRef.current.contains(e.target)) {
        setShowPdfFormatPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPdfFormatPicker]);

  const availableCities = useMemo(() => {
    return Array.from(new Set(sourcePoints.map((point) => point.cidade).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [sourcePoints]);

  const availablePublicos = useMemo(() => {
    return Array.from(new Set(sourcePoints.map((point) => point.publico).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [sourcePoints]);

  const activeCities = form.selectedCities.length ? form.selectedCities : availableCities;

  useEffect(() => {
    setForm((current) => ({
      ...current,
      selectedCities: current.selectedCities.filter((city) => availableCities.includes(city)),
      publicos: current.publicos.filter((publico) => availablePublicos.includes(publico))
    }));
  }, [availableCities, availablePublicos]);

  useEffect(() => {
    setDiscountConfig((current) => ({
      ...current,
      targetPointIds: current.targetPointIds.filter((pointId) => sourcePoints.some((point) => String(point.id) === String(pointId))),
      perPoint: Object.fromEntries(
        Object.entries(current.perPoint || {}).filter(([pointId]) => sourcePoints.some((point) => String(point.id) === String(pointId)))
      )
    }));
  }, [sourcePoints]);

  useEffect(() => {
    setPointArtAssignments((current) => Object.fromEntries(
      Object.entries(current || {}).filter(([pointId]) => sourcePoints.some((point) => String(point.id) === String(pointId)))
    ));
  }, [sourcePoints]);

  useEffect(() => {
    setPdfExcludedPointIds((current) => current.filter((pointId) => sourcePoints.some((point) => String(point.id) === String(pointId))));
    setPdfPointEdits((current) => Object.fromEntries(
      Object.entries(current).filter(([pointId]) => sourcePoints.some((point) => String(point.id) === String(pointId)))
    ));
  }, [sourcePoints]);

  const proposalSourcePoints = useMemo(() => {
    if (!form.selectedCities.length) return sourcePoints;
    return sourcePoints.filter((point) => form.selectedCities.includes(point.cidade));
  }, [sourcePoints, form.selectedCities]);

  if (!open) {
    return null;
  }

  const pricing = useMemo(() => buildProposalPricing(proposalSourcePoints, discountConfig), [proposalSourcePoints, discountConfig]);
  const pricingSummary = pricing.summary;
  const discountValueType = discountConfig.valueType === 'amount' ? 'amount' : 'percentage';
  const agencyCommissionPercentRaw = useMemo(() => parseLocaleNumber(form.agencyCommissionPercent), [form.agencyCommissionPercent]);
  const agencyCommissionPercent = Number.isFinite(agencyCommissionPercentRaw)
    ? clampPercentage(agencyCommissionPercentRaw)
    : 0;
  const agencyCommissionPercentLabel = agencyCommissionPercent.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(agencyCommissionPercent) ? 0 : 1,
    maximumFractionDigits: 2
  });
  const agencyCommissionEnabled = Boolean(form.agencyCommissionEnabled) && agencyCommissionPercent > 0;
  const pricingSummaryWithCommission = useMemo(() => (
    applyAgencyCommissionToSummary(pricingSummary, {
      enabled: agencyCommissionEnabled,
      percent: agencyCommissionPercent
    })
  ), [pricingSummary, agencyCommissionEnabled, agencyCommissionPercent]);
  const totals = useMemo(() => campaignTotals(pricing.points), [pricing.points]);
  const assignedPointArtCount = useMemo(() => {
    return proposalSourcePoints.filter((point) => Boolean(pointArtAssignments[String(point.id)])).length;
  }, [proposalSourcePoints, pointArtAssignments]);
  const hasPointArtAssignments = assignedPointArtCount > 0;

  const clearSimulationResults = () => {
    setSimulationResults((current) => {
      Object.values(current).forEach((entry) => {
        if (entry?.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      });
      return {};
    });
  };

  // Pre-preencher pra\u00e7as a partir das cidades dos pontos selecionados quando o modal abre.
  // S\u00f3 dispara enquanto o usu\u00e1rio ainda n\u00e3o tiver feito qualquer escolha de pra\u00e7as.
  const prefilledCitiesRef = useRef(false);
  useEffect(() => {
    if (!open) {
      prefilledCitiesRef.current = false;
      return;
    }
    if (prefilledCitiesRef.current) return;
    if (form.selectedCities && form.selectedCities.length > 0) return;
    const cidadesDosPontos = Array.from(
      new Set((sourcePoints || []).map((p) => p?.cidade).filter(Boolean))
    ).sort();
    if (cidadesDosPontos.length > 0) {
      setForm((current) => ({ ...current, selectedCities: cidadesDosPontos }));
      prefilledCitiesRef.current = true;
    }
  }, [open, sourcePoints]);

  // Cleanup blob URLs only on unmount — NOT on every simulationResults change,
  // because revoking mid-batch would invalidate earlier blob URLs.
  const simulationResultsRef = useRef(simulationResults);
  simulationResultsRef.current = simulationResults;
  useEffect(() => {
    return () => {
      Object.values(simulationResultsRef.current).forEach((entry) => {
        if (entry?.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (Object.keys(simulationResults).length > 0) {
      clearSimulationResults();
    }
  }, [simulationSettings]);

  useEffect(() => {
    let active = true;
    let pollTimer = null;

    const loadScores = async (force = false) => {
      if (!proposalSourcePoints.length) {
        setEntorno({
          loading: false,
          jobId: null,
          coverage: 0,
          scoresByPoint: {},
          updatedAt: null,
          error: ''
        });
        return;
      }

      try {
        setEntorno((prev) => ({ ...prev, loading: true, error: '' }));
        const response = await fetchEntornoScores({
          segmento: form.segmento,
          cidade: activeCities.length === 1 ? activeCities[0] : '',
          raio: DEFAULT_ENTORNO_RADIUS,
          force
        });

        if (!active) return;

        const scoresByPoint = response.byPoint || {};
        const selectedIds = proposalSourcePoints
          .map((point) => String(point?.id || '').trim())
          .filter(Boolean);
        const matchedCount = selectedIds.filter((id) => Boolean(scoresByPoint[id])).length;

        // If current cache coverage is high but none of the selected points have data,
        // trigger one forced refresh to ensure proposal points receive entorno metrics.
        if (!force && selectedIds.length > 0 && matchedCount === 0) {
          await loadScores(true);
          return;
        }

        const latest = response.metrics?.[0]?.updated_at || null;
        setEntorno((prev) => ({
          ...prev,
          loading: false,
          coverage: Number(response.coverage || response.coberturaCache || 0),
          scoresByPoint,
          updatedAt: latest,
          jobId: response.job?.jobId || null,
          error: ''
        }));

        if (response.job?.jobId) {
          pollTimer = window.setTimeout(() => {
            if (!active) return;
            setEntornoRefreshKey((current) => current + 1);
          }, 4000);
        }
      } catch (err) {
        if (!active) return;
        if (handleAuthExpired(err, 'Sua sessão expirou durante a análise de entorno. Faça login novamente para continuar gerando a proposta.')) {
          setEntorno((prev) => ({ ...prev, loading: false, error: 'Sessão expirada.' }));
          return;
        }
        setEntorno((prev) => ({
          ...prev,
          loading: false,
          error: err.message || 'Erro ao consultar análise de entorno.'
        }));
      }
    };

    // Auto-carrega na primeira abertura e sempre que o escopo mudar.
    // Força refresh quando o usuário clica em "Atualizar" (entornoRefreshKey > 0).
    loadScores(entornoRefreshKey > 0);

    return () => {
      active = false;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entornoRefreshKey, proposalSourcePoints.length, activeCities.join('|'), form.segmento]);

  useEffect(() => {
    if (analysisMode !== 'client-address') {
      setClientAnalysis({ loading: false, location: null, byPoint: {}, rankedPoints: [], error: '' });
      return;
    }

    if (!form.clientAddress.trim() || !proposalSourcePoints.length) {
      setClientAnalysis((current) => ({ ...current, loading: false, location: null, byPoint: {}, rankedPoints: [], error: '' }));
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setClientAnalysis((current) => ({ ...current, loading: true, error: '' }));
        const response = await fetchClientAddressAnalysis({
          address: form.clientAddress,
          pointIds: proposalSourcePoints.map((point) => point.id),
          cidade: activeCities
        });

        if (!active) return;

        setClientAnalysis({
          loading: false,
          location: response.location || null,
          byPoint: response.byPoint || {},
          rankedPoints: Array.isArray(response.rankedPoints) ? response.rankedPoints : [],
          error: ''
        });
      } catch (error) {
        if (!active) return;
        if (handleAuthExpired(error, 'Sua sessão expirou durante a análise do endereço do cliente. Faça login novamente para continuar.')) {
          setClientAnalysis({
            loading: false,
            location: null,
            byPoint: {},
            rankedPoints: [],
            error: 'Sessão expirada.'
          });
          return;
        }
        setClientAnalysis({
          loading: false,
          location: null,
          byPoint: {},
          rankedPoints: [],
          error: error.message || 'Falha ao analisar o endereço do cliente.'
        });
      }
    }, 500);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [analysisMode, form.clientAddress, proposalSourcePoints, activeCities]);

  const argumentos = useMemo(() => {
    // Usa pontos com desconto aplicado (pricing.points) para que ticket médio e CPM
    // refletidos na justificativa estratégica considerem o valor negociado, não o de tabela.
    const strategic = generateStrategicJustification({
      selected: pricing.points,
      cidade: Array.isArray(activeCities) ? activeCities[0] : activeCities,
      publicoAlvo: form.publicos,
      objetivo: form.objetivo,
      segmento: form.segmento,
      empresa: form.clientName
    });
    return strategic.argumentacaoComercial || [];
  }, [pricing.points, activeCities, form.publicos, form.objetivo, form.segmento, form.clientName]);

  const strategicTopicSuggestions = useMemo(() => parseStrategicTopics(argumentos.join('\n'), 8), [argumentos]);
  const strategicTopicCustom = useMemo(() => parseStrategicTopics(form.strategicTopics, 8), [form.strategicTopics]);
  const strategicTopicList = strategicTopicCustom.length ? strategicTopicCustom : strategicTopicSuggestions;
  const usingAutoStrategicTopics = strategicTopicCustom.length === 0;

  const commitStrategicTopics = (nextTopics) => {
    setForm((state) => ({
      ...state,
      strategicTopics: stringifyStrategicTopics(nextTopics)
    }));
  };

  const handleStrategicTopicChange = (index, value) => {
    const baseTopics = strategicTopicCustom.length ? strategicTopicCustom : strategicTopicSuggestions;
    const nextTopics = [...baseTopics];
    nextTopics[index] = value;
    commitStrategicTopics(nextTopics);
  };

  const handleAddStrategicTopic = () => {
    const baseTopics = strategicTopicCustom.length ? strategicTopicCustom : strategicTopicSuggestions;
    commitStrategicTopics([...baseTopics, 'Novo tópico estratégico']);
  };

  const handleRemoveStrategicTopic = (index) => {
    const baseTopics = strategicTopicCustom.length ? strategicTopicCustom : strategicTopicSuggestions;
    const nextTopics = baseTopics.filter((_, currentIndex) => currentIndex !== index);
    commitStrategicTopics(nextTopics);
  };

  const handleResetStrategicTopics = () => {
    setForm((state) => ({ ...state, strategicTopics: '' }));
  };

  const proposalPoints = useMemo(() => {
    return pricing.points.map((point) => {
      const result = simulationResults[point.id];
      const persistedPreview = point.proposalSimulationPreview || point.simulacao_preview || '';
      const assignedArtUrl = pointArtAssignments[String(point.id)] || '';
      const entornoMetrics = entorno.scoresByPoint[point.id] || entorno.scoresByPoint[String(point.id)] || null;
      const clientMetrics = clientAnalysis.byPoint[point.id] || clientAnalysis.byPoint[String(point.id)] || null;
      return {
        ...point,
        entornoMetrics,
        clientDistanceMeters: clientMetrics?.distanceMeters || null,
        clientDistanceKm: clientMetrics?.distanceKm || null,
        clientProximityScore: clientMetrics?.proximityScore || null,
        assignedPointArtUrl: assignedArtUrl,
        proposalSimulationPreview: result?.previewUrl || persistedPreview,
        proposalSimulationStatus: result?.status || (assignedArtUrl
          ? 'Arte definida para este ponto'
          : 'Adicione uma arte para este ponto')
      };
    });
  }, [pricing.points, simulationResults, pointArtAssignments, entorno.scoresByPoint, clientAnalysis.byPoint]);

  const proposalPointsEditedMap = useMemo(() => {
    const map = {};
    proposalPoints.forEach((point) => {
      const pointId = String(point.id);
      map[pointId] = applyPdfPointEdit(point, pdfPointEdits[pointId] || {});
    });
    return map;
  }, [proposalPoints, pdfPointEdits]);

  const proposalPointsForPdf = useMemo(() => {
    const excluded = new Set(pdfExcludedPointIds.map((id) => String(id)));
    return proposalPoints
      .filter((point) => !excluded.has(String(point.id)))
      .map((point) => proposalPointsEditedMap[String(point.id)] || point);
  }, [proposalPoints, pdfExcludedPointIds, proposalPointsEditedMap]);

  const totalsForPdf = useMemo(() => campaignTotals(proposalPointsForPdf), [proposalPointsForPdf]);
  const pricingSummaryForPdf = useMemo(() => buildPricingSummaryFromPoints(proposalPointsForPdf), [proposalPointsForPdf]);
  const pricingSummaryForPdfWithCommission = useMemo(() => (
    applyAgencyCommissionToSummary(pricingSummaryForPdf, {
      enabled: agencyCommissionEnabled,
      percent: agencyCommissionPercent
    })
  ), [pricingSummaryForPdf, agencyCommissionEnabled, agencyCommissionPercent]);
  const proposalOptionsForForm = useMemo(() => normalizeProposalOptionsForForm(form.proposalOptions), [form.proposalOptions]);
  const proposalOptionsPayload = useMemo(() => normalizeProposalOptionsForPayload(form.proposalOptions), [form.proposalOptions]);
  const sellerSignaturePayload = useMemo(() => ({
    name: String(form.sellerName || '').trim(),
    email: String(form.sellerEmail || '').trim(),
    phone: String(form.sellerPhone || '').trim(),
    photoUrl: normalizeSellerPhotoUrl(form.sellerPhotoUrl || '')
  }), [form.sellerName, form.sellerEmail, form.sellerPhone, form.sellerPhotoUrl]);
  const hiddenPointsCount = Math.max(0, proposalPoints.length - proposalPointsForPdf.length);

  const updateProposalOptionField = (optionId, field, value) => {
    setForm((state) => {
      const nextOptions = normalizeProposalOptionsForForm(state.proposalOptions).map((entry) => (
        entry.id === optionId ? { ...entry, [field]: value } : entry
      ));
      return { ...state, proposalOptions: nextOptions };
    });
  };

  const updateProposalOptionCurrencyField = (optionId, field, rawValue) => {
    updateProposalOptionField(optionId, field, formatBrlCurrencyInput(rawValue));
  };

  const handleAddProposalOption = () => {
    setForm((state) => {
      const current = normalizeProposalOptionsForForm(state.proposalOptions);
      return {
        ...state,
        proposalOptions: [...current, createProposalOption({}, current.length)]
      };
    });
  };

  const handleRemoveProposalOption = (optionId) => {
    setForm((state) => {
      const filtered = normalizeProposalOptionsForForm(state.proposalOptions).filter((entry) => entry.id !== optionId);
      return {
        ...state,
        proposalOptions: filtered.length ? filtered : [createProposalOption({}, 0)]
      };
    });
  };

  const handleFillProposalOptionFromCurrentPlan = (optionId) => {
    const pointsCount = proposalPointsForPdf.length;
    const finalTotal = Number(pricingSummaryForPdfWithCommission?.finalTotalWithCommission ?? pricingSummaryForPdf?.finalTotal ?? totalsForPdf?.valorTotal ?? 0);
    const pricePerPoint = pointsCount > 0 ? finalTotal / pointsCount : 0;
    const toMoneyText = (value) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    setForm((state) => {
      const nextOptions = normalizeProposalOptionsForForm(state.proposalOptions).map((entry) => {
        if (entry.id !== optionId) return entry;
        return {
          ...entry,
          points: pointsCount ? String(pointsCount) : entry.points,
          pricePerPoint: pointsCount ? toMoneyText(pricePerPoint) : entry.pricePerPoint,
          totalValue: finalTotal > 0 ? toMoneyText(finalTotal) : entry.totalValue,
          months: String(state.duracao_meses || '').trim() || entry.months
        };
      });
      return { ...state, proposalOptions: nextOptions };
    });
  };

  const updatePdfPointField = (pointId, field, value) => {
    const key = String(pointId);
    setPdfPointEdits((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {}),
        [field]: value
      }
    }));
  };

  const resetPdfPointEdit = (pointId) => {
    const key = String(pointId);
    setPdfPointEdits((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setEditingPdfPointId((current) => (String(current) === key ? null : current));
  };

  const togglePointInPdf = (pointId) => {
    const key = String(pointId);
    setPdfExcludedPointIds((current) => {
      if (current.includes(key)) {
        return current.filter((id) => id !== key);
      }
      return [...current, key];
    });
  };

  const resetAllPdfEdits = () => {
    setPdfPointEdits({});
    setPdfExcludedPointIds([]);
    setEditingPdfPointId(null);
  };

  const simulationSummary = useMemo(() => {
    const items = Object.values(simulationResults);
    if (!hasPointArtAssignments) {
      return '';
    }
    if (!items.length) {
      return 'Artes ponto a ponto prontas. Clique em gerar para produzir todas as simulações da campanha.';
    }

    const geradas = items.filter((item) => String(item.status || '').startsWith('Gerada')).length;
    const semArea = items.filter((item) => item.status === 'Área da tela não cadastrada no admin').length;
    const semImagem = items.filter((item) => item.status === 'Imagem base do ponto não cadastrada').length;
    const semArte = items.filter((item) => item.status === 'Sem arte ponto a ponto').length;
    const falhas = items.filter((item) => item.status === 'Falha ao gerar').length;

    return [
      `${geradas} simulação${geradas === 1 ? '' : 'ões'} gerada${geradas === 1 ? '' : 's'}`,
      `${assignedPointArtCount} ponto${assignedPointArtCount === 1 ? '' : 's'} com arte atribuída`,
      semArea ? `${semArea} ponto${semArea === 1 ? '' : 's'} sem área cadastrada` : null,
      semImagem ? `${semImagem} ponto${semImagem === 1 ? '' : 's'} sem imagem base` : null,
      semArte ? `${semArte} ponto${semArte === 1 ? '' : 's'} sem arte` : null,
      falhas ? `${falhas} falha${falhas === 1 ? '' : 's'} de processamento` : null,
      `brilho ${simulationSettings.brightness.toFixed(2)}`,
      `reflexo ${simulationSettings.reflection.toFixed(2)}`,
      `pixel LED ${simulationSettings.ledPixelIntensity.toFixed(2)}`,
      `mídia ${mediaParams.mediaMode}`
    ].filter(Boolean).join(' · ');
  }, [hasPointArtAssignments, assignedPointArtCount, simulationResults, simulationSettings, mediaParams]);

  const previewablePoints = useMemo(() => {
    const requireGeneratedPreview = hasPointArtAssignments;
    return proposalPointsForPdf.filter((point) => getPointPreviewUrl(point, requireGeneratedPreview));
  }, [proposalPointsForPdf, hasPointArtAssignments]);

  useEffect(() => {
    if (!previewablePoints.length) {
      setActivePreviewPointId(null);
      return;
    }

    const stillExists = previewablePoints.some((point) => point.id === activePreviewPointId);
    if (!stillExists) {
      setActivePreviewPointId(previewablePoints[0].id);
    }
  }, [previewablePoints, activePreviewPointId]);

  const activePreviewPoint = useMemo(() => {
    if (!previewablePoints.length) return null;
    return previewablePoints.find((point) => point.id === activePreviewPointId) || previewablePoints[0];
  }, [previewablePoints, activePreviewPointId]);

  const handleGenerate = () => {
    if (!proposalPointsForPdf.length) {
      setSimulationError('Inclua pelo menos 1 ponto para continuar para a geração do PDF.');
      return;
    }
    setWizardStep(6);
  };

  const handleExportProposalPdf = async (formatOverride) => {
    const format = formatOverride || pdfFormat;
    setShowPdfFormatPicker(false);
    try {
      if (!proposalPointsForPdf.length) {
        setSimulationError('Inclua pelo menos 1 ponto no PDF antes de exportar.');
        return;
      }

      setPdfBusy(true);
      const pointsWithEntorno = await ensurePointsWithEntorno(proposalPointsForPdf);
      const strategicTopics = String(form.strategicTopics || '')
        .split(/\n+/)
        .map((line) => line.replace(/^[-•\d.)\s]+/, '').trim())
        .filter(Boolean);

      if (format === 'mobile') {
        let mobileOverviewMap = null;
        if (proposalPointsForPdf.length > 0) {
          try {
            mobileOverviewMap = await buildSelectionMapDataUrl(pointsWithEntorno, {
              connectPoints: false,
              theme: 'light',
              width: 540,
              height: 400,
              showPointLabels: false
            });
          } catch {
            mobileOverviewMap = null;
          }
        }
        await generateProposalMobilePdf({
          clientName: form.clientName,
          city: activeCities,
          publico: form.publicos,
          points: pointsWithEntorno,
          totals: totalsForPdf,
          pricingSummary: pricingSummaryForPdfWithCommission,
          segmento: form.segmento,
          strategicText: argumentos,
          strategicTopics,
          strategicSubtitle: form.proposalSubtitle,
          simulationSummary,
          overviewMapImage: mobileOverviewMap,
          sellerSignature: sellerSignaturePayload,
          proposalOptions: proposalOptionsPayload,
          showImpactSection: pdfSections.impact,
        });
        return;
      }

      const pointMapImages = await Promise.all(
        pointsWithEntorno.map(async (point) => {
          try {
            return await buildSelectionMapDataUrl([point], {
              width: 860,
              height: 440,
              theme: 'light',
              connectPoints: false
            });
          } catch {
            return null;
          }
        })
      );

      let overviewMapImage = null;
      if (pointsWithEntorno.length > 0) {
        try {
          overviewMapImage = await buildSelectionMapDataUrl(pointsWithEntorno, {
            connectPoints: false,
            theme: 'light',
            width: 1800,
            height: 1000,
            showPointLabels: false
          });
        } catch {
          overviewMapImage = null;
        }
      }

      await generateProposalPdf({
        clientName: form.clientName,
        clientAddress: form.clientAddress,
        city: activeCities,
        publico: form.publicos,
        objective: form.objetivo,
        points: pointsWithEntorno,
        totals: totalsForPdf,
        pricingSummary: pricingSummaryForPdfWithCommission,
        segmento: form.segmento,
        strategicText: argumentos,
        strategicTopics,
        strategicSubtitle: form.proposalSubtitle,
        simulationSummary,
        analysisMode,
        pointMapImages,
        overviewMapImage,
        duracao_meses: form.duracao_meses ? Number(form.duracao_meses) : null,
        showMetricsMethodology: pdfSections.methodology,
        showCampaignScore: false,
        showEntornoEvidence: pdfSections.entornoEvidence,
        showCoverageLayer: pdfSections.coverage,
        showImpactSection: pdfSections.impact,
        customCommercialNote: form.customCommercialNote || '',
        sellerSignature: sellerSignaturePayload,
        proposalOptions: proposalOptionsPayload
      });
    } catch (error) {
      console.error('[ProposalModal] PDF export failed:', error);
      setSimulationError(error?.message || 'Falha ao gerar o PDF da proposta.');
    } finally {
      setPdfBusy(false);
    }
  };

  // FEAT-11: Gerar texto da proposta com IA
  const handleGerarTextoIA = async () => {
    if (!proposalPoints.length) return;
    setAiTextBusy(true);
    try {
      const pointsPayload = proposalPoints.map(p => ({
        nome: p.nome, tipo: p.tipo, cidade: p.cidade, endereco: p.endereco,
        fluxo: p.fluxo, telas: p.telas, preco: p.precoFinal || p.preco,
        entornoScore: p.entornoMetrics?.coverage_pct || null,
        audienceTags: (p.audience_tags || []).slice(0, 5).map(t => t.label || t.key)
      }));
      const result = await gerarTextoProposta({
        segmento: form.segmento, objetivo: form.objetivo,
        clientName: form.clientName,
        cidade: form.selectedCities[0] || proposalPoints[0]?.cidade || '',
        points: pointsPayload,
        totals: { fluxoTotal: totals.fluxoTotal, valorTotal: totals.valorTotal, cpmEstimado: totals.cpmEstimado }
      });
      const lines = [
        result.justificativa,
        result.argumentoAudiencia,
        ...(result.porQueEstesPoints || [])
      ].filter(Boolean);
      setForm((state) => ({ ...state, strategicTopics: stringifyStrategicTopics(lines) }));
    } catch (err) {
      if (handleAuthExpired(err, 'Sua sessão expirou antes de gerar os argumentos comerciais. Faça login novamente para evitar perda de créditos/tokens.')) {
        return;
      }
      console.error('[ProposalModal] AI text error:', err.message);
      setSimulationError(err?.message || 'Falha ao gerar argumentos comerciais.');
    } finally {
      setAiTextBusy(false);
    }
  };

  // FEAT-1: Criar link público da proposta
  const handleCompartilhar = async () => {
    setShareBusy(true);
    try {
      if (!proposalPointsForPdf.length) {
        throw new Error('Inclua pelo menos 1 ponto no PDF antes de compartilhar.');
      }

      const pointsWithEntorno = await ensurePointsWithEntorno(proposalPointsForPdf);
      const proposalData = {
        clientName: form.clientName, clientAddress: form.clientAddress,
        segmento: form.segmento, objetivo: form.objetivo,
        strategicTopics: form.strategicTopics,
        strategicText: argumentos,
        points: pointsWithEntorno.map(({ custo_operacional: _co, ...p }) => p),
        totals: totalsForPdf,
        pricingSummary: pricingSummaryForPdfWithCommission,
        duracao_meses: form.duracao_meses ? Number(form.duracao_meses) : null,
        agencyCommissionEnabled,
        agencyCommissionPercent,
        sellerSignature: sellerSignaturePayload,
        proposalOptions: proposalOptionsPayload
      };

      // Upload simulation preview images to server (convert blob: URLs to permanent URLs)
      if (Array.isArray(proposalData.points)) {
        const uploadTasks = proposalData.points.map(async (point) => {
          const previewUrl = point.proposalSimulationPreview || '';
          if (!previewUrl.startsWith('blob:')) return;
          try {
            const resp = await fetch(previewUrl);
            const blob = await resp.blob();
            const serverUrl = await uploadProposalImage(blob);
            point.proposalSimulationPreview = serverUrl;
          } catch (e) {
            console.warn('[ProposalModal] Failed to upload simulation image for point', point.id, e.message);
            // Clear blob URL so the client doesn't receive a broken URL
            point.proposalSimulationPreview = '';
          }
        });
        await Promise.all(uploadTasks);
      }

      const result = await criarPropostaPublica(proposalData, 7);
      setShareModal(result);
    } catch (err) {
      if (handleAuthExpired(err, 'Sua sessão expirou antes de compartilhar a proposta. Faça login novamente para gerar o link público/PDF com segurança.')) {
        return;
      }
      alert(err.message);
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShareLink = () => {
    if (!shareModal?.url) return;
    navigator.clipboard.writeText(shareModal.url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const qrCanvasRef = useRef(null);

  const handleDownloadQRCard = async () => {
    if (!shareModal?.url) return;
    const W = 800, H = 1000;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // Subtle border
    ctx.strokeStyle = '#E5E5E5';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Orange accent bar at top
    ctx.fillStyle = '#E8591A';
    ctx.fillRect(0, 0, W, 6);

    // Load logo
    try {
      const logo = await new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = '/logo-light.png';
      });
      const logoH = 44;
      const logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;
      ctx.drawImage(logo, (W - logoW) / 2, 50, logoW, logoH);
    } catch { /* skip logo if fails */ }

    // Badge "PROPOSTA COMERCIAL"
    ctx.fillStyle = '#E8591A';
    const badgeText = 'PROPOSTA COMERCIAL';
    ctx.font = 'bold 11px "Poppins", system-ui, sans-serif';
    const badgeW = ctx.measureText(badgeText).width + 24;
    const badgeX = (W - badgeW) / 2;
    const badgeY = 115;
    const badgeH = 24;
    const r = badgeH / 2;
    ctx.beginPath();
    ctx.moveTo(badgeX + r, badgeY);
    ctx.lineTo(badgeX + badgeW - r, badgeY);
    ctx.arcTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + r, r);
    ctx.arcTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - r, badgeY + badgeH, r);
    ctx.lineTo(badgeX + r, badgeY + badgeH);
    ctx.arcTo(badgeX, badgeY + badgeH, badgeX, badgeY + r, r);
    ctx.arcTo(badgeX, badgeY, badgeX + r, badgeY, r);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, W / 2, badgeY + badgeH / 2);

    // Client name
    const clientName = form.clientName || 'Proposta de Mídia';
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 28px "Poppins", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(clientName, W / 2, 160);

    // "Escaneie para visualizar"
    ctx.fillStyle = '#888888';
    ctx.font = '14px "Poppins", system-ui, sans-serif';
    ctx.fillText('Escaneie o QR code para visualizar a proposta', W / 2, 205);

    // QR code from hidden canvas
    const qrEl = qrCanvasRef.current;
    if (qrEl) {
      const qrCanvas = qrEl.querySelector('canvas');
      if (qrCanvas) {
        const qrSize = 280;
        const qrX = (W - qrSize) / 2;
        const qrY = 250;
        // White background for QR
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
        // Border around QR
        ctx.strokeStyle = '#F0F0F0';
        ctx.lineWidth = 1;
        ctx.strokeRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
        ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
      }
    }

    // URL below QR
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const displayUrl = shareModal.url.length > 60 ? shareModal.url.slice(0, 60) + '…' : shareModal.url;
    ctx.fillText(displayUrl, W / 2, 560);

    // Divider
    ctx.strokeStyle = '#F0F0F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(100, 600);
    ctx.lineTo(W - 100, 600);
    ctx.stroke();

    // Slogan
    ctx.fillStyle = '#333333';
    ctx.font = 'italic 18px "Poppins", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('"O mundo acontece lá fora."', W / 2, 630);

    // Expiry
    if (shareModal.expires_at) {
      const exp = new Date(shareModal.expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      ctx.fillStyle = '#BBBBBB';
      ctx.font = '12px "Poppins", system-ui, sans-serif';
      ctx.fillText(`Válido até ${exp}`, W / 2, 670);
    }

    // Footer
    ctx.fillStyle = '#CCCCCC';
    ctx.font = '10px "Poppins", system-ui, sans-serif';
    ctx.fillText('Intermídia OOH + DOOH — Desde 2007', W / 2, H - 30);

    // Download
    const link = document.createElement('a');
    link.download = `proposta-${(form.clientName || 'qrcode').replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleExportSelectionMap = async () => {
    try {
      if (!proposalPointsForPdf.length) {
        setSimulationError('Inclua pelo menos 1 ponto no PDF para gerar o mapa.');
        return;
      }

      setMapBusy(true);
      setMapStatus('');
      setSimulationError('');

      // Use coordinates already geocoded by the client-address analysis (if user ran it),
      // otherwise ask the backend to resolve the address (reliable, avoids CORS issues).
      let exportClientCoords = clientAnalysis.location || null;
      const cleanedClientAddress = String(form.clientAddress || '').trim();

      if (!exportClientCoords && cleanedClientAddress) {
        setMapStatus('Localizando endereço do cliente...');
        try {
          const geoResponse = await fetchClientAddressAnalysis({
            address: cleanedClientAddress,
            pointIds: [],
            cidade: []
          });
          exportClientCoords = geoResponse?.location || null;
        } catch {
          exportClientCoords = null;
        }
        if (!exportClientCoords) {
          setSimulationError('Endereço do cliente não localizado — o mapa será gerado sem ele.');
        }
      }

      setMapStatus('Carregando tiles do mapa...');

      const slugClient = String(form.clientName || 'proposta')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'proposta';

      await downloadSelectionMapPng(proposalPointsForPdf, {
        connectPoints: connectMapPoints,
        clientCoords: exportClientCoords,
        theme: 'light',
        width: 1800,
        height: 1000,
        fileName: `mapa-selecao-${slugClient}-${new Date().toISOString().slice(0, 10)}.png`
      });

      setMapStatus('');
    } catch (error) {
      setSimulationError(error?.message || 'Falha ao gerar o print do mapa da selecao.');
      setMapStatus('');
    } finally {
      setMapBusy(false);
    }
  };

  const handleGenerateSimulations = async () => {
    const assignedPointIds = proposalSourcePoints
      .map((point) => String(point.id))
      .filter((pointId) => Boolean(pointArtAssignments[pointId]));

    if (!assignedPointIds.length) {
      setSimulationError('Adicione as artes ponto a ponto antes de gerar as simulações.');
      return;
    }

    setSimulationBusy(true);
    setSimulationError('');

    const nextEntries = await Promise.all(proposalSourcePoints.map(async (point) => {
      const pointArtUrl = pointArtAssignments[String(point.id)] || '';
      if (!pointArtUrl) {
        return [point.id, { status: 'Sem arte ponto a ponto', previewUrl: '' }];
      }
      if (!point.simulacao_tela) {
        return [point.id, { status: 'Área da tela não cadastrada no admin', previewUrl: '' }];
      }
      if (!point.imagem) {
        return [point.id, { status: 'Imagem base do ponto não cadastrada', previewUrl: '' }];
      }

      try {
        const config = parseSimulationConfig(point.simulacao_tela);
        if (!config?.corners) {
          return [point.id, { status: 'Área da tela não cadastrada no admin', previewUrl: '' }];
        }
        const result = await generateSimulationPreview({
          baseImageUrl: point.imagem,
          creativeImageUrl: pointArtUrl,
          screen: config,
          panelType: point.tipo,
          displaySettings: simulationSettings,
          mediaParams
        });
        const persistedPreviewUrl = await persistSimulationPreview(result.blob, result.previewUrl);
        return [point.id, { status: 'Gerada', previewUrl: persistedPreviewUrl }];
      } catch (error) {
        if (handleAuthExpired(error, 'Sua sessão expirou durante o upload da simulação. Faça login novamente para salvar os previews.')) {
          return [point.id, {
            status: 'Sessão expirada durante upload da simulação',
            previewUrl: '',
            detail: error?.message || 'Sessão expirada'
          }];
        }
        return [point.id, {
          status: 'Falha ao gerar',
          previewUrl: '',
          detail: error?.message || 'Erro desconhecido'
        }];
      }
    }));

    const failed = nextEntries.find(([, value]) => value.status === 'Falha ao gerar');
    if (failed) {
      setSimulationError(failed[1].detail || 'Uma ou mais simulações falharam.');
    }

    clearSimulationResults();
    setSimulationResults(Object.fromEntries(nextEntries));
    setSimulationBusy(false);
  };

  const handleAiArteEscolhida = (pontoId, urlArte, geracaoId, variacao) => {
    if (!pontoId || !urlArte) {
      return;
    }

    const normalizedPointId = String(pontoId);
    setPointArtAssignments((current) => ({
      ...current,
      [normalizedPointId]: urlArte
    }));

    setSimulationResults((current) => {
      const previous = current[pontoId];
      if (previous?.previewUrl?.startsWith('blob:')) {
        try { URL.revokeObjectURL(previous.previewUrl); } catch { /* ignore */ }
      }
      return {
        ...current,
        [pontoId]: {
          status: 'Arte definida para este ponto',
          previewUrl: '',
          geracaoId,
          variacao
        }
      };
    });
    setSimulationError('');
  };

  // Fecha o modal só quando o clique nasce e termina no backdrop.
  // Evita fechar quando o usuário arrasta uma seleção de texto e solta o mouse fora do modal.
  const backdropMouseDownRef = useRef(false);
  const handleBackdropMouseDown = (e) => {
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && backdropMouseDownRef.current) {
      onClose?.();
    }
    backdropMouseDownRef.current = false;
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onMouseDown={handleBackdropMouseDown}
        onClick={handleBackdropClick}
      >
        <div className={`absolute inset-0 backdrop-blur-md ${isDark ? 'bg-black/70' : 'bg-white/45'}`} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={`proposal-modal-shell relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl border ${isDark ? 'border-white/15 bg-gradient-to-b from-[#11141b] via-[#0d1016] to-[#090c11] shadow-[0_30px_120px_rgba(0,0,0,0.75)]' : 'border-neutral-200 bg-gradient-to-b from-[#ffffff] via-[#fbfcfe] to-[#f3f5f8] shadow-[0_26px_80px_rgba(148,163,184,0.28)]'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`pointer-events-none absolute inset-0 rounded-3xl ${isDark ? 'bg-[radial-gradient(circle_at_15%_5%,rgba(254,92,43,0.12),transparent_35%),radial-gradient(circle_at_90%_0%,rgba(255,255,255,0.07),transparent_28%)]' : 'bg-[radial-gradient(circle_at_12%_4%,rgba(254,92,43,0.16),transparent_36%),radial-gradient(circle_at_94%_0%,rgba(254,92,43,0.10),transparent_32%)]'}`} />

          <button
            onClick={onClose}
            className={`absolute top-4 right-4 z-10 p-2.5 rounded-full border transition-all ${isDark ? 'border-white/10 bg-black/35 hover:bg-black/60 text-white/70 hover:text-white' : 'border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'}`}
          >
            <X size={18} />
          </button>

          {/* ── Header + Stepper ── */}
          <div className="relative flex-shrink-0 p-6 md:px-8 md:pt-8 md:pb-0 space-y-5">
            <div className="flex flex-wrap items-start gap-4 pr-10">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-brand-orange/15 border border-brand-orange/30 shadow-[0_8px_30px_rgba(254,92,43,0.2)]' : 'bg-orange-50 border border-orange-200'}`}>
                <FileText size={22} className={isDark ? 'text-brand-orange' : 'text-orange-600'} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className={`text-xl md:text-2xl leading-tight font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                  Proposta Comercial
                </h2>
                <p className={`text-sm mt-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                  {STEP_TITLES[wizardStep]}
                </p>
              </div>
              <div className={`rounded-xl border px-3 py-2 text-right ${isDark ? 'border-white/10 bg-black/30' : 'border-neutral-200 bg-neutral-50'}`}>
                <div className={`text-[10px] uppercase tracking-wide ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Pontos</div>
                <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{proposalSourcePoints.length}</div>
              </div>
            </div>

            {/* ── Stepper ── */}
            <div className="flex items-center gap-1">
              {WIZARD_STEPS.map((ws, idx) => {
                const done = wizardStep > ws.id;
                const active = wizardStep === ws.id;
                return (
                  <div key={ws.id} className="flex items-center flex-1 last:flex-initial">
                    <button
                      type="button"
                      onClick={() => setWizardStep(ws.id)}
                      title={`Ir para ${ws.label}`}
                      className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-all ${
                        active
                          ? 'bg-brand-orange text-white shadow-[0_4px_16px_rgba(254,92,43,0.35)]'
                          : done
                            ? isDark
                              ? 'bg-brand-orange/15 text-brand-orange cursor-pointer hover:bg-brand-orange/25'
                              : 'bg-orange-50 text-orange-700 cursor-pointer hover:bg-orange-100'
                            : isDark
                              ? 'bg-white/[0.06] text-brand-gray-500'
                              : 'bg-neutral-100 text-neutral-400'
                      }`}
                    >
                      {done ? <Check size={13} /> : <span>{ws.id}</span>}
                      <span className="hidden sm:inline">{ws.label}</span>
                    </button>
                    {idx < WIZARD_STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-1.5 ${done ? (isDark ? 'bg-brand-orange/40' : 'bg-orange-300') : isDark ? 'bg-white/10' : 'bg-neutral-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Step content (scrollable) ── */}
          <div className="relative flex-1 overflow-y-auto p-6 md:px-8 md:pb-4 space-y-6">
            <AnimatePresence mode="wait">
              {/* ═══ STEP 1 — Dados da proposta ═══ */}
              {wizardStep === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">

                  {/* CARD 1 — Informações do cliente */}
                  <Card isDark={isDark} title="Informações do cliente">
                    <div className="grid md:grid-cols-2 gap-3">
                      <Input isDark={isDark} label="Nome do cliente" value={form.clientName} onChange={(v) => setForm((s) => ({ ...s, clientName: v }))} />
                      <Input isDark={isDark} label="Endereço do cliente" value={form.clientAddress} onChange={(v) => setForm((s) => ({ ...s, clientAddress: v }))} />
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <Input isDark={isDark} label="Subtítulo da capa (opcional)" value={form.proposalSubtitle} onChange={(v) => setForm((s) => ({ ...s, proposalSubtitle: v }))} />
                      <Input isDark={isDark} label="Duração do contrato (meses)" type="number" min="1" value={form.duracao_meses} onChange={(v) => setForm((s) => ({ ...s, duracao_meses: v }))} placeholder="Ex: 6, 12" />
                    </div>
                  </Card>

                  {/* CARD 2 — Configuração da campanha */}
                  <Card isDark={isDark} title="Configuração da campanha">
                    <div className="grid md:grid-cols-2 gap-3">
                      <CustomSelect isDark={isDark} label="Praças" value={form.selectedCities} onChange={(v) => setForm((s) => ({ ...s, selectedCities: v }))} options={availableCities} multiple placeholder="Todas as praças" />
                      <CustomSelect
                        isDark={isDark}
                        label="Segmento"
                        multiple
                        value={form.segmento ? String(form.segmento).split(',').map((s) => s.trim()).filter(Boolean) : []}
                        onChange={(arr) => setForm((s) => ({ ...s, segmento: (Array.isArray(arr) ? arr : [arr]).filter(Boolean).join(', ') }))}
                        options={SEGMENTOS.map((seg) => ({ value: seg, label: getSegmentDisplayName(seg) }))}
                        allowCustom
                        customPlaceholder="Segmento personalizado"
                        placeholder="Selecione um ou mais segmentos"
                      />
                      <CustomSelect
                        isDark={isDark}
                        label="Objetivo"
                        multiple
                        value={form.objetivo ? String(form.objetivo).split(',').map((s) => s.trim()).filter(Boolean) : []}
                        onChange={(arr) => setForm((s) => ({ ...s, objetivo: (Array.isArray(arr) ? arr : [arr]).filter(Boolean).join(', ') }))}
                        options={OBJETIVOS}
                        allowCustom
                        customPlaceholder="Objetivo personalizado"
                        placeholder="Selecione um ou mais objetivos"
                      />
                      <CustomSelect isDark={isDark} label="Públicos" value={form.publicos} onChange={(v) => setForm((s) => ({ ...s, publicos: v }))} options={availablePublicos} multiple placeholder="Públicos estratégicos" />
                    </div>
                  </Card>

                  {/* CARD 3 — Estratégia da campanha */}
                  <Card isDark={isDark} title="Estratégia da campanha">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Esses tópicos aparecem na narrativa estratégica do PDF.</p>
                      <button
                        type="button"
                        onClick={handleGerarTextoIA}
                        disabled={aiTextBusy || !proposalPoints.length}
                        className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${isDark ? 'bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25 border border-brand-orange/25' : 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'}`}
                      >
                        {aiTextBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {aiTextBusy ? 'Gerando...' : 'Gerar com IA'}
                      </button>
                    </div>
                    <div className="space-y-2 mt-2">
                      {strategicTopicList.length ? strategicTopicList.map((topic, index) => (
                        <div
                          key={`strategic-topic-${index}`}
                          className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 ${isDark ? 'border-white/15 bg-white/[0.06]' : 'border-neutral-200 bg-white'}`}
                        >
                          <span className={`mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-semibold ${isDark ? 'bg-brand-orange/20 text-brand-orange' : 'bg-orange-100 text-orange-700'}`}>
                            {index + 1}
                          </span>
                          <input
                            type="text"
                            value={topic}
                            onChange={(event) => handleStrategicTopicChange(index, event.target.value)}
                            placeholder={`Tópico ${index + 1}`}
                            className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-brand-gray-200 placeholder:text-brand-gray-500' : 'text-neutral-800 placeholder:text-neutral-400'}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveStrategicTopic(index)}
                            className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${isDark ? 'text-brand-gray-400 hover:bg-white/10 hover:text-red-300' : 'text-neutral-400 hover:bg-neutral-100 hover:text-red-500'}`}
                            title="Remover tópico"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )) : (
                        <div className={`rounded-xl border px-3 py-2.5 text-sm ${isDark ? 'border-white/15 bg-white/[0.06] text-brand-gray-400' : 'border-neutral-200 bg-white text-neutral-500'}`}>
                          Nenhum tópico disponível. Gere com IA ou adicione manualmente.
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddStrategicTopic}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${isDark ? 'border-white/20 text-brand-gray-300 hover:border-brand-orange/45 hover:text-brand-orange' : 'border-neutral-300 text-neutral-600 hover:border-orange-300 hover:text-orange-700'}`}
                      >
                        <Plus size={12} />
                        Adicionar tópico
                      </button>
                      {!usingAutoStrategicTopics && (
                        <button
                          type="button"
                          onClick={handleResetStrategicTopics}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${isDark ? 'border-brand-orange/35 text-brand-orange hover:bg-brand-orange/10' : 'border-orange-300 text-orange-700 hover:bg-orange-50'}`}
                        >
                          Usar sugestão automática
                        </button>
                      )}
                    </div>

                    <p className={`text-[11px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                      {usingAutoStrategicTopics ? 'Modo automático ativo: os tópicos são derivados da estratégia da proposta.' : 'Modo manual ativo: os tópicos acima serão usados exatamente no PDF.'}
                    </p>
                  </Card>

                  {/* CARD 4 — Análise de entorno */}
                  <Card isDark={isDark} title="Análise de entorno">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <ScopeButton isDark={isDark} active={analysisMode === 'segmento'} onClick={() => setAnalysisMode('segmento')}>Entorno padrão</ScopeButton>
                      <ScopeButton isDark={isDark} active={analysisMode === 'client-address'} onClick={() => setAnalysisMode('client-address')}>Entorno personalizado</ScopeButton>
                      <button
                        type="button"
                        onClick={handleRefreshEntorno}
                        disabled={entorno.loading}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${isDark ? 'border-brand-orange/35 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
                      >
                        {entorno.loading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                        {entorno.loading ? 'Atualizando...' : 'Atualizar agora'}
                      </button>
                      {entorno.loading && <span className="text-xs text-brand-orange">Atualizando...</span>}
                    </div>

                    {analysisMode === 'segmento' && (
                      <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                        Atualização manual · Score por segmento · Cache {(entorno.coverage * 100).toFixed(0)}%
                        {entorno.updatedAt ? ` · ${new Date(entorno.updatedAt).toLocaleString('pt-BR')}` : ''}
                      </p>
                    )}

                    {analysisMode === 'client-address' && (
                      <div className={`text-xs space-y-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                        {clientAnalysis.loading && <p className="text-brand-orange">Analisando proximidade...</p>}
                        {clientAnalysis.error && <p className="text-red-300">{clientAnalysis.error}</p>}
                        {!clientAnalysis.loading && !clientAnalysis.error && form.clientAddress.trim() && clientAnalysis.rankedPoints.length > 0 && (
                          <div className="space-y-1">
                            <p className={`font-semibold uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Pontos mais próximos</p>
                            {clientAnalysis.rankedPoints.slice(0, 3).map((pt) => (
                              <p key={pt.id}>{pt.nome} · {pt.distanceKm.toFixed(1).replace('.', ',')} km</p>
                            ))}
                          </div>
                        )}
                        {!form.clientAddress.trim() && <p>Preencha o endereço do cliente acima.</p>}
                      </div>
                    )}
                    {entorno.error && <p className="text-xs text-red-300">{entorno.error}</p>}
                  </Card>
                </motion.div>
              )}

              {/* ═══ STEP 2 — Desconto comercial ═══ */}
              {wizardStep === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">
                  <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
                    {/* LEFT — Tipo de desconto */}
                    <Card isDark={isDark} title="Tipo de desconto">
                      <div className="flex flex-wrap gap-2">
                        {[
                          ['none', 'Sem desconto'],
                          ['total', 'No total da proposta'],
                          ['specific', 'Em pontos específicos'],
                          ['individual', 'Individual por ponto']
                        ].map(([mode, label]) => (
                          <ScopeButton isDark={isDark} key={mode} active={discountConfig.mode === mode} onClick={() => setDiscountConfig((c) => ({ ...c, mode }))}>{label}</ScopeButton>
                        ))}
                      </div>

                      {discountConfig.mode !== 'none' && (
                        <div className="space-y-2 mt-3">
                          <p className={`text-[11px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Valor do desconto</p>
                          <div className="flex flex-wrap gap-2">
                            <ScopeButton
                              isDark={isDark}
                              active={discountValueType === 'percentage'}
                              onClick={() => setDiscountConfig((c) => ({
                                ...c,
                                valueType: 'percentage',
                                ...(c.mode === 'individual' && c.valueType !== 'percentage' ? { perPoint: {} } : {})
                              }))}
                            >
                              Percentual (%)
                            </ScopeButton>
                            <ScopeButton
                              isDark={isDark}
                              active={discountValueType === 'amount'}
                              onClick={() => setDiscountConfig((c) => ({
                                ...c,
                                valueType: 'amount',
                                ...(c.mode === 'individual' && c.valueType !== 'amount' ? { perPoint: {} } : {})
                              }))}
                            >
                              {discountConfig.mode === 'individual' ? 'Valor final do ponto (R$)' : 'Valor (R$)'}
                            </ScopeButton>
                          </div>
                        </div>
                      )}

                      {(discountConfig.mode === 'total' || discountConfig.mode === 'specific') && (
                        <div className="space-y-3 mt-3">
                          {discountValueType === 'amount' ? (
                            <Input
                              isDark={isDark}
                              label="Valor total do desconto"
                              value={discountConfig.amount}
                              onChange={(v) => setDiscountConfig((c) => ({ ...c, amount: v }))}
                              placeholder="Ex: 1500,00"
                            />
                          ) : (
                            <Input
                              isDark={isDark}
                              label="Percentual de desconto"
                              value={discountConfig.percentage}
                              onChange={(v) => setDiscountConfig((c) => ({ ...c, percentage: v }))}
                              placeholder="Ex: 12,5"
                            />
                          )}

                          {discountValueType === 'amount' && (
                            <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                              O valor informado será distribuído proporcionalmente no escopo escolhido em Tipo de desconto.
                            </p>
                          )}

                          {discountConfig.mode === 'specific' && (
                            <div className={`rounded-xl border p-3 space-y-2 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50'}`}>
                              <p className={`text-[11px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Pontos com desconto</p>
                              {proposalSourcePoints.map((pt) => (
                                <label key={pt.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-white/10 text-brand-gray-300' : 'border-neutral-200 text-neutral-600'}`}>
                                  <span>{pt.nome}</span>
                                  <input
                                    type="checkbox"
                                    checked={discountConfig.targetPointIds.map(String).includes(String(pt.id))}
                                    onChange={(e) => {
                                      const pointKey = String(pt.id);
                                      setDiscountConfig((c) => ({
                                        ...c,
                                        targetPointIds: e.target.checked
                                          ? [...new Set([...(c.targetPointIds || []).map(String), pointKey])]
                                          : (c.targetPointIds || []).map(String).filter((i) => i !== pointKey)
                                      }));
                                    }}
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {discountConfig.mode === 'individual' && (
                        <div className="grid md:grid-cols-2 gap-3 mt-3">
                          {proposalSourcePoints.map((pt) => {
                            const rawValue = discountConfig.perPoint[pt.id] ?? '';
                            const tabela = Number(pt.preco) || 0;
                            const isAmount = discountValueType === 'amount';
                            const placeholder = isAmount
                              ? tabela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : '0%';
                            const suffix = isAmount ? 'R$' : '%';
                            // Calcula desconto efetivo apenas no modo "valor final"
                            let descontoCalculado = null;
                            if (isAmount && rawValue !== '' && rawValue !== null && rawValue !== undefined) {
                              const desejado = Math.max(0, Math.min(Number(String(rawValue).replace(',', '.')) || 0, tabela));
                              const desc = tabela - desejado;
                              const pctDesc = tabela > 0 ? (desc / tabela) * 100 : 0;
                              descontoCalculado = { desc, pctDesc };
                            }
                            return (
                              <div key={pt.id} className={`rounded-xl border px-3 py-3 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50'}`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{pt.nome}</p>
                                    <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Tabela: {formatCurrency(pt.preco)}</p>
                                  </div>
                                  <div className={`flex items-center gap-1 rounded-lg border px-2 ${isDark ? 'border-white/10 bg-white/5' : 'border-neutral-200 bg-white'}`}>
                                    {isAmount && (
                                      <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{suffix}</span>
                                    )}
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={rawValue}
                                      onChange={(e) => setDiscountConfig((c) => ({ ...c, perPoint: { ...c.perPoint, [pt.id]: e.target.value } }))}
                                      className={`w-24 px-1 py-2 text-sm outline-none bg-transparent ${isDark ? 'text-white' : 'text-neutral-800'}`}
                                      placeholder={placeholder}
                                      title={isAmount ? 'Digite o valor final desejado para este ponto' : 'Digite o percentual de desconto'}
                                    />
                                    {!isAmount && (
                                      <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{suffix}</span>
                                    )}
                                  </div>
                                </div>
                                {isAmount && (
                                  <p className={`mt-2 text-[11px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                                    {descontoCalculado && descontoCalculado.desc > 0 ? (
                                      <>
                                        Desconto aplicado: <span className={isDark ? 'text-yellow-400 font-semibold' : 'text-yellow-700 font-semibold'}>
                                          {formatCurrency(descontoCalculado.desc)} ({descontoCalculado.pctDesc.toFixed(1).replace('.', ',')}%)
                                        </span>
                                      </>
                                    ) : (
                                      <>Digite o <span className="font-semibold">valor final desejado</span> — o desconto é calculado automaticamente.</>
                                    )}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className={`rounded-xl border p-3 mt-4 space-y-3 ${isDark ? 'border-brand-orange/30 bg-brand-orange/[0.06]' : 'border-orange-200 bg-orange-50/60'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={`text-[11px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Comissão de agência</p>
                            <p className={`text-xs mt-1 ${isDark ? 'text-brand-gray-500' : 'text-neutral-600'}`}>
                              Acrescenta um percentual no valor final da proposta e exibe a comissão separadamente.
                            </p>
                          </div>
                          <label className={`inline-flex items-center gap-2 text-xs font-medium ${isDark ? 'text-brand-gray-200' : 'text-neutral-700'}`}>
                            <input
                              type="checkbox"
                              checked={Boolean(form.agencyCommissionEnabled)}
                              onChange={(event) => setForm((state) => ({ ...state, agencyCommissionEnabled: event.target.checked }))}
                            />
                            {form.agencyCommissionEnabled ? 'Ativada' : 'Desativada'}
                          </label>
                        </div>

                        {form.agencyCommissionEnabled && (
                          <div className="space-y-2">
                            <Input
                              isDark={isDark}
                              label="Comissão (%)"
                              value={form.agencyCommissionPercent}
                              onChange={(value) => setForm((state) => ({ ...state, agencyCommissionPercent: value }))}
                              placeholder="Ex: 20"
                            />
                            <p className={`text-xs ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                              Comissão estimada: <span className="font-semibold">{formatCurrency(pricingSummaryWithCommission.agencyCommissionAmount || 0)}</span>
                              {agencyCommissionPercent > 0 ? ` (${agencyCommissionPercentLabel}%)` : ''}.
                            </p>
                          </div>
                        )}
                      </div>
                    </Card>

                    {/* RIGHT — Resumo financeiro */}
                    <div className={`rounded-2xl border p-5 space-y-4 sticky top-0 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                      <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Resumo financeiro</h3>
                      <div className="space-y-3">
                        <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-white'}`}>
                          <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Tabela cheia</div>
                          <div className={`text-xl font-bold mt-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>{formatCurrency(pricingSummary.originalTotal)}</div>
                        </div>
                        <div className={`rounded-xl border p-3 ${isDark ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-yellow-200 bg-yellow-50'}`}>
                          <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Desconto total</div>
                          <div className={`text-xl font-bold mt-1 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>{formatCurrency(pricingSummary.discountTotal)}</div>
                        </div>
                        {pricingSummaryWithCommission.hasAgencyCommission && (
                          <div className={`rounded-xl border p-3 ${isDark ? 'border-blue-500/20 bg-blue-500/5' : 'border-blue-200 bg-blue-50'}`}>
                            <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                              Comissão de agência ({agencyCommissionPercentLabel}%)
                            </div>
                            <div className={`text-xl font-bold mt-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                              +{formatCurrency(pricingSummaryWithCommission.agencyCommissionAmount)}
                            </div>
                          </div>
                        )}
                        <div className={`rounded-2xl border-2 p-4 ${isDark ? 'border-green-500/30 bg-green-500/5' : 'border-green-300 bg-green-50'}`}>
                          <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Valor final</div>
                          <div className={`text-3xl font-extrabold mt-1 ${isDark ? 'text-green-400' : 'text-green-600'}`}>{formatCurrency(pricingSummaryWithCommission.finalTotalWithCommission)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ═══ STEP 3 — Artes por ponto ═══ */}
              {wizardStep === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">

                  <Card isDark={isDark} title="Artes por ponto">
                    <p className={`text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>
                      Faça upload da arte em cada ponto. Quando houver mesma proporção, o sistema replica automaticamente para os pontos compatíveis.
                    </p>
                    <p className={`text-xs mt-2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                      Após preencher todos os pontos abaixo, role até o final para gerar todas as simulações de uma só vez.
                    </p>
                  </Card>

                  <ArteAIPanel
                    points={proposalPoints}
                    segmento={form.segmento}
                    cidade={activeCities}
                    clientName={form.clientName}
                    propostaId={null}
                    isDark={isDark}
                    onArteEscolhida={handleAiArteEscolhida}
                    manualOnly
                  />

                  <div className="grid sm:grid-cols-4 gap-3">
                    <StatusCard isDark={isDark} label="Pontos na proposta" value={proposalSourcePoints.length} tone="default" />
                    <StatusCard isDark={isDark} label="Pontos com arte" value={assignedPointArtCount} tone="default" />
                    <StatusCard isDark={isDark} label="Simulações geradas" value={Object.values(simulationResults).filter((i) => String(i.status || '').startsWith('Gerada')).length} tone="success" />
                    <StatusCard isDark={isDark} label="Pendências de cadastro" value={Object.values(simulationResults).filter((i) => i.status === 'Área da tela não cadastrada no admin' || i.status === 'Imagem base do ponto não cadastrada').length} tone="warning" />
                  </div>

                  {/* ── CTA: Gerar todas as simulações (após upload dos pontos) ── */}
                  <Card isDark={isDark}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Pronto para gerar?</h3>
                        <p className={`text-xs mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                          {assignedPointArtCount === 0
                            ? 'Faça upload das artes acima antes de gerar.'
                            : assignedPointArtCount < proposalSourcePoints.length
                              ? `${proposalSourcePoints.length - assignedPointArtCount} ponto(s) sem arte. Você ainda pode gerar parcialmente.`
                              : 'Todos os pontos têm arte atribuída.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateSimulations}
                        disabled={simulationBusy || !proposalSourcePoints.length}
                        className="h-12 px-6 rounded-xl bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white text-sm font-extrabold tracking-[0.03em] hover:from-[#E85A1A] hover:to-[#C94A1A] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_12px_26px_rgba(254,92,43,0.35)]"
                      >
                        {simulationBusy ? 'Gerando simulações ponto a ponto...' : 'GERAR TODAS AS SIMULAÇÕES PONTO A PONTO'}
                      </button>
                    </div>
                    {simulationError && (
                      <p className={`text-xs mt-3 rounded-lg border px-3 py-2 ${isDark ? 'text-red-300 border-red-500/20 bg-red-500/10' : 'text-red-600 border-red-300 bg-red-50'}`}>{simulationError}</p>
                    )}
                  </Card>

                  {/* ── Seletor de Tipo de Mídia ── */}
                  <Card isDark={isDark}>
                    <div className="flex items-center gap-2 mb-3">
                      <Radio size={15} className={isDark ? 'text-brand-gray-400' : 'text-neutral-500'} />
                      <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Tipo de mídia</h3>
                    </div>

                    {/* Botões LED / Backlight / Frontlight */}
                    <div className="flex gap-2 mb-4">
                      {[
                        { key: 'led',        label: 'LED',        desc: 'Emissão direta de luz' },
                        { key: 'backlight',  label: 'Backlight',  desc: 'Lona iluminada por trás' },
                        { key: 'frontlight', label: 'Frontlight', desc: 'Lona com holofote frontal' }
                      ].map(({ key, label, desc }) => {
                        const active = mediaParams.mediaMode === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setMediaParams((p) => ({ ...p, mediaMode: key }))}
                            className={`flex-1 rounded-xl border px-3 py-2.5 text-center transition-all ${
                              active
                                ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                                : isDark
                                  ? 'border-white/10 bg-white/[0.03] text-brand-gray-400 hover:border-white/20 hover:text-white'
                                  : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-300 hover:text-neutral-800'
                            }`}
                          >
                            <div className="text-xs font-semibold">{label}</div>
                            <div className={`text-[10px] mt-0.5 ${active ? 'text-brand-orange/80' : isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{desc}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Parâmetros comuns a backlight e frontlight */}
                    {mediaParams.mediaMode !== 'led' && (
                      <div className="space-y-4">
                        {/* Temperatura de cor */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <label className={`text-[11px] uppercase tracking-wide ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Temperatura de cor</label>
                            <div className="flex gap-1.5">
                              {[
                                { k: 3000, label: 'Quente', color: '#ffb347' },
                                { k: 4000, label: 'Neutro', color: '#ffe0b0' },
                                { k: 6500, label: 'Frio',   color: '#b0c8ff' }
                              ].map(({ k, label, color }) => (
                                <button
                                  key={k}
                                  type="button"
                                  onClick={() => setMediaParams((p) => ({ ...p, colorTemp: k }))}
                                  className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${
                                    mediaParams.colorTemp === k
                                      ? 'border-transparent text-black'
                                      : isDark
                                        ? 'border-white/10 text-brand-gray-400 bg-white/[0.04] hover:border-white/20'
                                        : 'border-neutral-200 text-neutral-500 bg-neutral-50 hover:border-neutral-300'
                                  }`}
                                  style={mediaParams.colorTemp === k ? { backgroundColor: color } : {}}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <SliderField
                            isDark={isDark}
                            label="Intensidade da luz"
                            value={Math.round(mediaParams.lightIntensity * 100)}
                            min={0} max={100} step={1}
                            onChange={(v) => setMediaParams((p) => ({ ...p, lightIntensity: v / 100 }))}
                          />
                          <SliderField
                            isDark={isDark}
                            label="Textura do tecido"
                            value={Math.round(mediaParams.textureIntensity * 100)}
                            min={0} max={100} step={1}
                            onChange={(v) => setMediaParams((p) => ({ ...p, textureIntensity: v / 100 }))}
                          />
                        </div>

                        {/* Ângulo da luz — apenas frontlight */}
                        {mediaParams.mediaMode === 'frontlight' && (
                          <div className="grid md:grid-cols-2 gap-4">
                            <SliderField
                              isDark={isDark}
                              label="Ângulo da luz (°)"
                              value={mediaParams.lightAngle}
                              min={0} max={180} step={5}
                              onChange={(v) => setMediaParams((p) => ({ ...p, lightAngle: v }))}
                            />
                            <div className="flex items-center gap-3 pt-5">
                              <button
                                type="button"
                                onClick={() => setMediaParams((p) => ({ ...p, worn: !p.worn }))}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${mediaParams.worn ? 'bg-brand-orange' : isDark ? 'bg-white/10' : 'bg-neutral-200'}`}
                              >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${mediaParams.worn ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                              <label className={`text-[11px] uppercase tracking-wide cursor-pointer ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} onClick={() => setMediaParams((p) => ({ ...p, worn: !p.worn }))}>
                                Material usado
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>

                  {/* Ajustes avançados (colapsável) */}
                  <Card isDark={isDark}>
                    <button type="button" onClick={() => setAdvancedRealismOpen(!advancedRealismOpen)} className="w-full flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Settings2 size={16} className={isDark ? 'text-brand-gray-400' : 'text-neutral-500'} />
                        <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Ajustes avançados{mediaParams.mediaMode !== 'led' ? ' (LED)' : ''}</h3>
                      </div>
                      <ChevronDown size={18} className={`shrink-0 transition-transform ${isDark ? 'text-brand-gray-400' : 'text-neutral-400'} ${advancedRealismOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {advancedRealismOpen && (
                      <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                        <SliderField isDark={isDark} label="Brilho da tela" value={simulationSettings.brightness} min={0.7} max={1.8} step={0.01} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, brightness: v }))} />
                        <SliderField isDark={isDark} label="Reflexo do vidro" value={simulationSettings.reflection} min={0} max={0.55} step={0.01} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, reflection: v }))} />
                        <SliderField isDark={isDark} label="Vazamento de luz" value={simulationSettings.spill} min={0} max={0.45} step={0.01} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, spill: v }))} />
                        <SliderField isDark={isDark} label="Intensidade dos pixels" value={simulationSettings.ledPixelIntensity} min={0} max={0.45} step={0.01} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, ledPixelIntensity: v }))} />
                        <SliderField isDark={isDark} label="Tamanho do pixel LED" value={simulationSettings.ledPixelSize} min={3} max={14} step={1} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, ledPixelSize: v }))} />
                        <SliderField isDark={isDark} label="Glare / luz especular" value={simulationSettings.glare} min={0} max={0.4} step={0.01} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, glare: v }))} />
                      </div>
                    )}
                  </Card>
                </motion.div>
              )}

              {/* ═══ STEP 4 — Revisão ═══ */}
              {wizardStep === 4 && (
                <motion.div key="step4" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">

                  {/* Resumo da proposta */}
                  <Card isDark={isDark} title="Resumo da proposta">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <MiniStat isDark={isDark} label="Cliente" value={form.clientName || '—'} />
                      <MiniStat isDark={isDark} label="Cidades" value={activeCities.join(', ') || 'Todas'} />
                      <MiniStat isDark={isDark} label="Segmento" value={getSegmentDisplayName(form.segmento)} />
                      <MiniStat isDark={isDark} label="Públicos" value={form.publicos.length ? form.publicos.join(', ') : 'Todos'} />
                      <MiniStat isDark={isDark} label="Pontos no PDF" value={`${proposalPointsForPdf.length}/${proposalPoints.length}`} />
                    </div>

                    {hiddenPointsCount > 0 && (
                      <p className={`text-xs mt-2 ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
                        {hiddenPointsCount} ponto(s) está(ão) oculto(s) no PDF.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        onClick={resetAllPdfEdits}
                        className={`h-9 px-3 rounded-xl border text-xs font-medium transition-colors ${isDark ? 'border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'}`}
                      >
                        Restaurar dados originais do PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardStep(1)}
                        className={`h-9 px-3 rounded-xl border text-xs font-medium transition-colors ${isDark ? 'border-brand-orange/35 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
                      >
                        Editar dados gerais (cliente/estratégia)
                      </button>
                    </div>
                  </Card>

                  {/* Próximo passo: edição guiada */}
                  <Card isDark={isDark} title="Edição guiada do PDF (próximo passo)">
                    <p className={`text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>
                      No próximo passo você só precisa fazer 3 ações simples para finalizar o PDF.
                    </p>
                    <div className="grid sm:grid-cols-3 gap-2 mt-3">
                      <div className={`rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
                        <p className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-orange' : 'text-orange-600'}`}>1</p>
                        Escolha quais pontos entram no PDF.
                      </div>
                      <div className={`rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
                        <p className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-orange' : 'text-orange-600'}`}>2</p>
                        Clique em Editar e ajuste só o que quiser.
                      </div>
                      <div className={`rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
                        <p className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-orange' : 'text-orange-600'}`}>3</p>
                        Avance para gerar e compartilhar.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardStep(5)}
                      className="mt-3 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-hover"
                    >
                      Abrir edição guiada
                      <ChevronRight size={15} />
                    </button>
                  </Card>

                  {/* Preview ampliado */}
                  <PreviewPanel proposalPoints={proposalPointsForPdf} activePreviewPoint={activePreviewPoint} onSelect={setActivePreviewPointId} onExpand={() => setShowPreviewLightbox(true)} requireGeneratedPreview={hasPointArtAssignments} isDark={isDark} />
                </motion.div>
              )}

              {/* ═══ STEP 5 — Edição final do PDF ═══ */}
              {wizardStep === 5 && (
                <motion.div key="step5" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">

                  <Card isDark={isDark} title="Editar PDF de forma simples">
                    <p className={`text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>
                      Pense assim: marcar, editar e gerar. Não altera o cadastro original dos pontos.
                    </p>
                    <div className="grid sm:grid-cols-3 gap-2 mt-3">
                      <div className={`rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
                        <p className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-orange' : 'text-orange-600'}`}>Passo 1</p>
                        Deixe marcado apenas o que vai entrar no PDF.
                      </div>
                      <div className={`rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
                        <p className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-orange' : 'text-orange-600'}`}>Passo 2</p>
                        Clique em Editar para corrigir nome, cidade, valor e métricas.
                      </div>
                      <div className={`rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
                        <p className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-orange' : 'text-orange-600'}`}>Passo 3</p>
                        Clique em Próximo para gerar e compartilhar.
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        type="button"
                        onClick={resetAllPdfEdits}
                        className={`h-9 px-3 rounded-xl border text-xs font-medium transition-colors ${isDark ? 'border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'}`}
                      >
                        Restaurar dados originais do PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardStep(1)}
                        className={`h-9 px-3 rounded-xl border text-xs font-medium transition-colors ${isDark ? 'border-brand-orange/35 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
                      >
                        Voltar para dados gerais
                      </button>
                    </div>
                  </Card>

                  <Card isDark={isDark} title="Assinatura e condições comerciais">
                    <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                      A assinatura do vendedor será exibida no PDF e no link público. Você também pode adicionar múltiplas condições de proposta para criar uma nova página comercial.
                    </p>
                    <div className="grid md:grid-cols-3 gap-3">
                      <Input isDark={isDark} label="Nome do vendedor" value={form.sellerName} onChange={(v) => setForm((s) => ({ ...s, sellerName: v }))} placeholder="Nome completo" />
                      <Input isDark={isDark} label="E-mail do vendedor" type="email" value={form.sellerEmail} onChange={(v) => setForm((s) => ({ ...s, sellerEmail: v }))} placeholder="nome@empresa.com" />
                      <Input isDark={isDark} label="Telefone do vendedor" value={form.sellerPhone} onChange={(v) => setForm((s) => ({ ...s, sellerPhone: v }))} placeholder="(43) 99999-9999" />
                    </div>

                    <div className="space-y-3 mt-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={`text-xs ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                          Exemplo: Proposta 1 (20 pontos), Proposta 2 (30 pontos), Proposta 3 (40 pontos), cada uma com observação própria.
                        </p>
                        <button
                          type="button"
                          onClick={handleAddProposalOption}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold transition-colors ${isDark ? 'border-brand-orange/35 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
                        >
                          <Plus size={12} />
                          Adicionar proposta
                        </button>
                      </div>

                      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {proposalOptionsForForm.map((option, index) => (
                          <div key={option.id} className={`rounded-2xl border p-3 ${isDark ? 'border-brand-orange/30 bg-brand-orange/[0.06]' : 'border-orange-200 bg-orange-50/50'}`}>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={option.title}
                                onChange={(event) => updateProposalOptionField(option.id, 'title', event.target.value)}
                                className={`min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-sm font-semibold outline-none ${isDark ? 'bg-black/25 border-white/15 text-white focus:border-brand-orange/45' : 'bg-white border-neutral-200 text-neutral-800 focus:border-brand-orange/50'}`}
                                placeholder={`Proposta ${index + 1}`}
                              />
                              {proposalOptionsForForm.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProposalOption(option.id)}
                                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${isDark ? 'border-red-400/35 text-red-300 hover:bg-red-500/15' : 'border-red-200 text-red-500 hover:bg-red-50'}`}
                                  title="Remover proposta"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-3">
                              <div>
                                <label className={`text-[10px] uppercase tracking-[0.11em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Qtd. pontos</label>
                                <input
                                  type="text"
                                  value={option.points}
                                  onChange={(event) => updateProposalOptionField(option.id, 'points', event.target.value)}
                                  placeholder="Ex: 20"
                                  className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-xs outline-none ${isDark ? 'bg-white/[0.07] border-white/15 text-white focus:border-brand-orange/45' : 'bg-white border-neutral-200 text-neutral-800 focus:border-brand-orange/50'}`}
                                />
                              </div>
                              <div>
                                <label className={`text-[10px] uppercase tracking-[0.11em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Valor por ponto</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={option.pricePerPoint}
                                  onChange={(event) => updateProposalOptionCurrencyField(option.id, 'pricePerPoint', event.target.value)}
                                  placeholder="Ex: 1.250,00"
                                  className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-xs outline-none ${isDark ? 'bg-white/[0.07] border-white/15 text-white focus:border-brand-orange/45' : 'bg-white border-neutral-200 text-neutral-800 focus:border-brand-orange/50'}`}
                                />
                              </div>
                              <div>
                                <label className={`text-[10px] uppercase tracking-[0.11em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Valor total</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={option.totalValue}
                                  onChange={(event) => updateProposalOptionCurrencyField(option.id, 'totalValue', event.target.value)}
                                  placeholder="Ex: 25.000,00"
                                  className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-xs outline-none ${isDark ? 'bg-white/[0.07] border-white/15 text-white focus:border-brand-orange/45' : 'bg-white border-neutral-200 text-neutral-800 focus:border-brand-orange/50'}`}
                                />
                              </div>
                              <div>
                                <label className={`text-[10px] uppercase tracking-[0.11em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Duração (meses)</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={option.months}
                                  onChange={(event) => updateProposalOptionField(option.id, 'months', event.target.value)}
                                  placeholder="Ex: 12"
                                  className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-xs outline-none ${isDark ? 'bg-white/[0.07] border-white/15 text-white focus:border-brand-orange/45' : 'bg-white border-neutral-200 text-neutral-800 focus:border-brand-orange/50'}`}
                                />
                              </div>
                            </div>

                            <div className="mt-3">
                              <label className={`text-[10px] uppercase tracking-[0.11em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Observação</label>
                              <textarea
                                rows={3}
                                value={option.note}
                                onChange={(event) => updateProposalOptionField(option.id, 'note', event.target.value)}
                                placeholder="Observação opcional para esta proposta."
                                className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-xs outline-none resize-none ${isDark ? 'bg-white/[0.07] border-white/15 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/45' : 'bg-white border-neutral-200 text-neutral-800 placeholder:text-neutral-400 focus:border-brand-orange/50'}`}
                              />
                            </div>

                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleFillProposalOptionFromCurrentPlan(option.id)}
                                className={`h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors ${isDark ? 'border-white/15 bg-white/[0.03] text-brand-gray-200 hover:bg-white/[0.08]' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'}`}
                              >
                                Usar dados da seleção atual
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>

                  <Card isDark={isDark} title="O que entra no PDF">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={`text-[11px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                            <th className="text-left pb-3 pr-3">Incluir</th>
                            <th className="text-left pb-3 pr-3">Ponto</th>
                            <th className="text-left pb-3 pr-3">Simulação</th>
                            <th className="text-left pb-3 pr-3">Cidade / Tipo</th>
                            <th className="text-right pb-3 pr-3">Valor</th>
                            <th className="text-left pb-3">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {proposalPoints.map((pt) => {
                            const pointId = String(pt.id);
                            const previewPoint = proposalPointsEditedMap[pointId] || pt;
                            const pointEdit = pdfPointEdits[pointId] || {};
                            const hasCustomEdit = Object.keys(pointEdit).length > 0;
                            const isIncluded = !pdfExcludedPointIds.includes(pointId);
                            const isEditing = String(editingPdfPointId) === pointId;
                            const previewUrl = getPointPreviewUrl(previewPoint, hasPointArtAssignments);
                            const hasPreview = !!previewUrl;
                            const priceValue = Number(previewPoint?.precoFinal ?? previewPoint?.preco);
                            const priceLabel = Number.isFinite(priceValue) && priceValue > 0 ? formatCurrency(priceValue) : '—';

                            const getFieldValue = (fieldKey) => {
                              if (Object.prototype.hasOwnProperty.call(pointEdit, fieldKey)) {
                                return pointEdit[fieldKey] ?? '';
                              }
                              if (fieldKey === 'tempo') {
                                return pt?.tempo_insercao ?? pt?.tempo ?? '';
                              }
                              if (fieldKey === 'preco') {
                                const basePrice = pt?.precoFinal ?? pt?.preco ?? '';
                                return basePrice === null || basePrice === undefined ? '' : String(basePrice);
                              }
                              const base = pt?.[fieldKey];
                              return base === null || base === undefined ? '' : String(base);
                            };

                            return [
                              <tr key={`row-${pt.id}`} className={`border-t ${!isIncluded ? (isDark ? 'border-red-500/20 bg-red-500/5' : 'border-red-200 bg-red-50') : !hasPreview ? (isDark ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-yellow-200 bg-yellow-50') : (isDark ? 'border-white/[0.06]' : 'border-neutral-100')}`}>
                                <td className="py-2.5 pr-3 align-top">
                                  <label className={`inline-flex items-center gap-2 text-xs font-medium ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                                    <input
                                      type="checkbox"
                                      checked={isIncluded}
                                      onChange={() => togglePointInPdf(pointId)}
                                      className={`h-4 w-4 rounded ${isDark ? 'border-white/20 bg-white/5' : 'border-neutral-300 bg-white'}`}
                                    />
                                    {isIncluded ? 'Sim' : 'Não'}
                                  </label>
                                </td>
                                <td className={`py-2.5 pr-3 align-top font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                                  <div>{previewPoint.nome || 'Ponto sem nome'}</div>
                                  {hasCustomEdit && (
                                    <div className={`text-[11px] mt-1 ${isDark ? 'text-brand-orange' : 'text-orange-600'}`}>Editado para PDF</div>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 align-top">
                                  {hasPreview ? (
                                    <div className={`w-16 h-10 rounded-md overflow-hidden border ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
                                      <img src={previewUrl} alt="" className="w-full h-full object-cover" />
                                    </div>
                                  ) : (
                                    <span className={`text-xs ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>Sem simulação</span>
                                  )}
                                </td>
                                <td className={`py-2.5 pr-3 align-top ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                                  <div>{previewPoint.cidade || '—'}</div>
                                  <div className={`text-[11px] mt-1 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{previewPoint.tipo || '—'}</div>
                                </td>
                                <td className={`py-2.5 pr-3 align-top text-right font-semibold ${isDark ? 'text-brand-orange' : 'text-brand-orange'}`}>{priceLabel}</td>
                                <td className="py-2.5 align-top">
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setEditingPdfPointId(isEditing ? null : pointId)}
                                      className={`h-8 px-2.5 rounded-lg border text-[11px] font-medium ${isDark ? 'border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'}`}
                                    >
                                      {isEditing ? 'Fechar edição' : 'Editar'}
                                    </button>
                                    {hasCustomEdit && (
                                      <button
                                        type="button"
                                        onClick={() => resetPdfPointEdit(pointId)}
                                        className={`h-8 px-2.5 rounded-lg border text-[11px] font-medium ${isDark ? 'border-brand-orange/35 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20' : 'border-[#E85A1A] bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white hover:from-[#E85A1A] hover:to-[#C94A1A] shadow-sm shadow-[#FE5C2B]/25'}`}
                                      >
                                        Restaurar
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>,
                              isEditing ? (
                                <tr key={`edit-${pt.id}`} className={`border-t ${isDark ? 'border-white/[0.06]' : 'border-neutral-100'}`}>
                                  <td colSpan={6} className="py-3">
                                    <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50'}`}>
                                      <p className={`text-[11px] mb-2 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                                        Edite o que quiser. Isso afeta somente esta proposta/PDF.
                                      </p>
                                      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                        {PDF_POINT_EDITABLE_FIELDS.map((field) => (
                                          <div key={`${pointId}-${field.key}`}>
                                            <label className={`text-[10px] uppercase tracking-[0.11em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{field.label}</label>
                                            <input
                                              type={field.type}
                                              value={getFieldValue(field.key)}
                                              onChange={(e) => updatePdfPointField(pointId, field.key, e.target.value)}
                                              placeholder={field.placeholder}
                                              className={`mt-1.5 w-full rounded-lg border px-2.5 py-2 text-xs outline-none transition-colors ${isDark ? 'bg-white/[0.07] border-white/15 focus:border-brand-orange/45 focus:bg-white/[0.09] text-white' : 'bg-white border-neutral-200 focus:border-brand-orange/50 text-neutral-800'}`}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null
                            ];
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <PreviewPanel proposalPoints={proposalPointsForPdf} activePreviewPoint={activePreviewPoint} onSelect={setActivePreviewPointId} onExpand={() => setShowPreviewLightbox(true)} requireGeneratedPreview={hasPointArtAssignments} isDark={isDark} />
                </motion.div>
              )}

              {/* ═══ STEP 6 — Gerar proposta ═══ */}
              {wizardStep === 6 && (
                <motion.div key="step6" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">

                  {/* Seções opcionais do PDF (cards selecionáveis) */}
                  <Card isDark={isDark} title="Seções do PDF">
                    <p className={`mb-3 text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                      Selecione quais seções opcionais devem aparecer no PDF. Passe o mouse sobre cada opção para ver o que ela representa.
                    </p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {[
                        { key: 'methodology', label: 'Como ler as métricas', Icon: BarChart3, description: 'Página explicativa com a metodologia: como interpretar fluxo, impacto, CPM, inserções e demais métricas usadas na proposta.' },
                        { key: 'entornoEvidence', label: 'Evidências de entorno', Icon: Map, description: 'Página com mapa geográfico e top 3 pontos com maior aderência ao segmento (estabelecimentos relevantes próximos e score).' },
                        { key: 'coverage', label: 'Cobertura e presença', Icon: Radio, description: 'Página com indicadores de cobertura (% pontos com entorno analisado, total de locais) e ranking de score por ponto.' },
                        { key: 'impact', label: 'Impacto da campanha', Icon: Zap, description: 'Página final com tabela de pontos, valores investidos, impacto consolidado e observação comercial.' },
                        { key: 'mapPrint', label: 'Print do mapa da seleção', Icon: Map, description: 'Adiciona uma página com a captura do mapa interativo da seleção atual de pontos.' }
                      ].map(({ key, label, Icon, description }) => (
                        <button
                          key={key}
                          type="button"
                          title={description}
                          aria-label={`${label}: ${description}`}
                          onClick={() => setPdfSections((s) => ({ ...s, [key]: !s[key] }))}
                          className={`flex items-start gap-3 rounded-xl border p-3 text-left text-sm font-medium transition-all ${
                            pdfSections[key]
                              ? isDark
                                ? 'border-brand-orange/40 bg-brand-orange/10 text-brand-orange shadow-[0_2px_8px_rgba(254,92,43,0.12)]'
                                : 'border-orange-300 bg-orange-50 text-orange-700 shadow-[0_2px_8px_rgba(254,92,43,0.08)]'
                              : isDark
                                ? 'border-white/10 bg-white/[0.03] text-brand-gray-400 hover:bg-white/[0.06]'
                                : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                          }`}
                        >
                          <Icon size={18} className={`mt-0.5 flex-shrink-0 ${pdfSections[key] ? (isDark ? 'text-brand-orange' : 'text-orange-600') : isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} />
                          <span className="flex-1 min-w-0">
                            <span className="block leading-tight">{label}</span>
                            <span className={`mt-1 block text-[10.5px] font-normal leading-snug ${
                              pdfSections[key]
                                ? isDark ? 'text-brand-orange/75' : 'text-orange-700/75'
                                : isDark ? 'text-brand-gray-500' : 'text-neutral-400'
                            }`}>{description}</span>
                          </span>
                          {pdfSections[key] && <Check size={14} className={`mt-0.5 flex-shrink-0 ${isDark ? 'text-brand-orange' : 'text-orange-600'}`} />}
                        </button>
                      ))}
                    </div>
                  </Card>

                  {/* Observação comercial customizável (aparece na seção Impacto) */}
                  {pdfSections.impact && (
                    <Card isDark={isDark} title="Observação comercial">
                      <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                        Texto exibido no rodapé do bloco de Resumo Financeiro do PDF. Deixe em branco para usar o padrão.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => wrapCommercialNoteSelection('**', '**', 'negrito')}
                          className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                          title="Negrito"
                        >
                          <Bold size={13} />
                          Negrito
                        </button>
                        <button
                          type="button"
                          onClick={() => wrapCommercialNoteSelection('*', '*', 'itálico')}
                          className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                          title="Itálico"
                        >
                          <Italic size={13} />
                          Itálico
                        </button>
                        <button
                          type="button"
                          onClick={() => wrapCommercialNoteSelection('__', '__', 'sublinhado')}
                          className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                          title="Sublinhado"
                        >
                          <Underline size={13} />
                          Sublinhado
                        </button>
                        <button
                          type="button"
                          onClick={addCommercialNoteBulletList}
                          className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                          title="Lista"
                        >
                          <List size={13} />
                          Lista
                        </button>
                        <button
                          type="button"
                          onClick={addCommercialNoteLineBreak}
                          className={`h-8 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                          title="Quebra de linha"
                        >
                          Quebra de linha
                        </button>
                      </div>
                      <p className={`mt-2 text-[11px] leading-4 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                        Dica: também funciona digitando manualmente. Use **texto** para negrito, *texto* para itálico, __texto__ para sublinhado e "- item" para lista.
                      </p>
                      <textarea
                        ref={customCommercialNoteRef}
                        rows={5}
                        value={form.customCommercialNote}
                        onChange={(e) => setForm((s) => ({ ...s, customCommercialNote: e.target.value }))}
                        placeholder={`${form.duracao_meses ? `Valores válidos para o contrato de ${form.duracao_meses} meses.\n` : ''}Negociação válida exclusivamente para o plano e quantidade de pontos apresentados.\nPara outras condições de compra, os valores deverão ser consultados.\n* Produção de materiais por conta do cliente.`}
                        className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-orange/30 ${isDark ? 'border-white/10 bg-white/5 text-white placeholder:text-brand-gray-500' : 'border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400'}`}
                      />
                      {form.customCommercialNote && (
                        <button
                          type="button"
                          onClick={() => setForm((s) => ({ ...s, customCommercialNote: '' }))}
                          className={`mt-2 text-xs underline ${isDark ? 'text-brand-gray-400 hover:text-brand-gray-200' : 'text-neutral-500 hover:text-neutral-700'}`}
                        >
                          Restaurar texto padrão
                        </button>
                      )}
                    </Card>
                  )}

                  {/* Mapa */}
                  <Card isDark={isDark} title="Print do mapa">
                    <div className="flex flex-wrap items-center gap-4">
                      <label className={`inline-flex items-center gap-2 text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                        <input type="checkbox" checked={connectMapPoints} onChange={(e) => setConnectMapPoints(e.target.checked)} className={`h-4 w-4 rounded ${isDark ? 'border-white/20 bg-white/5' : 'border-neutral-300 bg-white'}`} />
                        Linhas de conexão entre pontos
                      </label>
                      <button
                        onClick={handleExportSelectionMap}
                        disabled={mapBusy || !proposalPointsForPdf.length}
                        className={`h-10 px-4 rounded-xl border font-medium inline-flex items-center gap-2 disabled:opacity-50 transition-colors ${isDark ? 'border-brand-orange/35 bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange' : 'border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700'}`}
                      >
                        <Route size={16} />
                        {mapBusy ? 'Aguarde...' : 'Baixar print do mapa'}
                      </button>
                    </div>
                    {mapBusy && mapStatus && (
                      <p className="text-xs text-brand-orange/80 flex items-center gap-1.5 mt-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-brand-orange/60 border-t-brand-orange animate-spin" />
                        {mapStatus}
                      </p>
                    )}
                  </Card>

                  {/* Ações principais */}
                  <div className="space-y-3">
                    {simulationError && (
                      <p className={`text-xs rounded-lg border px-3 py-2 ${isDark ? 'text-red-300 border-red-500/20 bg-red-500/10' : 'text-red-600 border-red-300 bg-red-50'}`}>{simulationError}</p>
                    )}

                    {/* PDF export — split button with format picker */}
                    <div className="relative" ref={pdfFormatPickerRef}>
                      <div className={`flex h-12 rounded-xl overflow-hidden shadow-[0_10px_24px_rgba(254,92,43,0.28)] ${pdfBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                        {/* Main generate button */}
                        <button
                          onClick={() => handleExportProposalPdf()}
                          disabled={pdfBusy}
                          className="flex-1 orange-solid-btn bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-base inline-flex items-center justify-center gap-2 transition-colors"
                        >
                          <Download size={18} />
                          {pdfBusy
                            ? 'Gerando PDF...'
                            : pdfFormat === 'mobile' ? 'Exportar PDF mobile' : 'Exportar PDF da proposta'}
                        </button>
                        {/* Format picker toggle */}
                        <button
                          onClick={() => setShowPdfFormatPicker((v) => !v)}
                          disabled={pdfBusy}
                          className="px-3 bg-brand-orange hover:bg-brand-orange-hover text-white transition-colors"
                          style={{ borderLeft: '1px solid rgba(255,255,255,0.20)' }}
                          aria-label="Escolher formato do PDF"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>

                      {/* Dropdown */}
                      {showPdfFormatPicker && (
                        <div
                          className="absolute left-0 right-0 mt-2 z-50 rounded-2xl shadow-2xl overflow-hidden"
                          style={{ background: isDark ? '#1A1A1A' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB'}` }}
                        >
                          <div className="px-4 pt-3 pb-1">
                            <p className={`text-xs font-semibold uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-neutral-400'}`}>Formato do PDF</p>
                          </div>
                          {[
                            { value: 'desktop', label: 'Versão padrão', sub: 'Layout horizontal — desktop e apresentações' },
                            { value: 'mobile', label: 'Versão mobile', sub: 'Layout vertical 9:16 — leitura no celular' },
                          ].map(({ value, label, sub }) => {
                            const sel = pdfFormat === value;
                            return (
                              <button
                                key={value}
                                onClick={() => { setPdfFormat(value); setShowPdfFormatPicker(false); handleExportProposalPdf(value); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${sel ? (isDark ? 'bg-brand-orange/10' : 'bg-orange-50') : ''}`}
                              >
                                <span className={`text-sm font-semibold ${sel ? 'text-brand-orange' : isDark ? 'text-white' : 'text-neutral-800'}`}>{label}</span>
                                <span className={`text-xs ml-1 ${isDark ? 'text-white/40' : 'text-neutral-400'}`}>{sub}</span>
                                {sel && <Check size={14} className="ml-auto text-brand-orange flex-shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Modo cliente toggle */}
                    <label className={`inline-flex items-center gap-2 text-sm cursor-pointer select-none ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                      <div
                        onClick={() => setClientModePresentation(v => !v)}
                        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${clientModePresentation ? 'bg-brand-orange' : isDark ? 'bg-white/15' : 'bg-neutral-300'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${clientModePresentation ? 'translate-x-4' : ''}`} />
                      </div>
                      Modo cliente <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>(oculta dados internos)</span>
                    </label>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <button onClick={() => setShowPresentation(true)} className={`h-11 rounded-xl border font-medium inline-flex items-center justify-center gap-2 transition-colors ${isDark ? 'border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                        <Presentation size={16} />
                        Modo apresentação
                      </button>
                      <button onClick={() => setShowQuickPresentation(true)} className={`h-11 rounded-xl border font-medium inline-flex items-center justify-center gap-2 transition-colors ${isDark ? 'border-brand-orange/35 bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange' : 'border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700'}`}>
                        <Presentation size={16} />
                        Apresentação rápida
                      </button>
                    </div>

                    {/* Compartilhar — link público */}
                    <button
                      onClick={handleCompartilhar}
                      disabled={shareBusy || !proposalPointsForPdf.length}
                      className={`w-full h-11 rounded-xl border font-medium inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${isDark ? 'border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                    >
                      {shareBusy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                      {shareBusy ? 'Gerando link...' : 'Compartilhar proposta'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Navigation footer ── */}
          <div className={`relative flex-shrink-0 flex items-center justify-between gap-3 border-t p-4 md:px-8 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50/80'}`}>
            <button
              type="button"
              onClick={() => setWizardStep((s) => Math.max(1, s - 1))}
              disabled={wizardStep === 1}
              className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl border text-sm font-medium transition-colors disabled:opacity-30 ${isDark ? 'border-white/15 text-white hover:bg-white/[0.06]' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'}`}
            >
              <ChevronLeft size={16} />
              Voltar
            </button>

            <div className={`flex flex-col items-center text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
              <span>{wizardStep} de {WIZARD_STEPS.length}</span>
              {(() => {
                if (wizardStep === 1 && !form.clientName.trim()) {
                  return <span className={isDark ? 'text-yellow-400' : 'text-yellow-600'}>Informe o nome do cliente</span>;
                }
                if (wizardStep === 3 && proposalSourcePoints.length > assignedPointArtCount) {
                  return <span className={isDark ? 'text-yellow-400' : 'text-yellow-600'}>{proposalSourcePoints.length - assignedPointArtCount} ponto(s) sem arte</span>;
                }
                if (wizardStep === 2 && pricingSummary.hasDiscount) {
                  const pct = pricingSummary.discountPercent || 0;
                  return <span className={isDark ? 'text-green-400' : 'text-green-600'}>Desconto aplicado: {pct.toFixed(1).replace('.', ',')}%</span>;
                }
                return null;
              })()}
            </div>

            {wizardStep < 5 && (
              <button
                type="button"
                onClick={() => setWizardStep((s) => Math.min(5, s + 1))}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-hover shadow-[0_6px_20px_rgba(254,92,43,0.25)] transition-colors"
              >
                Próximo
                <ChevronRight size={16} />
              </button>
            )}

            {wizardStep === 5 && (
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-hover shadow-[0_6px_20px_rgba(254,92,43,0.25)] transition-colors"
              >
                <FileText size={16} />
                Ir para gerar proposta
              </button>
            )}

            {wizardStep === 6 && (
              <button
                type="button"
                onClick={() => setWizardStep(5)}
                className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl border text-sm font-medium ${isDark ? 'border-white/15 text-white hover:bg-white/[0.06]' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'}`}
              >
                Voltar para edição do PDF
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>

      {showPresentation && (
        <PresentationMode
          points={proposalPointsForPdf}
          totals={totalsForPdf}
          segmento={form.segmento}
          clientName={form.clientName}
          pricingSummary={pricingSummaryForPdfWithCommission}
          onClose={() => setShowPresentation(false)}
          clientMode={clientModePresentation}
          proposalToken={shareModal?.token ?? null}
        />
      )}

      {showQuickPresentation && (
        <QuickPresentationMode points={proposalPointsForPdf} totals={totalsForPdf} segmento={form.segmento} clientName={form.clientName} pricingSummary={pricingSummaryForPdfWithCommission} onClose={() => setShowQuickPresentation(false)} />
      )}

      {/* Share modal — link público + QR code */}
      {shareModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={() => setShareModal(null)}>
          <div
            className={`rounded-3xl shadow-2xl w-full max-w-sm p-6 ${isDark ? 'bg-[#141414] border border-white/10' : 'bg-white border border-neutral-200'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Compartilhar proposta</h3>
              <button onClick={() => setShareModal(null)} className={`w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors ${isDark ? 'text-white/50 hover:bg-white/10 hover:text-white' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'}`}>
                <X size={16} />
              </button>
            </div>

            {/* QR code */}
            <div className="flex justify-center mb-5">
              <div className={`p-3 rounded-2xl ${isDark ? 'bg-white' : 'bg-neutral-50 border border-neutral-200'}`}>
                <QRCodeSVG value={shareModal.url} size={160} bgColor="#ffffff" fgColor="#111111" />
              </div>
            </div>
            {/* Hidden canvas QR for image generation */}
            <div ref={qrCanvasRef} style={{ position: 'absolute', left: -9999, top: -9999 }}>
              <QRCodeCanvas value={shareModal.url} size={280} bgColor="#ffffff" fgColor="#111111" />
            </div>

            {/* URL + copy */}
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 mb-3 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-neutral-200 bg-neutral-50'}`}>
              <span className={`flex-1 text-xs truncate font-mono ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{shareModal.url}</span>
              <button
                onClick={handleCopyShareLink}
                className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${shareCopied ? 'text-green-500' : isDark ? 'text-brand-orange hover:bg-brand-orange/10' : 'text-orange-600 hover:bg-orange-50'}`}
              >
                {shareCopied ? <Check size={12} /> : <Link2 size={12} />}
                {shareCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>

            <p className={`text-center text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
              Link válido por 7 dias · O cliente pode aprovar diretamente
            </p>

            <button
              onClick={handleDownloadQRCard}
              className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
              style={{ background: '#E8591A' }}
            >
              <Download size={15} />
              Baixar cartão QR
            </button>
          </div>
        </div>
      )}

      {sessionExpiredModal.open && (
        <div className="fixed inset-0 z-[95] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSessionExpiredModal({ open: false, message: '' })}>
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${isDark ? 'bg-[#141414] border-white/10' : 'bg-white border-neutral-200'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Sessão expirada</h3>
            <p className={`mt-2 text-sm leading-relaxed ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
              {sessionExpiredModal.message}
            </p>
            <p className={`mt-2 text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
              Para evitar perda de trabalho e consumo desnecessário de tokens, faça login novamente antes de continuar.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSessionExpiredModal({ open: false, message: '' })}
                className={`h-10 px-4 rounded-xl border text-sm font-medium ${isDark ? 'border-white/15 text-white hover:bg-white/[0.06]' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'}`}
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={goToCommercialLogin}
                className="h-10 px-4 rounded-xl bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-hover"
              >
                Fazer login novamente
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreviewLightbox && activePreviewPoint && (
        <div className={`fixed inset-0 z-[70] backdrop-blur-sm p-4 md:p-8 ${isDark ? 'bg-black/90' : 'bg-white/70'}`} onClick={() => setShowPreviewLightbox(false)}>
          <div className="max-w-6xl mx-auto h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className={`text-xs uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Preview ampliado</p>
                <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{activePreviewPoint.nome} · {activePreviewPoint.cidade}</p>
              </div>
              <button onClick={() => setShowPreviewLightbox(false)} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? 'border-white/20 text-white/80 hover:text-white' : 'border-neutral-300 text-neutral-600 hover:text-neutral-900 bg-white'}`}>Fechar</button>
            </div>

            <div className={`rounded-2xl border flex-1 p-2 md:p-4 min-h-0 ${isDark ? 'border-white/15 bg-black/45' : 'border-neutral-200 bg-white'}`}>
              <img src={getPointPreviewUrl(activePreviewPoint, hasPointArtAssignments)} alt={`Preview ${activePreviewPoint.nome}`} className="w-full h-full object-contain rounded-xl" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PreviewPanel({ proposalPoints, activePreviewPoint, onSelect, onExpand, requireGeneratedPreview = false, isDark = true }) {
  return (
    <section className={`rounded-2xl border p-4 md:p-5 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ImageIcon size={16} className="text-brand-orange" />
          <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Preview da simulação</h3>
        </div>
        <button type="button" onClick={onExpand} disabled={!activePreviewPoint} className={`px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 bg-white/[0.03] hover:bg-white/[0.08] text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>Ver em tela cheia</button>
      </div>

      {activePreviewPoint ? (
        <div className="grid xl:grid-cols-[1fr_240px] gap-4">
          <div className={`rounded-xl border p-2 ${isDark ? 'border-white/10 bg-black/25' : 'border-neutral-200 bg-white'}`}>
            <img src={getPointPreviewUrl(activePreviewPoint, requireGeneratedPreview)} alt={`Preview ${activePreviewPoint.nome}`} className="w-full h-[240px] md:h-[320px] object-contain rounded-lg bg-black/35" />
            <div className="px-2 pt-3">
              <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{activePreviewPoint.nome}</p>
              <p className={`text-xs mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{activePreviewPoint.cidade} · {activePreviewPoint.tipo}</p>
            </div>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {proposalPoints.map((point) => {
              const previewUrl = getPointPreviewUrl(point, requireGeneratedPreview);
              const selected = point.id === activePreviewPoint?.id;
              return (
                <button
                  key={point.id}
                  type="button"
                  disabled={!previewUrl}
                  onClick={() => onSelect(point.id)}
                  className={`w-full text-left rounded-xl border p-2 transition-all ${selected ? (isDark ? 'border-brand-orange bg-brand-orange/10' : 'border-orange-400 bg-orange-50') : isDark ? 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]' : 'border-neutral-200 bg-white hover:bg-neutral-50'} ${!previewUrl ? 'opacity-55 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-16 h-10 rounded-md border overflow-hidden shrink-0 ${isDark ? 'border-white/10 bg-black/35' : 'border-neutral-200 bg-neutral-100'}`}>
                      {previewUrl ? <img src={previewUrl} alt="thumb" className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{point.nome}</p>
                      <p className={`text-[11px] mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{previewUrl ? 'Simulação pronta' : (point.proposalSimulationStatus || 'Sem simulação')}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={`h-36 rounded-xl border border-dashed flex items-center justify-center text-sm ${isDark ? 'border-white/15 text-brand-gray-500 bg-black/25' : 'border-neutral-300 text-neutral-400 bg-neutral-50'}`}>Gere as simulações para visualizar o preview.</div>
      )}
    </section>
  );
}

function Card({ isDark = true, title, children }) {
  return (
    <section className={`rounded-2xl border p-5 space-y-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
      {title && <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{title}</h3>}
      {children}
    </section>
  );
}

function MiniStat({ isDark = true, label, value }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-white'}`}>
      <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{label}</div>
      <div className={`text-sm font-semibold mt-0.5 truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{value}</div>
    </div>
  );
}

function Input({ isDark = true, label, value, onChange, type = 'text', min, placeholder }) {
  return (
    <div>
      <label className={`text-[11px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{label}</label>
      <input type={type} min={min} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-white/[0.07] border-white/15 focus:border-brand-orange/45 focus:bg-white/[0.09] text-white' : 'bg-white border-neutral-200 focus:border-brand-orange/50 text-neutral-800'}`} />
    </div>
  );
}

function ScopeButton({ isDark = true, active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm transition-colors ${active ? (isDark ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange' : 'border-orange-300 bg-orange-50 text-orange-700') : isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300 hover:bg-white/[0.08]' : 'border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-100'}`}
    >
      {children}
    </button>
  );
}

function StatusCard({ isDark = true, label, value, tone }) {
  const toneClass = tone === 'success'
    ? 'text-green-400 border-green-500/20 bg-green-500/5'
    : tone === 'warning'
      ? 'text-yellow-300 border-yellow-500/20 bg-yellow-500/5'
      : isDark
        ? 'text-white border-white/10 bg-black/20'
        : 'text-neutral-900 border-neutral-200 bg-white';

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function SliderField({ isDark = true, label, value, min, max, step, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className={`text-[11px] uppercase tracking-wide ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{label}</label>
        <span className={`text-xs ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{Number(value).toFixed(step >= 1 ? 0 : 2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="proposal-slider w-full" />
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}
