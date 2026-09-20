export function PageControls({
  offset,
  limit,
  count,
  onChange,
}: {
  offset: number;
  limit: number;
  count: number;
  onChange: (offset: number) => void;
}) {
  if (!limit) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[#54716f]">
      <span>
        Mostrando {offset + 1}–{offset + count}
        {count === limit ? "+" : ""}
      </span>
      <div className="flex gap-2">
        <button
          className="rounded border border-[#b9cbc4] px-3 py-1.5 disabled:opacity-40"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Anterior
        </button>
        <button
          className="rounded border border-[#b9cbc4] px-3 py-1.5 disabled:opacity-40"
          disabled={count < limit}
          onClick={() => onChange(offset + limit)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
