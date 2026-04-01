export default function SkeletonCard({ isDark = true }) {
  return (
    <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-white/[0.02] border border-white/5' : 'bg-white border border-neutral-200'}`}>
      <div className={`h-44 ${isDark ? 'skeleton' : 'skeleton-light'}`} />
      <div className="p-4 space-y-3">
        <div className={`h-5 w-3/4 rounded ${isDark ? 'skeleton' : 'skeleton-light'}`} />
        <div className={`h-3 w-1/2 rounded ${isDark ? 'skeleton' : 'skeleton-light'}`} />
        <div className="flex gap-3">
          <div className={`h-3 w-12 rounded ${isDark ? 'skeleton' : 'skeleton-light'}`} />
          <div className={`h-3 w-16 rounded ${isDark ? 'skeleton' : 'skeleton-light'}`} />
          <div className={`h-3 w-14 rounded ${isDark ? 'skeleton' : 'skeleton-light'}`} />
        </div>
        <div className="flex justify-between items-center pt-1">
          <div className={`h-6 w-24 rounded ${isDark ? 'skeleton' : 'skeleton-light'}`} />
          <div className={`h-4 w-20 rounded ${isDark ? 'skeleton' : 'skeleton-light'}`} />
        </div>
      </div>
    </div>
  );
}
