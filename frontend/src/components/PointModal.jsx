import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/** Converte **texto** em <strong> dentro de um parágrafo */
function RichText({ text, className }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </p>
  );
}
import {
  X, MapPin, Clock, Users, Monitor, Play, RotateCcw, Hash,
  DollarSign, Heart, Building2, Sparkles, BarChart3, TrendingUp, Tag
} from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import { getPrimaryPointScreenImage } from '../lib/pointImages';
import MiniMap from './MiniMap';

const CENSUS_PROFILE_LABELS = {
  alta_renda: 'Público A/B',
  massa_varejo: 'Massa / Varejo',
  jovem_universitario: 'Jovem / Universitário',
  terceira_idade: 'Terceira Idade',
  misto: 'Perfil Misto',
  indefinido: 'Sem perfil definido',
};

const CENSUS_PROFILE_DESC = {
  alta_renda: 'Área com concentração de POIs premium e indicadores de maior renda (IBGE). Indica que o público que transita nessa região tem poder aquisitivo acima da média.',
  massa_varejo: 'Área com alta densidade comercial e fluxo popular. Ideal para campanhas de varejo de massa, promoções e lançamentos de grande alcance.',
  jovem_universitario: 'Região com presença de universidades, bares e estabelecimentos voltados ao público 18–29 anos.',
  terceira_idade: 'Área com concentração de serviços de saúde, farmácias e espaços de lazer frequentados pelo público 60+.',
  misto: 'Nenhum perfil se destaca de forma clara. A região tem características mistas de audiência.',
  indefinido: 'Dados insuficientes para determinar o perfil dominante da audiência nesta região.',
};

const DEFAULT_IMAGE_FOCUS = { x: 50, y: 50, zoom: 100 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseSimulationCorners(simulacaoTela) {
  if (!simulacaoTela) return null;
  try {
    const parsed = typeof simulacaoTela === 'string' ? JSON.parse(simulacaoTela) : simulacaoTela;
    const pointsSource = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.faces) && parsed.faces.length
        ? parsed.faces[0]?.corners
        : parsed?.corners);
    if (!Array.isArray(pointsSource) || pointsSource.length < 4) return null;
    const corners = pointsSource
      .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (corners.length < 4) return null;
    return corners;
  } catch {
    return null;
  }
}

function deriveFocusFromSimulation(simulacaoTela) {
  const corners = parseSimulationCorners(simulacaoTela);
  if (!corners) return DEFAULT_IMAGE_FOCUS;

  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = clamp(maxX - minX, 1, 100);
  const height = clamp(maxY - minY, 1, 100);
  const minSide = Math.min(width, height);
  const autoZoom = clamp(Math.round(100 + Math.max(0, 32 - minSide) * 2), 100, 220);

  return {
    x: clamp((minX + maxX) / 2, 0, 100),
    y: clamp((minY + maxY) / 2, 0, 100),
    zoom: autoZoom
  };
}

function getPointTypeLabel(ponto) {
  if (!ponto) return '';
  if (ponto.tipo === 'Elevador' && ponto.elevador_categoria) {
    return `Elevador - ${ponto.elevador_categoria}`;
  }
  return ponto.tipo || '';
}


export default function PointModal({ ponto, onClose, isDark = true, geoProfile, censusProfile }) {
  if (!ponto) return null;

  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const fav = isFavorite(ponto.id);
  const displayImage = getPrimaryPointScreenImage(ponto);
  const imageFocus = useMemo(() => {
    const simulationFocus = deriveFocusFromSimulation(ponto.simulacao_tela);
    const hasX = Number.isFinite(Number(ponto.imagem_foco_x));
    const hasY = Number.isFinite(Number(ponto.imagem_foco_y));
    const hasZoom = Number.isFinite(Number(ponto.imagem_foco_zoom));
    return {
      x: hasX ? clamp(Number(ponto.imagem_foco_x), 0, 100) : simulationFocus.x,
      y: hasY ? clamp(Number(ponto.imagem_foco_y), 0, 100) : simulationFocus.y,
      zoom: hasZoom ? clamp(Number(ponto.imagem_foco_zoom), 100, 220) : simulationFocus.zoom
    };
  }, [ponto.imagem_foco_x, ponto.imagem_foco_y, ponto.imagem_foco_zoom, ponto.simulacao_tela]);

  const formatCurrency = (n) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

  const formatNumber = (n) =>
    new Intl.NumberFormat('pt-BR').format(n);

  const isVehicleFlow = (() => {
    const explicit = String(ponto.tipo_fluxo || '').toLowerCase().trim();
    if (explicit === 'veiculos') return true;
    if (explicit === 'pessoas') {
      const tipo = String(ponto.tipo || '').toLowerCase();
      return tipo.includes('painel') && tipo.includes('led');
    }
    const tipo = String(ponto.tipo || '').toLowerCase();
    return tipo.includes('painel') && tipo.includes('led');
  })();
  const fluxoUnit = isVehicleFlow ? 'veículos' : 'pessoas';

  const details = [
    { icon: Building2, label: 'Formato', value: getPointTypeLabel(ponto) },
    { icon: MapPin, label: 'Endereço', value: ponto.endereco },
    { icon: Clock, label: 'Horário', value: ponto.horario },
    { icon: Users, label: 'Fluxo mensal', value: formatNumber(ponto.fluxo) + ` ${fluxoUnit}` },
    { icon: Hash, label: 'Inserções mensais', value: `Mínimo de ${formatNumber(ponto.insercoes)}` },
    { icon: Play, label: 'Tempo do anúncio', value: ponto.tempo },
    { icon: RotateCcw, label: 'Looping', value: ponto.loop ? `Mínimo de ${ponto.loop}` : '' },
    { icon: Monitor, label: 'Veiculação', value: ponto.veiculacao },
    { icon: Monitor, label: 'Quantidade de telas', value: ponto.telas },
    { icon: Users, label: 'Público', value: `Classe ${ponto.publico}` },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className={`absolute inset-0 ${isDark ? 'bg-black/70' : 'bg-white/45'} backdrop-blur-md`} />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={`relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl ${isDark ? 'bg-brand-dark border border-white/10' : 'bg-white border border-neutral-200 shadow-xl'}`}
          onClick={e => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-all backdrop-blur-sm ${isDark ? 'bg-black/40 hover:bg-black/60 text-white/60 hover:text-white' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100'}`}
          >
            <X size={18} />
          </button>

          <div className="flex flex-col lg:flex-row">
            {/* Image + map */}
            <div className={`lg:w-1/2 flex flex-col ${isDark ? 'bg-brand-gray-900' : 'bg-[#eef1f5]'}`}>
              <div className="relative h-[38vh] min-h-[240px] max-h-[380px] sm:h-[44vh] lg:h-[60%] lg:min-h-[340px]">
                {displayImage ? (
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={displayImage}
                      alt={ponto.nome}
                      className="w-full h-full object-cover"
                      style={{
                        objectPosition: `${imageFocus.x}% ${imageFocus.y}%`,
                        transform: `scale(${imageFocus.zoom / 100})`,
                        transformOrigin: `${imageFocus.x}% ${imageFocus.y}%`
                      }}
                    />
                  </div>
                ) : (
                  <div className={`w-full h-full flex items-center justify-center ${isDark ? 'bg-gradient-to-br from-brand-gray-900 to-brand-gray-800' : 'bg-gradient-to-br from-[#f4f6f9] to-[#eceff3]'}`}>
                    <Building2 size={64} className={isDark ? 'text-brand-gray-700' : 'text-neutral-400'} />
                  </div>
                )}
              </div>

              <div className={`relative h-[190px] lg:flex-1 border-t ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
                <MiniMap
                  lat={ponto.lat}
                  lng={ponto.lng}
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </div>

            {/* Info */}
            <div className="lg:w-1/2 p-6 lg:p-8">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium mb-3 ${isDark ? 'bg-brand-orange/10 text-brand-orange' : 'bg-orange-50 text-orange-700'}`}>
                    {getPointTypeLabel(ponto)}
                  </span>
                  <h2 className={`text-2xl lg:text-3xl font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                    {ponto.nome}
                  </h2>
                </div>
              </div>

              <p className={`text-sm flex items-center gap-1.5 mb-6 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                <MapPin size={14} />
                {ponto.cidade}
              </p>

              {ponto.descricao && (
                <p className={`text-sm leading-relaxed mb-6 pb-6 ${isDark ? 'text-brand-gray-400 border-b border-white/5' : 'text-neutral-600 border-b border-neutral-200'}`}>
                  {ponto.descricao}
                </p>
              )}

              {/* Details grid */}
              <div className="space-y-3 mb-6">
                {details.map(({ icon: Icon, label, value }) => (
                  value && (
                    <div key={label} className="flex items-start gap-3">
                      <Icon size={16} className="text-brand-orange mt-0.5 shrink-0" />
                      <div>
                        <div className={`text-[11px] uppercase tracking-wider ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>{label}</div>
                        <div className={`text-sm ${isDark ? 'text-white' : 'text-neutral-800'}`}>{value}</div>
                      </div>
                    </div>
                  )
                ))}
              </div>

              {/* Audience Tags — only show when no data-driven census profile is available */}
              {!censusProfile && ponto.audience_tags && ponto.audience_tags.length > 0 && (
                <div className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-white/[0.03] border border-white/5' : 'bg-neutral-50 border border-neutral-200'}`}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Tag size={14} className="text-brand-orange" />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Tags de audiência</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ponto.audience_tags.map((tag) => (
                      <span key={tag.key} className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/20' : 'bg-orange-50 text-orange-600 border border-orange-200'}`}>
                        {tag.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* GeoAudience Intelligence */}
              {geoProfile && (
                <div className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-emerald-500/[0.04] border border-emerald-500/15' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Sparkles size={14} className="text-emerald-500" />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>Inteligência GeoAudiência</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {geoProfile.neighborhood_label && (
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider mb-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Tipo de bairro</div>
                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>{geoProfile.neighborhood_label}</div>
                      </div>
                    )}
                    {geoProfile.socioeconomic_level && (
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider mb-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Nível socioeconômico</div>
                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>{geoProfile.socioeconomic_level}</div>
                      </div>
                    )}
                    {geoProfile.environment_type && (
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider mb-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Ambiente</div>
                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>{geoProfile.environment_type}</div>
                      </div>
                    )}
                    {geoProfile.dominant_activity && (
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider mb-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Atividade dominante</div>
                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>{geoProfile.dominant_activity}</div>
                      </div>
                    )}
                    {geoProfile.urban_density && (
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider mb-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Densidade urbana</div>
                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>{geoProfile.urban_density}</div>
                      </div>
                    )}
                    {geoProfile.total_pois > 0 && (
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider mb-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>POIs no entorno</div>
                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>{geoProfile.total_pois}</div>
                      </div>
                    )}
                  </div>
                  {geoProfile.audience_narrative && (
                    <RichText
                      text={geoProfile.audience_narrative}
                      className={`mt-3 text-xs leading-relaxed ${isDark ? 'text-emerald-300/70' : 'text-emerald-700/80'}`}
                    />
                  )}
                </div>
              )}

              {/* Census Profile (IBGE) */}
              {censusProfile && (
                <div className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-sky-500/[0.04] border border-sky-500/15' : 'bg-sky-50 border border-sky-200'}`}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <BarChart3 size={14} className="text-sky-500" />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>Perfil de audiência da região</span>
                  </div>
                  <p className={`text-[11px] mb-3 leading-relaxed ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                    {CENSUS_PROFILE_DESC[censusProfile.perfil_dominante] || 'Classificação baseada em POIs (OpenStreetMap) e dados censitários (IBGE Censo 2022) num raio de 800m.'}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {censusProfile.perfil_dominante && (
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider mb-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Classificação</div>
                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>{CENSUS_PROFILE_LABELS[censusProfile.perfil_dominante] || censusProfile.perfil_dominante}</div>
                      </div>
                    )}
                    {censusProfile.score_geral > 0 && (
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider mb-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Confiança</div>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp size={12} className="text-sky-500" />
                          <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>{Math.round(Number(censusProfile.score_geral) * 100)}%</span>
                        </div>
                      </div>
                    )}
                    {censusProfile.perfis && (
                      <div className="col-span-2">
                        <div className={`text-[10px] uppercase tracking-wider mb-1.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Composição da audiência</div>
                        <div className="space-y-1.5">
                          {Object.entries(censusProfile.perfis)
                            .filter(([, v]) => v > 0)
                            .sort(([, a], [, b]) => b - a)
                            .map(([key, val]) => {
                              const pct = Math.round(Number(val) * 100);
                              const isDom = key === censusProfile.perfil_dominante;
                              return (
                                <div key={key} className="flex items-center gap-2">
                                  <span className={`text-[10px] w-20 truncate ${isDom ? (isDark ? 'text-sky-300 font-semibold' : 'text-sky-800 font-semibold') : (isDark ? 'text-brand-gray-400' : 'text-neutral-600')}`}>
                                    {CENSUS_PROFILE_LABELS[key] || key}
                                  </span>
                                  <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}>
                                    <div
                                      className={`h-full rounded-full ${isDom ? 'bg-sky-500' : (isDark ? 'bg-white/20' : 'bg-neutral-400')}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className={`text-[10px] w-8 text-right tabular-nums font-medium ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>{pct}%</span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                  {censusProfile.municipio && (
                    <p className={`mt-3 text-[11px] ${isDark ? 'text-sky-300/50' : 'text-sky-700/60'}`}>Análise do raio de 800m • Dados IBGE + OpenStreetMap • {censusProfile.municipio}</p>
                  )}
                </div>
              )}

              {/* Price */}
              <div className={`rounded-xl p-4 mb-6 ${isDark ? 'bg-white/[0.03] border border-white/5' : 'bg-orange-50 border border-orange-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={16} className="text-brand-orange" />
                  <span className={`text-xs uppercase tracking-wider ${isDark ? 'text-brand-gray-500' : 'text-orange-700/80'}`}>Investimento mensal</span>
                </div>
                <div className={`text-3xl font-bold font-heading ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                  {formatCurrency(ponto.preco)}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => fav ? removeFavorite(ponto.id) : addFavorite(ponto)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all duration-200 ${
                    fav
                      ? 'bg-brand-orange text-white hover:bg-brand-orange-hover'
                      : isDark ? 'bg-white/5 border border-white/10 text-white hover:bg-white/10' : 'bg-white border border-neutral-300 text-neutral-800 hover:bg-neutral-100'
                  }`}
                >
                  <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
                  {fav ? 'No seu plano' : 'Adicionar ao plano'}
                </button>
              </div>

              {/* Coordinates */}
              {ponto.lat && ponto.lng && (
                <div className={`mt-4 text-[11px] ${isDark ? 'text-brand-gray-600' : 'text-neutral-500'}`}>
                  Coordenadas: {ponto.lat}, {ponto.lng}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
