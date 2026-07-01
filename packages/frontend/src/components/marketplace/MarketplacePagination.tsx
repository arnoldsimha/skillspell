interface Props {
  page: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
}

export function MarketplacePagination({ page, total, limit, onPage }: Props) {
  const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
  return (
    <div className="flex items-center justify-center gap-4 mt-6">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded px-4 py-2 text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Previous
      </button>
      <span className="text-sm text-slate-600">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded px-4 py-2 text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
