import { Award } from 'lucide-react';

export default function CampaignScore({ scoreInfo }) {
  if (!scoreInfo) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Award size={16} className="text-brand-orange" />
        <h3 className="text-sm font-semibold uppercase tracking-wider">Score da campanha</h3>
      </div>

      <div className="flex items-end gap-2 mb-2">
        <div className="text-4xl font-bold font-heading text-white">{scoreInfo.score.toFixed(1)}</div>
        <div className="text-sm text-brand-gray-500 mb-1">/ 10</div>
      </div>
      <p className="text-sm text-brand-gray-300">{scoreInfo.explanation}</p>
    </section>
  );
}
