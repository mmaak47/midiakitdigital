export default function SkeletonCard() {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
      <div className="h-44 skeleton" />
      <div className="p-4 space-y-3">
        <div className="h-5 w-3/4 rounded skeleton" />
        <div className="h-3 w-1/2 rounded skeleton" />
        <div className="flex gap-3">
          <div className="h-3 w-12 rounded skeleton" />
          <div className="h-3 w-16 rounded skeleton" />
          <div className="h-3 w-14 rounded skeleton" />
        </div>
        <div className="flex justify-between items-center pt-1">
          <div className="h-6 w-24 rounded skeleton" />
          <div className="h-4 w-20 rounded skeleton" />
        </div>
      </div>
    </div>
  );
}
