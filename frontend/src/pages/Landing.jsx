import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  ArrowRight, MapPin, Monitor, Users, TrendingUp,
  Building2, Tv, UtensilsCrossed, Croissant, Route
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { fetchStats } from '../lib/api';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  })
};

export default function Landing() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar transparent />

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }}
        />
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-orange/10 rounded-full blur-[120px]" />

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-brand-gray-400 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
              Mídia Kit Digital 2025
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp} initial="hidden" animate="visible" custom={1}
            className="text-4xl sm:text-5xl md:text-7xl font-bold leading-[1.1] tracking-tight mb-6"
          >
            Explore os melhores{' '}
            <span className="text-brand-orange">pontos de mídia</span>{' '}
            da cidade
          </motion.h1>

          <motion.p
            variants={fadeUp} initial="hidden" animate="visible" custom={2}
            className="text-lg md:text-xl text-brand-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            A Intermidia conecta sua marca ao público certo, nos melhores locais.
            Mídia OOH e DOOH com tecnologia, cobertura e resultados reais.
          </motion.p>

          <motion.div
            variants={fadeUp} initial="hidden" animate="visible" custom={3}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button
              onClick={() => navigate('/explorar')}
              className="group flex items-center gap-2 px-8 py-4 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              Explorar pontos
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="#sobre"
              className="px-8 py-4 border border-white/10 text-white/70 font-medium rounded-xl hover:bg-white/5 hover:text-white transition-all duration-200"
            >
              Saiba mais
            </a>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center pt-2"
          >
            <div className="w-1 h-2 rounded-full bg-white/40" />
          </motion.div>
        </motion.div>
      </section>

      {/* Stats */}
      {stats && (
        <section className="py-20 border-t border-white/5">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { label: 'Pontos de Mídia', value: stats.total, icon: MapPin },
                { label: 'Cidades', value: stats.cidades, icon: Building2 },
                { label: 'Telas Ativas', value: stats.telas, icon: Monitor },
                { label: 'Fluxo Mensal', value: `${(stats.fluxo / 1000000).toFixed(1)}M`, icon: Users }
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="text-center"
                >
                  <item.icon className="mx-auto mb-3 text-brand-orange" size={24} />
                  <div className="text-3xl md:text-4xl font-bold font-heading mb-1">{item.value}</div>
                  <div className="text-sm text-brand-gray-500">{item.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* About */}
      <section id="sobre" className="py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Mídia que <span className="text-brand-orange">conecta</span>
            </h2>
            <p className="text-lg text-brand-gray-400 leading-relaxed mb-8">
              A Intermidia é referência em mídia OOH e DOOH no sul do Brasil.
              Com pontos estratégicos em elevadores, painéis LED, restaurantes, padarias e vias públicas,
              levamos sua marca para onde seu público está — com precisão, tecnologia e impacto real.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-5 gap-6 mt-12">
            {[
              { icon: Building2, label: 'Elevadores', desc: 'Edifícios premium' },
              { icon: Tv, label: 'Painéis LED', desc: 'Alta visibilidade' },
              { icon: UtensilsCrossed, label: 'Restaurantes', desc: 'Público qualificado' },
              { icon: Croissant, label: 'Padarias', desc: 'Fluxo constante' },
              { icon: Route, label: 'Vias Públicas', desc: 'Máximo alcance' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="group bg-white/[0.02] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] hover:border-brand-orange/20 transition-all duration-300"
              >
                <item.icon className="text-brand-orange mb-3" size={24} />
                <div className="font-semibold mb-1">{item.label}</div>
                <div className="text-sm text-brand-gray-500">{item.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Pronto para impactar?
            </h2>
            <p className="text-brand-gray-400 text-lg mb-8 max-w-xl mx-auto">
              Explore nossos pontos, monte seu plano de mídia e gere sua proposta em minutos.
            </p>
            <button
              onClick={() => navigate('/explorar')}
              className="group inline-flex items-center gap-2 px-8 py-4 bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              Explorar agora
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-brand-orange flex items-center justify-center text-xs font-bold">i</div>
            <span className="text-sm text-brand-gray-500">
              inter<span className="text-brand-gray-300">midia</span> © {new Date().getFullYear()}
            </span>
          </div>
          <div className="flex gap-6 text-sm text-brand-gray-500">
            <Link to="/explorar" className="hover:text-white transition-colors">Pontos</Link>
            <a href="#sobre" className="hover:text-white transition-colors">Sobre</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
