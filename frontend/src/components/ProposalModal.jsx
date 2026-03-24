import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, Download, Presentation } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import { campaignTotals, generateCommercialArguments } from '../lib/strategy';
import ProposalBuilder from './ProposalBuilder';
import PresentationMode from './PresentationMode';

export default function ProposalModal({ onClose }) {
  const { favorites } = useFavorites();
  const [step, setStep] = useState('review');
  const [showPresentation, setShowPresentation] = useState(false);
  const [form, setForm] = useState({
    clientName: '',
    city: '',
    segmento: 'clinica',
    objetivo: 'reconhecimento de marca',
    publico: ''
  });

  const totals = useMemo(() => campaignTotals(favorites), [favorites]);

  const argumentos = useMemo(() => generateCommercialArguments({
    selected: favorites,
    city: form.city,
    publico: form.publico,
    objetivo: form.objetivo,
    segmento: form.segmento
  }), [favorites, form]);

  const handleGenerate = () => setStep('generated');

  const handlePrint = () => window.print();

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-brand-dark border border-white/10 rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/60 hover:text-white transition-all"
          >
            <X size={18} />
          </button>

          <div className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <FileText size={24} className="text-brand-orange" />
              <div>
                <h2 className="text-2xl font-bold text-white">Modo gerar proposta automatica</h2>
                <p className="text-sm text-brand-gray-400">Estrutura pronta para exportacao em PDF e apresentacao comercial.</p>
              </div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-gray-400 mb-3">Dados da proposta</h3>
              <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
                <Input label="Nome do cliente" value={form.clientName} onChange={(value) => setForm((s) => ({ ...s, clientName: value }))} />
                <Input label="Cidade" value={form.city} onChange={(value) => setForm((s) => ({ ...s, city: value }))} />
                <Input label="Segmento" value={form.segmento} onChange={(value) => setForm((s) => ({ ...s, segmento: value }))} />
                <Input label="Objetivo" value={form.objetivo} onChange={(value) => setForm((s) => ({ ...s, objetivo: value }))} />
                <Input label="Publico" value={form.publico} onChange={(value) => setForm((s) => ({ ...s, publico: value }))} />
              </div>
            </section>

            {step === 'review' && (
              <ProposalBuilder
                clientName={form.clientName}
                city={form.city}
                points={favorites}
                totals={totals}
                strategicText={argumentos}
                onGenerate={handleGenerate}
              />
            )}

            {step === 'generated' && (
              <section className="space-y-4">
                <div className="rounded-2xl border border-brand-orange/30 bg-brand-orange/10 p-4">
                  <h3 className="text-lg font-semibold text-white mb-1">Proposta gerada com sucesso</h3>
                  <p className="text-sm text-brand-gray-300">Apresentacao pronta para reuniao comercial, com narrativa estrategica e indicadores executivos.</p>
                </div>

                <ProposalBuilder
                  clientName={form.clientName}
                  city={form.city}
                  points={favorites}
                  totals={totals}
                  strategicText={argumentos}
                  onGenerate={() => {}}
                />

                <div className="grid sm:grid-cols-3 gap-3">
                  <button
                    onClick={handlePrint}
                    className="h-11 rounded-xl bg-brand-orange text-white font-semibold hover:bg-brand-orange-hover inline-flex items-center justify-center gap-2"
                  >
                    <Download size={16} />
                    Exportar / Imprimir
                  </button>

                  <button
                    onClick={() => setShowPresentation(true)}
                    className="h-11 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] font-medium inline-flex items-center justify-center gap-2"
                  >
                    <Presentation size={16} />
                    Modo apresentacao
                  </button>

                  <button
                    onClick={() => setStep('review')}
                    className="h-11 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] font-medium"
                  >
                    Voltar para revisao
                  </button>
                </div>
              </section>
            )}
          </div>
        </motion.div>
      </motion.div>

      {showPresentation && (
        <PresentationMode
          points={favorites}
          totals={totals}
          onClose={() => setShowPresentation(false)}
        />
      )}
    </>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wide text-brand-gray-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-orange/40"
      />
    </div>
  );
}
