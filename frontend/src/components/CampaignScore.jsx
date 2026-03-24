import { Award } from 'lucide-react';

export default function CampaignScore({ scoreInfo }) {
  if (!scoreInfo) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-6 shadow-lg shadow-black/20">
      <div className="flex items-center gap-2 mb-4">
        <Award size={18} className="text-brand-orange" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-white">Score da campanha</h3>
      </div>

      <div className="flex items-end gap-3 mb-3">
        <div className="text-5xl font-bold font-heading text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-orange-hover">{scoreInfo.score.toFixed(1)}</div>
        <div className="text-base text-brand-gray-500 font-semibold mb-2">/ 10</div>
      </div>
      <p className="text-sm text-brand-gray-300 leading-relaxed">{scoreInfo.explanation}</p>
    </section>
  );
}
