import type { ApiRow } from "../lib/api";

type Column = {
  key: string;
  label: string;
  format?: "usd" | "pen" | "date" | "status";
};

function cellValue(value: unknown, format?: Column["format"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "usd" && typeof value === "number")
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value / 100);
  if (format === "pen" && typeof value === "number")
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
    }).format(value / 100);
  if (format === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(date);
  }
  return String(value);
}

export function OperationsTable({
  columns,
  items,
  onRowClick,
}: {
  columns: Column[];
  items: ApiRow[];
  onRowClick?: (item: ApiRow) => void;
}) {
  if (!items.length)
    return (
      <p className="px-5 py-7 text-sm text-[#607876]">
        No hay registros para esta vista.
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-[#d9e2df] bg-[#eef3ef] text-xs uppercase tracking-[0.08em] text-[#54716f]">
          <tr>
            {columns.map((column) => (
              <th className="px-4 py-3 font-semibold" key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              className={`border-b border-[#e6ece9] last:border-0 ${onRowClick ? "cursor-pointer hover:bg-[#f6faf7]" : ""}`}
              key={String(item.id ?? index)}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((column) => (
                <td className="px-4 py-3 align-top" key={column.key}>
                  {column.format === "status" ? (
                    <span className="rounded-full bg-[#e7ece9] px-2.5 py-1 text-xs font-semibold text-[#405550]">
                      {cellValue(item[column.key])}
                    </span>
                  ) : (
                    cellValue(item[column.key], column.format)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
