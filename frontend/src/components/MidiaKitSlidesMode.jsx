import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react';
import CustomSelect from './CustomSelect';
import { getPrimaryPointMediaKitImage } from '../lib/pointImages';
import { campaignTotals } from '../lib/strategy';

const formatInt = (value) => new Intl.NumberFormat('pt-BR').format(Math.round(Number(value) || 0));
const formatMoney = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value || 0);

export default function MidiaKitSlidesMode({
  open = false,
  onClose,
  allPontos = [],
  selectedPracas = [],
  setSelectedPracas,
  selectedTipos = [],
  setSelectedTipos,
  isDark = true
}) {
  const [index, setIndex] = useState(0);

  const cidades = useMemo(() => Array.from(new Set(allPontos.map((p) => p.cidade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [allPontos]);
  const tipos = useMemo(() => Array.from(new Set(allPontos.map((p) => p.tipo).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [allPontos]);

  const points = useMemo(() => {
    let result = Array.isArray(allPontos) ? allPontos : [];
    if (selectedPracas.length) {
      result = result.filter((point) => selectedPracas.includes(point.cidade));
    }
    if (selectedTipos.length) {
      result = result.filter((point) => selectedTipos.includes(point.tipo));
    }
    return result;
  }, [allPontos, selectedPracas, selectedTipos]);

  const totals = useMemo(() => campaignTotals(points), [points]);

  const slides = useMemo(() => {
    return points.map((point, pointIndex) => ({
      key: `point-${point.id || pointIndex}`,
      point,
      infoOnLeft: pointIndex % 2 === 0
    }));
  }, [points]);

  useEffect(() => {
    setIndex(0);
  }, [selectedPracas, selectedTipos]);

  if (!open) return null;
  const active = slides[index] || null;
  const activePoint = active?.point || null;
  const activeImage = activePoint ? getPrimaryPointMediaKitImage(activePoint) : '';

  const selectionLabel = selectedPracas.length
    ? (selectedPracas.length === 1 ? selectedPracas[0] : `${selectedPracas.length} praças`)
    : 'Todas as praças';

  const typesLabel = selectedTipos.length
    ? (selectedTipos.length === 1 ? selectedTipos[0] : `${selectedTipos.length} formatos`)
    : 'Todos os formatos';

  return (
    <div className="fixed inset-0 z-[95] bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(254,92,43,0.22),transparent_34%)]" />

      <div className="relative z-[1] h-full flex flex-col px-6 py-5 md:px-10 md:py-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="inline-flex min-h-[30px] items-center rounded-full border border-brand-orange/35 bg-brand-orange/15 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-orange">
              Apresentacao do Midia Kit
            </div>
            <h2 className="mt-2 text-2xl md:text-3xl font-bold">Slides por ponto com foto dominante</h2>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/20 bg-black/35 p-2 text-white/75 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <CustomSelect
            label="Pracas"
            value={selectedPracas}
            onChange={setSelectedPracas}
            options={cidades}
            placeholder="Selecionar pracas"
            multiple
          />
          <CustomSelect
            label="Formatos"
            value={selectedTipos}
            onChange={setSelectedTipos}
            options={tipos}
            placeholder="Selecionar formatos"
            multiple
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm self-end whitespace-nowrap">
            {formatInt(points.length)} pontos filtrados
          </div>
        </div>

        <div className="mt-4 flex-1 min-h-0 rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 md:p-6 overflow-hidden">
          {!activePoint ? (
            <div className="h-full flex items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-brand-gray-400">
              Nenhum ponto para exibir com os filtros atuais.
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={active?.key}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="h-full relative"
              >
                <div className="absolute right-3 top-3 z-20 rounded-xl border border-brand-orange/30 bg-black/70 px-3 py-2 backdrop-blur-sm">
                  <div className="text-[10px] uppercase tracking-wide text-brand-orange">Totais da seleção</div>
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-brand-gray-200">
                    <span>Pontos: <strong className="text-white">{formatInt(totals.quantidade)}</strong></span>
                    <span>Telas: <strong className="text-white">{formatInt(totals.telasTotal)}</strong></span>
                    <span>Fluxo: <strong className="text-white">{formatInt(totals.fluxoTotal)}</strong></span>
                    <span>Invest.: <strong className="text-white">{formatMoney(totals.valorTotal)}</strong></span>
                  </div>
                </div>

                <div className="absolute inset-0 rounded-2xl overflow-hidden border border-white/10 bg-black/35">
                  {activeImage ? (
                    <img src={activeImage} alt={activePoint.nome} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-black/70" />
                  )}
                  <div className={`absolute inset-0 ${active?.infoOnLeft ? 'bg-[linear-gradient(90deg,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.64)_34%,rgba(0,0,0,0.2)_72%,rgba(0,0,0,0.05)_100%)]' : 'bg-[linear-gradient(270deg,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.64)_34%,rgba(0,0,0,0.2)_72%,rgba(0,0,0,0.05)_100%)]'}`} />
                </div>

                <div className={`absolute inset-y-0 z-10 w-[340px] max-w-[45%] p-4 md:p-5 ${active?.infoOnLeft ? 'left-0' : 'right-0'}`}>
                  <div className="h-full rounded-2xl border border-white/15 bg-black/62 backdrop-blur-md p-4 flex flex-col">
                    <div className="text-[11px] uppercase tracking-wide text-brand-orange">Informações</div>
                    <h3 className="mt-2 text-2xl font-extrabold leading-tight">{activePoint.nome}</h3>
                    <p className="mt-1 text-sm text-brand-gray-300">{activePoint.tipo || 'Sem tipo'} • {activePoint.cidade || 'Sem cidade'}</p>

                    <div className="mt-4 space-y-2 text-sm text-brand-gray-200">
                      {activePoint.endereco ? <div><span className="text-brand-gray-500">Endereço:</span> {activePoint.endereco}</div> : null}
                      <div><span className="text-brand-gray-500">Público:</span> {activePoint.publico || 'N/I'}</div>
                      <div><span className="text-brand-gray-500">Fluxo:</span> {formatInt(Number(activePoint.fluxo) || 0)} / mês</div>
                      <div><span className="text-brand-gray-500">Telas:</span> {formatInt(Number(activePoint.telas) || 0)}</div>
                      <div><span className="text-brand-gray-500">Inserções:</span> {formatInt(Number(activePoint.insercoes) || 0)} / mês</div>
                      <div><span className="text-brand-gray-500">Investimento:</span> {formatMoney(Number(activePoint.preco) || 0)} / mês</div>
                    </div>

                    <div className="mt-auto pt-4 text-[11px] text-brand-gray-400 border-t border-white/10">
                      <div><span className="text-brand-gray-500">Praça(s):</span> {selectionLabel}</div>
                      <div className="mt-1"><span className="text-brand-gray-500">Formato(s):</span> {typesLabel}</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-3 rounded-full border border-white/20 bg-black/40 px-4 py-2 self-center">
          <button
            type="button"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            className="rounded-full p-1 text-white/70 hover:text-white"
            aria-label="Slide anterior"
            disabled={slides.length <= 1}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs uppercase tracking-[0.14em] text-white/70">{slides.length ? `${index + 1}/${slides.length}` : '0/0'}</span>
          <button
            type="button"
            onClick={() => setIndex((current) => Math.min(slides.length - 1, current + 1))}
            className="rounded-full p-1 text-white/70 hover:text-white"
            aria-label="Proximo slide"
            disabled={slides.length <= 1}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
