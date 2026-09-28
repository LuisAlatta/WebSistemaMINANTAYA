type PageControlsProps = {
  offset: number;
  limit: number;
  count: number;
  total?: number;
  onChange: (offset: number) => void;
};

export function PageControls({
  offset,
  limit,
  count,
  total,
  onChange,
}: PageControlsProps) {
  if (!limit) return null;

  const start = count > 0 ? offset + 1 : 0;
  const end = offset + count;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-[#59756f]">
      <span>
        Mostrando <strong className="font-semibold text-[#183a32]">{start}</strong> a{" "}
        <strong className="font-semibold text-[#183a32]">{end}</strong>
        {total !== undefined ? (
          <> de <strong className="font-semibold text-[#183a32]">{total}</strong> registros</>
        ) : count === limit ? (
          " (más registros disponibles)"
        ) : (
          ""
        )}
      </span>

      <div className="inline-flex items-center gap-2">
        <button
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#c6d7d0] bg-white px-3 py-1.5 font-semibold text-[#274b42] shadow-xs transition hover:bg-[#f4f7f6] disabled:pointer-events-none disabled:opacity-40 leading-none"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
          type="button"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Anterior
        </button>

        <button
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#c6d7d0] bg-white px-3 py-1.5 font-semibold text-[#274b42] shadow-xs transition hover:bg-[#f4f7f6] disabled:pointer-events-none disabled:opacity-40 leading-none"
          disabled={count < limit || (total !== undefined && end >= total)}
          onClick={() => onChange(offset + limit)}
          type="button"
        >
          Siguiente
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
