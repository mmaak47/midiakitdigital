import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react';
import CustomSelect from './CustomSelect';
import SmartMap from './SmartMap';
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
  const [selectedMapCity, setSelectedMapCity] = useState('');

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

  const formatos = useMemo(() => {
    const map = new Map();
    points.forEach((point) => {
      const tipo = point.tipo || 'Sem tipo';
      if (!map.has(tipo)) map.set(tipo, { tipo, quantidade: 0, telas: 0, fluxo: 0 });
      const row = map.get(tipo);
      row.quantidade += 1;
      row.telas += Number(point.telas) || 0;
      row.fluxo += Number(point.fluxo) || 0;
    });
    return Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade);
  }, [points]);

  const publicos = useMemo(() => {
    const map = new Map();
    points.forEach((point) => {
      const label = point.publico || 'Nao informado';
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  }, [points]);

  const pointsByType = useMemo(() => {
    const grouped = new Map();
    points.forEach((point) => {
      const key = point.tipo || 'Sem tipo';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(point);
    });

    return Array.from(grouped.entries())
      .map(([tipo, list]) => ({ tipo, points: list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }))
      .sort((a, b) => b.points.length - a.points.length);
  }, [points]);

  const mapPoints = useMemo(() => {
    if (!selectedMapCity) return points;
    return points.filter((point) => point.cidade === selectedMapCity);
  }, [points, selectedMapCity]);

  const mapFocusCoords = useMemo(() => {
    const first = mapPoints.find((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)));
    if (!first) return null;
    return { lat: Number(first.lat), lng: Number(first.lng) };
  }, [mapPoints]);

  const slides = useMemo(() => {
    const summarySlide = {
      key: 'summary',
      title: 'Resumo executivo da selecao',
      body: (
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Pontos" value={formatInt(totals.quantidade)} />
          <StatCard label="Telas" value={formatInt(totals.telasTotal)} />
          <StatCard label="Fluxo estimado" value={formatInt(totals.fluxoTotal)} />
          <StatCard label="Investimento total" value={formatMoney(totals.valorTotal)} />
        </div>
      )
    };

    const formatSlide = {
      key: 'formats',
      title: 'Inventario por formato',
      body: (
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.06] text-brand-gray-400 uppercase tracking-wide text-[11px]">
              <tr>
                <th className="px-4 py-3 text-left">Formato</th>
                <th className="px-4 py-3 text-left">Pontos</th>
                <th className="px-4 py-3 text-left">Telas</th>
                <th className="px-4 py-3 text-left">Fluxo</th>
              </tr>
            </thead>
            <tbody>
              {formatos.map((row) => (
                <tr key={row.tipo} className="border-t border-white/10">
                  <td className="px-4 py-3">{row.tipo}</td>
                  <td className="px-4 py-3 text-brand-gray-300">{formatInt(row.quantidade)}</td>
                  <td className="px-4 py-3 text-brand-gray-300">{formatInt(row.telas)}</td>
                  <td className="px-4 py-3 text-brand-gray-300">{formatInt(row.fluxo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    };

    const audienceSlide = {
      key: 'audience',
      title: 'Perfil de publico',
      body: (
        <div className="grid gap-3 md:grid-cols-3">
          {publicos.map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs uppercase tracking-wide text-brand-gray-500">Publico</div>
              <div className="mt-1 text-lg font-semibold">{item.label}</div>
              <div className="mt-2 text-sm text-brand-gray-300">{formatInt(item.total)} pontos</div>
            </div>
          ))}
        </div>
      )
    };

    const mapSlide = {
      key: 'map',
      title: 'Mapa da selecao',
      body: (
        <div className="h-[58vh] rounded-2xl border border-white/10 overflow-hidden bg-black/30">
          <SmartMap pontos={mapPoints} isDark={isDark} focusCoords={mapFocusCoords} />
        </div>
      )
    };

    const typeSlides = pointsByType.map((group) => ({
      key: `type-${group.tipo}`,
      title: `${group.tipo} • ${formatInt(group.points.length)} pontos`,
      body: (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 max-h-[58vh] overflow-auto pr-1">
          {group.points.map((point) => (
            <article key={point.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="h-28 rounded-lg overflow-hidden bg-black/40 border border-white/10">
                {getPrimaryPointMediaKitImage(point) ? (
                  <img src={getPrimaryPointMediaKitImage(point)} alt={point.nome} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <h4 className="mt-2 font-semibold line-clamp-1">{point.nome}</h4>
              <p className="text-xs text-brand-gray-400 line-clamp-1">{point.cidade}</p>
              <p className="mt-2 text-xs text-brand-gray-300">{formatMoney(Number(point.preco) || 0)} / mes</p>
            </article>
          ))}
        </div>
      )
    }));

    return [summarySlide, formatSlide, audienceSlide, mapSlide, ...typeSlides];
  }, [totals, formatos, publicos, pointsByType, mapPoints, mapFocusCoords, isDark]);

  useEffect(() => {
    setIndex(0);
  }, [selectedPracas, selectedTipos]);

  useEffect(() => {
    if (!selectedMapCity || !points.some((point) => point.cidade === selectedMapCity)) {
      setSelectedMapCity('');
    }
  }, [points, selectedMapCity]);

  if (!open) return null;
  const active = slides[index] || slides[0];

  return (
    <div className="fixed inset-0 z-[95] bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(254,92,43,0.24),transparent_32%)]" />

      <div className="relative z-[1] h-full flex flex-col px-6 py-5 md:px-10 md:py-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="inline-flex min-h-[30px] items-center rounded-full border border-brand-orange/35 bg-brand-orange/15 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-orange">
              Apresentacao do Midia Kit
            </div>
            <h2 className="mt-2 text-2xl md:text-3xl font-bold">{active?.title}</h2>
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

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedMapCity('')}
            className={`rounded-full border px-3 py-1.5 text-xs ${selectedMapCity === '' ? 'border-brand-orange bg-brand-orange/20 text-brand-orange' : 'border-white/15 text-brand-gray-300 hover:text-white'}`}
          >
            Mapa geral
          </button>
          {Array.from(new Set(points.map((point) => point.cidade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => setSelectedMapCity(city)}
              className={`rounded-full border px-3 py-1.5 text-xs ${selectedMapCity === city ? 'border-brand-orange bg-brand-orange/20 text-brand-orange' : 'border-white/15 text-brand-gray-300 hover:text-white'}`}
            >
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} /> {city}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex-1 min-h-0 rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 md:p-6 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={active?.key}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="h-full"
            >
              {active?.body}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3 rounded-full border border-white/20 bg-black/40 px-4 py-2 self-center">
          <button
            type="button"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            className="rounded-full p-1 text-white/70 hover:text-white"
            aria-label="Slide anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs uppercase tracking-[0.14em] text-white/70">{index + 1}/{slides.length}</span>
          <button
            type="button"
            onClick={() => setIndex((current) => Math.min(slides.length - 1, current + 1))}
            className="rounded-full p-1 text-white/70 hover:text-white"
            aria-label="Proximo slide"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-wide text-brand-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
