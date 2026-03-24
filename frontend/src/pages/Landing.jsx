import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  MapPinned,
  MapPin,
  Clock,
  Monitor,
  Users,
  Hash,
  Play,
  RotateCcw,
  BarChart3,
  CircleDollarSign,
  Layers3,
  Activity,
  Target,
  DollarSign
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { fetchPontos } from '../lib/api';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
  })
};

function formatInt(value) {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(value || 0);
}

function anchorIdFromTipo(tipo) {
  const base = (tipo || 'sem-tipo').toLowerCase().trim();
  return `tipo-${base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
}

export default function Landing() {
  const navigate = useNavigate();
  const [allPontos, setAllPontos] = useState([]);
  const [selectedPraca, setSelectedPraca] = useState('Todas as praças');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadPontos() {
      try {
        const data = await fetchPontos();
        if (active) setAllPontos(data);
      } catch {
        if (active) setAllPontos([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPontos();

    return () => {
      active = false;
    };
  }, []);

  const pracas = useMemo(() => {
    const unique = new Set(allPontos.map((p) => p.cidade).filter(Boolean));
    return ['Todas as praças', ...Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [allPontos]);

  const quickPracas = useMemo(() => pracas.slice(0, 5), [pracas]);

  const pontos = useMemo(() => {
    if (selectedPraca === 'Todas as praças') return allPontos;
    return allPontos.filter((p) => p.cidade === selectedPraca);
  }, [allPontos, selectedPraca]);

  const resumo = useMemo(() => {
    const totals = pontos.reduce((acc, p) => {
      acc.telas += Number(p.telas) || 0;
      acc.fluxo += Number(p.fluxo) || 0;
      acc.insercoes += Number(p.insercoes) || 0;
      acc.preco += Number(p.preco) || 0;
      return acc;
    }, { telas: 0, fluxo: 0, insercoes: 0, preco: 0 });

    const ticketMedio = pontos.length ? Math.round(totals.preco / pontos.length) : 0;
    const cpm = totals.fluxo > 0 ? ((ticketMedio / totals.fluxo) * 1000).toFixed(2) : '0.00';

    return {
      pontos: pontos.length,
      telas: totals.telas,
      fluxo: totals.fluxo,
      insercoes: totals.insercoes,
      ticketMedio,
      cpm
    };
  }, [pontos]);

  const formatos = useMemo(() => {
    const map = new Map();

    pontos.forEach((p) => {
      const tipo = p.tipo || 'Sem tipo';
      if (!map.has(tipo)) {
        map.set(tipo, { tipo, quantidade: 0, telas: 0, fluxo: 0 });
      }
      const current = map.get(tipo);
      current.quantidade += 1;
      current.telas += Number(p.telas) || 0;
      current.fluxo += Number(p.fluxo) || 0;
    });

    return Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade);
  }, [pontos]);

  const publicos = useMemo(() => {
    const map = new Map();

    pontos.forEach((p) => {
      const label = p.publico || 'Nao informado';
      map.set(label, (map.get(label) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total);
  }, [pontos]);

  const tiposComAncora = useMemo(() => {
    return formatos.map((f) => ({
      ...f,
      anchorId: anchorIdFromTipo(f.tipo)
    }));
  }, [formatos]);

  const pontosPorTipo = useMemo(() => {
    const map = new Map();

    pontos.forEach((p) => {
      const tipo = p.tipo || 'Sem tipo';
      if (!map.has(tipo)) {
        map.set(tipo, []);
      }
      map.get(tipo).push(p);
    });

    return tiposComAncora.map((tipoInfo) => ({
      ...tipoInfo,
      pontos: (map.get(tipoInfo.tipo) || []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    }));
  }, [pontos, tiposComAncora]);

  const explorerPath = `/explorar${selectedPraca !== 'Todas as praças' ? `?cidade=${encodeURIComponent(selectedPraca)}` : ''}`;

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <section className="pt-20 pb-10 border-b border-white/10 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-35 bg-cover bg-center"
          style={{ backgroundImage: "url('/city-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/80 to-black" />
        <div className="absolute -top-16 left-10 w-64 h-64 bg-brand-orange/20 rounded-full blur-[90px]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-orange/30 bg-brand-orange/10 text-xs font-semibold tracking-wide text-brand-orange mb-6">
              MIDIA KIT DIGITAL INTERMIDIA 2026
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
            className="text-3xl sm:text-4xl md:text-5xl font-bold leading-[1.05] tracking-tight mb-4 max-w-4xl"
          >
            Planejamento por praca com inventario real, audiencia e oportunidades de midia.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={2}
            className="text-base md:text-lg text-brand-gray-400 max-w-3xl mb-8"
          >
            Selecione uma praca para gerar um midia kit focado na cidade ou visualize o consolidado de todas as pracas.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="grid lg:grid-cols-[1fr_auto] gap-4 p-4 bg-white/[0.08] border border-white/15 rounded-2xl backdrop-blur-xl"
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-brand-gray-500 uppercase tracking-wide">Praca</label>
                <select
                  value={selectedPraca}
                  onChange={(e) => setSelectedPraca(e.target.value)}
                  className="mt-1 w-full px-3 py-3 rounded-xl bg-white/10 border border-white/20 focus:border-brand-orange outline-none"
                >
                  {pracas.map((praca) => (
                    <option key={praca} value={praca}>{praca}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-brand-gray-500 uppercase tracking-wide">Visualizacao</label>
                <div className="mt-1 h-[50px] rounded-xl bg-white/10 border border-white/20 px-3 flex items-center text-sm text-brand-gray-300">
                  {selectedPraca === 'Todas as praças' ? 'Consolidado multirregional' : `Foco em ${selectedPraca}`}
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate(explorerPath)}
              className="group h-[50px] self-end px-7 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200"
            >
              Abrir mapa da praca
              <ArrowRight size={16} className="inline ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>

          <div className="flex flex-wrap gap-2 mt-4">
            {quickPracas.map((praca) => (
              <button
                key={praca}
                onClick={() => setSelectedPraca(praca)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedPraca === praca
                    ? 'bg-brand-orange text-white border-brand-orange'
                    : 'bg-white/[0.03] text-brand-gray-400 border-white/10 hover:text-white'
                }`}
              >
                {praca}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-10 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6">
          {loading ? (
            <div className="text-sm text-brand-gray-500">Carregando inventario...</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {[
                { label: 'Pontos', value: formatInt(resumo.pontos), icon: MapPinned },
                { label: 'Telas', value: formatInt(resumo.telas), icon: Monitor },
                { label: 'Fluxo estimado', value: formatInt(resumo.fluxo), icon: Users },
                { label: 'Insercoes', value: formatInt(resumo.insercoes), icon: Activity },
                { label: 'Ticket medio', value: formatMoney(resumo.ticketMedio), icon: CircleDollarSign },
                { label: 'CPM medio', value: `R$ ${resumo.cpm}`, icon: Target }
              ].map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="rounded-2xl border border-white/15 bg-white/[0.07] p-4"
                >
                  <card.icon className="text-brand-orange mb-3" size={18} />
                  <div className="text-lg md:text-2xl font-bold mb-1">{card.value}</div>
                  <div className="text-xs text-brand-gray-500 uppercase tracking-wide">{card.label}</div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-12 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-3 gap-6">
          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-2 rounded-2xl border border-white/15 bg-brand-gray-900 overflow-hidden"
          >
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Layers3 size={18} className="text-brand-orange" />
                Inventario por formato
              </h2>
              <span className="text-xs text-brand-gray-500 uppercase tracking-wide">{selectedPraca}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-brand-gray-500 border-b border-white/10 bg-white/[0.02]">
                  <tr>
                    <th className="text-left font-medium px-5 py-3">Formato</th>
                    <th className="text-left font-medium px-5 py-3">Pontos</th>
                    <th className="text-left font-medium px-5 py-3">Telas</th>
                    <th className="text-left font-medium px-5 py-3">Fluxo</th>
                  </tr>
                </thead>
                <tbody>
                  {formatos.map((f) => (
                    <tr key={f.tipo} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-white">{f.tipo}</td>
                      <td className="px-5 py-3 text-brand-gray-300">{formatInt(f.quantidade)}</td>
                      <td className="px-5 py-3 text-brand-gray-300">{formatInt(f.telas)}</td>
                      <td className="px-5 py-3 text-brand-gray-300">{formatInt(f.fluxo)}</td>
                    </tr>
                  ))}
                  {!loading && formatos.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-4 text-brand-gray-500">Nenhum formato encontrado para esta selecao.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.article>

          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-white/15 bg-brand-gray-900 p-5"
          >
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-brand-orange" />
              Perfil de publico
            </h3>
            <div className="space-y-2">
              {publicos.length === 0 && (
                <div className="text-sm text-brand-gray-500">Sem dados de publico para esta selecao.</div>
              )}
              {publicos.map((item) => {
                const pct = resumo.pontos ? Math.round((item.total / resumo.pontos) * 100) : 0;
                return (
                  <div key={item.label} className="rounded-xl border border-white/10 p-3">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span>{item.label}</span>
                      <span className="text-brand-gray-400">{item.total} pontos</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-brand-orange" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.article>
        </div>
      </section>

      <section className="py-12 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold">Catalogo completo da selecao</h2>
            <span className="text-xs uppercase tracking-wide text-brand-gray-500">{formatInt(pontos.length)} pontos</span>
          </div>

          {!loading && tiposComAncora.length > 0 && (
            <div className="sticky top-16 z-20 mb-5 rounded-xl border border-white/15 bg-brand-gray-900/95 backdrop-blur-xl p-3">
              <div className="text-[11px] uppercase tracking-wide text-brand-gray-500 mb-2">Ancoragem por formato</div>
              <div className="flex flex-wrap gap-2">
                {tiposComAncora.map((tipoInfo) => (
                  <a
                    key={tipoInfo.anchorId}
                    href={`#${tipoInfo.anchorId}`}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-white/[0.03] text-brand-gray-300 hover:text-white hover:border-brand-orange/40 transition-colors"
                  >
                    {tipoInfo.tipo} ({tipoInfo.quantidade})
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-8">
            {pontosPorTipo.map((grupo, groupIndex) => (
              <section key={grupo.anchorId} id={grupo.anchorId} className="scroll-mt-24">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-white">{grupo.tipo}</h3>
                  <span className="text-xs text-brand-gray-500 uppercase tracking-wide">{formatInt(grupo.quantidade)} pontos</span>
                </div>

                <div className="space-y-4">
                  {grupo.pontos.map((ponto, itemIndex) => (
                    <motion.article
                      key={ponto.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: Math.min((groupIndex + itemIndex) * 0.02, 0.45), duration: 0.4 }}
                      className="rounded-2xl border border-white/15 bg-brand-gray-900 p-4 lg:p-5"
                    >
                      <div className="grid lg:grid-cols-[220px_1fr] gap-4">
                        <div className="rounded-xl overflow-hidden bg-white/[0.03] min-h-[180px]">
                          {ponto.imagem ? (
                            <img src={ponto.imagem} alt={ponto.nome} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full min-h-[180px] flex items-center justify-center text-brand-gray-600 text-sm">
                              Sem imagem
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="text-[11px] uppercase tracking-wide rounded-md px-2 py-1 bg-brand-orange/15 text-brand-orange border border-brand-orange/30">
                                  {ponto.tipo}
                                </span>
                                <span className="text-[11px] uppercase tracking-wide rounded-md px-2 py-1 bg-white/[0.04] text-brand-gray-300 border border-white/10">
                                  Publico {ponto.publico || 'N/I'}
                                </span>
                              </div>
                              <h4 className="text-xl font-semibold leading-tight">{ponto.nome}</h4>
                              <p className="text-sm text-brand-gray-500 mt-1">{ponto.cidade}</p>
                            </div>
                            <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 min-w-[160px]">
                              <div className="flex items-center gap-1 text-[11px] text-brand-gray-500 uppercase tracking-wide mb-1">
                                <DollarSign size={12} className="text-brand-orange" />
                                Investimento mensal
                              </div>
                              <div className="text-xl font-bold">{formatMoney(Number(ponto.preco) || 0)}</div>
                            </div>
                          </div>

                          {ponto.endereco && (
                            <p className="text-sm text-brand-gray-300 mb-2 flex items-start gap-2">
                              <MapPin size={14} className="text-brand-orange mt-0.5 shrink-0" />
                              {ponto.endereco}
                            </p>
                          )}

                          {ponto.descricao && (
                            <p className="text-sm text-brand-gray-400 mb-3">
                              {ponto.descricao}
                            </p>
                          )}

                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><Users size={12} /> Fluxo</div>
                              <div className="font-medium">{formatInt(Number(ponto.fluxo) || 0)} / mes</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><Hash size={12} /> Insercoes</div>
                              <div className="font-medium">{formatInt(Number(ponto.insercoes) || 0)} / mes</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><Monitor size={12} /> Telas</div>
                              <div className="font-medium">{formatInt(Number(ponto.telas) || 0)}</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><Clock size={12} /> Horario</div>
                              <div className="font-medium">{ponto.horario || 'N/I'}</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><Play size={12} /> Tempo</div>
                              <div className="font-medium">{ponto.tempo || 'N/I'}</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><RotateCcw size={12} /> Loop</div>
                              <div className="font-medium">{ponto.loop || 'N/I'}</div>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-brand-gray-500">
                            <span>Veiculacao: {ponto.veiculacao || 'N/I'}</span>
                            {(ponto.lat && ponto.lng) && <span>Coordenadas: {ponto.lat}, {ponto.lng}</span>}
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </div>
              </section>
            ))}
            {!loading && pontos.length === 0 && (
              <div className="text-sm text-brand-gray-500">Nenhum ponto disponivel para a selecao atual.</div>
            )}
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-white/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-orange/10 via-transparent to-transparent" />
        <div className="relative max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid lg:grid-cols-[1fr_auto] gap-6 items-center"
          >
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-3">Quer fechar o plano desta praca?</h2>
              <p className="text-brand-gray-400 max-w-2xl">
                Continue para o explorador com filtros aplicados e selecione os pontos para montar sua proposta comercial.
              </p>
            </div>
            <button
              onClick={() => navigate(explorerPath)}
              className="group inline-flex items-center justify-center gap-2 px-8 h-[52px] bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200"
            >
              Explorar inventario completo
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      <footer className="py-12 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Intermidia" className="h-6" />
            <span className="text-sm text-brand-gray-500">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-brand-gray-500">
            <Link to="/explorar" className="hover:text-white transition-colors">Pontos</Link>
            <button onClick={() => setSelectedPraca('Todas as praças')} className="hover:text-white transition-colors">Todas as pracas</button>
            <span className="inline-flex items-center gap-2">
              <Building2 size={14} /> {formatInt(Math.max(pracas.length - 1, 0))} pracas
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
