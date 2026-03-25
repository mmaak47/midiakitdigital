import { MessageSquareText } from 'lucide-react';

export default function AutoArgumentGenerator({ argumentsList = [] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquareText size={16} className="text-brand-orange" />
        <h4 className="text-xs font-semibold uppercase tracking-wider">Argumentação comercial automática</h4>
      </div>
      <div className="space-y-2">
        {argumentsList.map((text, index) => (
          <p key={index} className="text-sm text-brand-gray-300 leading-relaxed">{text}</p>
        ))}
      </div>
    </section>
  );
}
