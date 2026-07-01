export default function MarketplaceSkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="h-4 w-3/4 rounded-md animate-shimmer" />
        <div className="h-4 w-8 rounded-full animate-shimmer shrink-0" />
      </div>
      {/* Creator */}
      <div className="mt-1.5 h-3 w-1/3 rounded-md animate-shimmer" />
      {/* Description */}
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded-md animate-shimmer" />
        <div className="h-3 w-full rounded-md animate-shimmer" />
        <div className="h-3 w-2/3 rounded-md animate-shimmer" />
      </div>
      {/* Chips */}
      <div className="mt-3 flex gap-2">
        <div className="h-5 w-16 rounded-full animate-shimmer" />
        <div className="h-5 w-20 rounded-full animate-shimmer" />
        <div className="h-5 w-14 rounded-full animate-shimmer" />
      </div>
      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="h-4 w-16 rounded-md animate-shimmer" />
        <div className="h-8 w-8 rounded-lg animate-shimmer" />
      </div>
    </div>
  );
}
