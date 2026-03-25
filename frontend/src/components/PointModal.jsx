import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, MapPin, Clock, Users, Monitor, Play, RotateCcw, Hash,
  DollarSign, Heart, Building2, SlidersHorizontal, RefreshCw
} from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';

const DEFAULT_IMAGE_FOCUS = { x: 50, y: 50, zoom: 100 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseSimulationCorners(simulacaoTela) {
  if (!simulacaoTela) return null;
  try {
    const parsed = typeof simulacaoTela === 'string' ? JSON.parse(simulacaoTela) : simulacaoTela;
    if (!Array.isArray(parsed) || parsed.length < 4) return null;
    const corners = parsed
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

function getFocusStorageKey(ponto) {
  return `point-image-focus:${ponto?.id || 'unknown'}:${ponto?.imagem || 'sem-imagem'}`;
}

export default function PointModal({ ponto, onClose }) {
  if (!ponto) return null;

  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const fav = isFavorite(ponto.id);
  const [showFramingControls, setShowFramingControls] = useState(false);
  const simulationFocus = useMemo(() => deriveFocusFromSimulation(ponto.simulacao_tela), [ponto.simulacao_tela]);
  const [imageFocus, setImageFocus] = useState(simulationFocus);

  useEffect(() => {
    const key = getFocusStorageKey(ponto);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        setImageFocus({
          x: clamp(Number(parsed?.x) || simulationFocus.x, 0, 100),
          y: clamp(Number(parsed?.y) || simulationFocus.y, 0, 100),
          zoom: clamp(Number(parsed?.zoom) || simulationFocus.zoom, 100, 220)
        });
        return;
      }
    } catch {
      // Ignore malformed local settings and use automatic focus.
    }
    setImageFocus(simulationFocus);
  }, [ponto, simulationFocus]);

  useEffect(() => {
    const key = getFocusStorageKey(ponto);
    try {
      localStorage.setItem(key, JSON.stringify(imageFocus));
    } catch {
      // Ignore persistence errors in restricted browsing modes.
    }
  }, [ponto, imageFocus]);

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
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-brand-dark border border-white/10 rounded-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/60 hover:text-white transition-all backdrop-blur-sm"
          >
            <X size={18} />
          </button>

          <div className="flex flex-col lg:flex-row">
            {/* Image */}
            <div className="lg:w-1/2 relative h-64 lg:h-auto lg:min-h-[500px] bg-brand-gray-900">
              {ponto.imagem ? (
                <>
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={ponto.imagem}
                      alt={ponto.nome}
                      className="w-full h-full object-cover"
                      style={{
                        transform: `scale(${imageFocus.zoom / 100})`,
                        transformOrigin: `${imageFocus.x}% ${imageFocus.y}%`
                      }}
                    />
                  </div>

                  <div className="absolute top-3 left-3 z-10">
                    <button
                      type="button"
                      onClick={() => setShowFramingControls((value) => !value)}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/55 px-3 py-1.5 text-xs text-white hover:bg-black/75 transition-colors"
                    >
                      <SlidersHorizontal size={14} />
                      Ajustar enquadramento
                    </button>
                  </div>

                  {showFramingControls && (
                    <div className="absolute left-3 right-3 bottom-3 z-10 rounded-xl border border-white/15 bg-black/72 backdrop-blur-sm p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase tracking-wider text-brand-gray-300">Ajuste manual da área visível</span>
                        <button
                          type="button"
                          onClick={() => setImageFocus(simulationFocus)}
                          className="inline-flex items-center gap-1 text-[11px] text-brand-gray-200 hover:text-white"
                        >
                          <RefreshCw size={12} />
                          Resetar
                        </button>
                      </div>

                      <label className="block text-[11px] text-brand-gray-300">
                        Zoom ({imageFocus.zoom}%)
                        <input
                          type="range"
                          min="100"
                          max="220"
                          step="1"
                          value={imageFocus.zoom}
                          onChange={(event) => setImageFocus((current) => ({ ...current, zoom: clamp(Number(event.target.value), 100, 220) }))}
                          className="mt-1 w-full"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-[11px] text-brand-gray-300">
                          Horizontal ({Math.round(imageFocus.x)}%)
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={imageFocus.x}
                            onChange={(event) => setImageFocus((current) => ({ ...current, x: clamp(Number(event.target.value), 0, 100) }))}
                            className="mt-1 w-full"
                          />
                        </label>
                        <label className="block text-[11px] text-brand-gray-300">
                          Vertical ({Math.round(imageFocus.y)}%)
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={imageFocus.y}
                            onChange={(event) => setImageFocus((current) => ({ ...current, y: clamp(Number(event.target.value), 0, 100) }))}
                            className="mt-1 w-full"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-gray-900 to-brand-gray-800">
                  <Building2 size={64} className="text-brand-gray-700" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="lg:w-1/2 p-6 lg:p-8">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <span className="inline-block px-2.5 py-1 rounded-lg bg-brand-orange/10 text-brand-orange text-xs font-medium mb-3">
                    {ponto.tipo}
                  </span>
                  <h2 className="text-2xl lg:text-3xl font-bold text-white">
                    {ponto.nome}
                  </h2>
                </div>
              </div>

              <p className="text-brand-gray-400 text-sm flex items-center gap-1.5 mb-6">
                <MapPin size={14} />
                {ponto.cidade}
              </p>

              {ponto.descricao && (
                <p className="text-brand-gray-400 text-sm leading-relaxed mb-6 pb-6 border-b border-white/5">
                  {ponto.descricao}
                </p>
              )}

              {/* Details grid */}
              <div className="space-y-3 mb-8">
                {details.map(({ icon: Icon, label, value }) => (
                  value && (
                    <div key={label} className="flex items-start gap-3">
                      <Icon size={16} className="text-brand-orange mt-0.5 shrink-0" />
                      <div>
                        <div className="text-[11px] text-brand-gray-500 uppercase tracking-wider">{label}</div>
                        <div className="text-sm text-white">{value}</div>
                      </div>
                    </div>
                  )
                ))}
              </div>

              {/* Price */}
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={16} className="text-brand-orange" />
                  <span className="text-xs text-brand-gray-500 uppercase tracking-wider">Investimento mensal</span>
                </div>
                <div className="text-3xl font-bold font-heading text-white">
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
                      : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                  }`}
                >
                  <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
                  {fav ? 'No seu plano' : 'Adicionar ao plano'}
                </button>
              </div>

              {/* Coordinates */}
              {ponto.lat && ponto.lng && (
                <div className="mt-4 text-[11px] text-brand-gray-600">
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
