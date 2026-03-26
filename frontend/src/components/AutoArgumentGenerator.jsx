import { MessageSquareText } from 'lucide-react';

export default function AutoArgumentGenerator({ argumentsList = [], isDark = true }) {
  return (
    <section className={`rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquareText size={16} className="text-brand-orange" />
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-white' : 'text-neutral-900'}`}>Argumentação comercial automática</h4>
      </div>
      <div className="space-y-2">
        {argumentsList.map((text, index) => (
          <p key={index} className={`text-sm leading-relaxed ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>{text}</p>
        ))}
      </div>
    </section>
  );
}
