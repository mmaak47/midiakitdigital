import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  ArrowRight, MapPin, Monitor, Users,
  Building2, Tv, Lightbulb, Sun, Columns3
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
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-black/60" />
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-orange/10 rounded-full blur-[120px]" />

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-brand-gray-400 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
              Mídia Kit Digital 2026
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp} initial="hidden" animate="visible" custom={1}
            className="text-4xl sm:text-5xl md:text-7xl font-bold leading-[1.1] tracking-tight mb-6"
          >
            Sua marca nos melhores{' '}
            <span className="text-brand-orange">pontos de mídia</span>{' '}
            do Sul do Brasil
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
          <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Mídia que <span className="text-brand-orange">conecta</span>
              </h2>
              <p className="text-lg text-brand-gray-400 leading-relaxed mb-4">
                A Intermidia é referência em mídia OOH e DOOH no Sul do Brasil.
                Com mais de 90 pontos estratégicos em Londrina, Maringá, Balneário Camboriú e Itajaí,
                levamos sua marca para onde seu público está — com precisão, tecnologia e impacto real.
              </p>
              <p className="text-brand-gray-500 leading-relaxed">
                Elevadores, painéis LED, backlights, frontlights, totens digitais, circuitos de supermercados
                e postos de combustível. A cobertura que sua campanha precisa.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="grid grid-cols-2 gap-4"
            >
              <div className="relative rounded-2xl overflow-hidden aspect-[3/4]">
                <img src="/about-1.jpg" alt="Intermidia OOH" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
              <div className="relative rounded-2xl overflow-hidden aspect-[3/4] mt-8">
                <img src="/about-2.jpg" alt="Intermidia mídia exterior" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { icon: Building2, label: 'Elevadores', desc: 'Edifícios premium' },
              { icon: Tv, label: 'Telas Indoor', desc: 'Pontos comerciais' },
              { icon: Columns3, label: 'Painéis LED', desc: 'Alta visibilidade' },
              { icon: Lightbulb, label: 'Backlights', desc: 'Iluminação traseira' },
              { icon: Sun, label: 'Frontlights', desc: 'Iluminação frontal' },
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

      {/* Showcase — Totem & Product */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative flex items-center justify-center"
            >
              {/* Glow behind totem */}
              <div className="absolute w-64 h-64 bg-brand-orange/20 rounded-full blur-[80px]" />
              <div className="absolute w-48 h-48 bg-brand-orange/10 rounded-full blur-[100px] translate-y-12" />
              <img
                src="/totem-sample.png"
                alt="Totem Digital Triplaface Intermidia"
                className="relative z-10 max-h-[500px] object-contain drop-shadow-[0_20px_60px_rgba(246,130,31,0.3)] hover:scale-105 transition-transform duration-500"
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Tecnologia que <span className="text-brand-orange">impacta</span>
              </h2>
              <p className="text-lg text-brand-gray-400 leading-relaxed mb-6">
                Totens digitais de alta definição, painéis LED de grande formato e telas indoor
                em pontos de alto fluxo. Toda a infraestrutura para sua campanha brilhar.
              </p>
              <ul className="space-y-3">
                {['Conteúdo dinâmico em tempo real', 'Segmentação por horário e local', 'Relatórios de audiência e impacto', 'Suporte técnico dedicado'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-brand-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-orange flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Audience / Engagement */}
      <section className="py-24 border-t border-white/5 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-15"
          style={{ backgroundImage: "url('/stock-wallpaper.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/90 to-black" />
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Público <span className="text-brand-orange">engajado</span>
              </h2>
              <p className="text-lg text-brand-gray-400 leading-relaxed mb-6">
                Nossas telas estão onde as pessoas vivem, trabalham e se divertem.
                Conteúdo relevante no momento certo gera conexão real com a audiência.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: '2.9M+', label: 'Fluxo mensal' },
                  { value: '221', label: 'Telas ativas' },
                  { value: '93', label: 'Pontos estratégicos' },
                  { value: '4', label: 'Cidades' },
                ].map((item) => (
                  <div key={item.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                    <div className="text-2xl font-bold text-brand-orange font-heading">{item.value}</div>
                    <div className="text-sm text-brand-gray-500">{item.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative rounded-2xl overflow-hidden aspect-[4/3]"
            >
              <img src="/audience.jpg" alt="Público assistindo conteúdo" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-l from-black/50 to-transparent" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Showcase Gallery */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Presença que <span className="text-brand-orange">marca</span>
            </h2>
            <p className="text-brand-gray-400 max-w-2xl mx-auto">
              De elevadores de alto padrão a avenidas movimentadas, sua marca está sempre visível.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { src: '/showcase.png', label: 'Mídia em elevadores' },
              { src: '/about-1.jpg', label: 'Painéis e backlights' },
              { src: '/about-2.jpg', label: 'Cobertura urbana' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="group relative rounded-2xl overflow-hidden aspect-[4/3]"
              >
                <img src={item.src} alt={item.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="font-semibold text-sm">{item.label}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-white/5 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('/city-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black" />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
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
            <img src="/logo.png" alt="Intermidia" className="h-6" />
            <span className="text-sm text-brand-gray-500">
              © {new Date().getFullYear()}
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
