import { useState, useMemo, useEffect, ReactNode } from "react";
import type { ApiRow } from "../lib/api";
import { StatusBadge } from "./StatusBadge";

export type Column = {
  key: string;
  label: string;
  format?: "usd" | "pen" | "date" | "status" | "number" | "badge" | "custom";
  align?: "left" | "center" | "right";
  render?: (row: ApiRow, value: unknown) => ReactNode;
  sortable?: boolean;
};

export function formatUsd(cents: unknown): string {
  if (cents === null || cents === undefined || cents === "") return "—";
  const num = Number(cents);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num / 100);
}

export function formatPen(cents: unknown): string {
  if (cents === null || cents === undefined || cents === "") return "—";
  const num = Number(cents);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(num / 100);
}

export function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date);
}

export function formatNumber(value: unknown, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: Number.isInteger(num) ? 0 : decimals,
  }).format(num);
}

export function cellContent(value: unknown, format?: Column["format"]): ReactNode {
  if (value === null || value === undefined || value === "") return "—";

  switch (format) {
    case "usd":
      return <span className="font-mono tabular-nums">{formatUsd(value)}</span>;
    case "pen":
      return <span className="font-mono tabular-nums">{formatPen(value)}</span>;
    case "number":
      return <span className="font-mono tabular-nums">{formatNumber(value)}</span>;
    case "date":
      return formatDate(value);
    case "status":
      return <StatusBadge status={value} />;
    case "badge":
      return (
        <span className="inline-flex items-center rounded-md bg-[#edf3f0] px-2 py-0.5 text-xs font-medium text-[#2d5248]">
          {String(value)}
        </span>
      );
    default:
      return String(value);
  }
}

export type OperationsTableProps = {
  columns: Column[];
  items: ApiRow[];
  onRowClick?: (item: ApiRow) => void;
  emptyMessage?: string;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  showSearch?: boolean;
  searchPlaceholder?: string;
  actions?: ReactNode;
};

export function OperationsTable({
  columns,
  items,
  onRowClick,
  emptyMessage = "No hay registros para esta vista.",
  defaultPageSize = 15,
  pageSizeOptions = [10, 15, 25, 50],
  showSearch = true,
  searchPlaceholder = "Filtrar en esta tabla…",
  actions,
}: OperationsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [localSearch, setLocalSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Reset to first page whenever dataset, search query, or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [items.length, localSearch, pageSize]);

  // 1. Local search filter
  const filteredItems = useMemo(() => {
    if (!localSearch.trim()) return items;
    const q = localSearch.trim().toLowerCase();
    return items.filter((row) =>
      columns.some((col) => {
        const val = row[col.key];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      }),
    );
  }, [items, localSearch, columns]);

  // 2. Sorting
  const sortedItems = useMemo(() => {
    if (!sortKey) return filteredItems;
    const col = columns.find((c) => c.key === sortKey);
    const sorted = [...filteredItems].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (col?.format === "usd" || col?.format === "pen" || col?.format === "number") {
        return Number(valA) - Number(valB);
      }

      if (col?.format === "date") {
        const timeA = new Date(String(valA)).getTime();
        const timeB = new Date(String(valB)).getTime();
        if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
          return timeA - timeB;
        }
      }

      return String(valA).localeCompare(String(valB), "es", { sensitivity: "base", numeric: true });
    });

    return sortOrder === "desc" ? sorted.reverse() : sorted;
  }, [filteredItems, sortKey, sortOrder, columns]);

  // 3. Pagination calculations
  const totalItems = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const currentRows = sortedItems.slice(startIndex, endIndex);

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortOrder === "asc") setSortOrder("desc");
      else {
        setSortKey(null);
        setSortOrder("asc");
      }
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-[#dce5e1] bg-white shadow-xs">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7eee9] bg-[#fafcfb] px-4 py-3">
        {/* Left: Search input & summary */}
        <div className="flex flex-wrap items-center gap-3">
          {showSearch && (
            <div className="relative min-w-[220px] max-w-sm">
              <input
                className="w-full rounded-lg border border-[#c6d7d0] bg-white py-1.5 pl-8 pr-7 text-xs text-[#10242b] outline-none transition focus:border-[#2e6b61] focus:ring-1 focus:ring-[#2e6b61]/20"
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder={searchPlaceholder}
                type="text"
                value={localSearch}
              />
              <svg
                className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#7c968f]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              {localSearch && (
                <button
                  className="absolute right-2 top-2 text-[#7c968f] hover:text-[#10242b]"
                  onClick={() => setLocalSearch("")}
                  type="button"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          <div className="text-xs text-[#59756f]">
            <span className="font-semibold text-[#183a32]">{totalItems}</span> {totalItems === 1 ? "registro" : "registros"}
            {items.length !== totalItems && (
              <span className="ml-1 text-[#839b94]">(de {items.length} totales)</span>
            )}
          </div>
        </div>

        {/* Right: Actions + Page Size Selector */}
        <div className="flex items-center gap-3">
          {actions}
          <div className="inline-flex items-center gap-1.5 text-xs text-[#59756f]">
            <span>Mostrar</span>
            <select
              aria-label="Registros por página"
              className="rounded-lg border border-[#c6d7d0] bg-white px-2 py-1 text-xs font-semibold text-[#183a32] outline-none transition focus:border-[#2e6b61]"
              onChange={(e) => setPageSize(Number(e.target.value))}
              value={pageSize}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <span>por pág.</span>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-[#dce5e1] bg-[#f4f8f6] font-semibold uppercase tracking-wider text-[#49655f]">
            <tr>
              {columns.map((column) => {
                const alignClass =
                  column.align === "right" ||
                  column.format === "usd" ||
                  column.format === "pen" ||
                  column.format === "number"
                    ? "text-right"
                    : column.align === "center" || column.format === "status"
                    ? "text-center"
                    : "text-left";
                const isSorted = sortKey === column.key;
                return (
                  <th
                    className={`px-3.5 py-3 whitespace-nowrap cursor-pointer select-none transition hover:bg-[#eaf1ed] ${alignClass}`}
                    key={column.key}
                    onClick={() => handleSort(column.key)}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        alignClass === "text-right"
                          ? "justify-end"
                          : alignClass === "text-center"
                          ? "justify-center"
                          : "justify-start"
                      }`}
                    >
                      <span>{column.label}</span>
                      <span className="inline-flex text-[#839b94]">
                        {isSorted ? (
                          sortOrder === "asc" ? (
                            <svg className="h-3 w-3 text-[#2e6b61]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                            </svg>
                          ) : (
                            <svg className="h-3 w-3 text-[#2e6b61]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          )
                        ) : (
                          <svg className="h-3 w-3 opacity-30" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                          </svg>
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2ef]">
            {currentRows.length === 0 ? (
              <tr>
                <td className="py-12 text-center text-[#7c968f]" colSpan={columns.length}>
                  <div className="flex flex-col items-center justify-center gap-2">
                    <svg className="h-8 w-8 text-[#a3b8b1]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    <p className="text-xs font-medium">{emptyMessage}</p>
                    {localSearch && (
                      <button
                        className="mt-1 text-xs font-semibold text-[#2e6b61] hover:underline"
                        onClick={() => setLocalSearch("")}
                        type="button"
                      >
                        Limpiar búsqueda
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              currentRows.map((item, index) => (
                <tr
                  className={`transition-colors ${
                    onRowClick ? "cursor-pointer hover:bg-[#f2f8f5]" : "hover:bg-[#fafcfb]"
                  }`}
                  key={String(item.id ?? `${safePage}-${index}`)}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((column) => {
                    const alignClass =
                      column.align === "right" ||
                      column.format === "usd" ||
                      column.format === "pen" ||
                      column.format === "number"
                        ? "text-right font-mono"
                        : column.align === "center" || column.format === "status"
                        ? "text-center"
                        : "text-left";
                    return (
                      <td
                        className={`px-3.5 py-2.5 align-middle text-[#1a332d] ${alignClass}`}
                        key={column.key}
                      >
                        {column.render
                          ? column.render(item, item[column.key])
                          : cellContent(item[column.key], column.format)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Pagination Bar: Style 1 de 15 with Anterior / Siguiente */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e7eee9] bg-[#fafcfb] px-4 py-3 text-xs text-[#59756f]">
        <div>
          {totalItems > 0 ? (
            <span>
              Mostrando <strong className="font-semibold text-[#183a32]">{startIndex + 1}</strong> a{" "}
              <strong className="font-semibold text-[#183a32]">{endIndex}</strong> de{" "}
              <strong className="font-semibold text-[#183a32]">{totalItems}</strong> registros
            </span>
          ) : (
            <span>0 registros</span>
          )}
        </div>

        {/* Navigation Buttons: 1 de 15 */}
        <div className="inline-flex items-center gap-2">
          {totalPages > 2 && (
            <button
              aria-label="Primera página"
              className="inline-flex items-center justify-center rounded-lg border border-[#c6d7d0] bg-white p-1.5 text-xs text-[#274b42] shadow-2xs transition hover:bg-[#f4f7f6] disabled:pointer-events-none disabled:opacity-30 leading-none cursor-pointer"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage(1)}
              title="Primera página"
              type="button"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m18.75 4.5-7.5 7.5 7.5 7.5m-6-15L5.25 12l7.5 7.5" />
              </svg>
            </button>
          )}

          <button
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#c6d7d0] bg-white px-3 py-1.5 text-xs font-semibold text-[#274b42] shadow-2xs transition hover:bg-[#f4f7f6] disabled:pointer-events-none disabled:opacity-30 leading-none cursor-pointer"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Anterior
          </button>

          <span className="inline-flex items-center justify-center rounded-lg border border-[#c6d7d0] bg-white px-3 py-1.5 text-xs font-bold text-[#183a32] shadow-2xs leading-none">
            Página {safePage} de {totalPages}
          </span>

          <button
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#c6d7d0] bg-white px-3 py-1.5 text-xs font-semibold text-[#274b42] shadow-2xs transition hover:bg-[#f4f7f6] disabled:pointer-events-none disabled:opacity-30 leading-none cursor-pointer"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            type="button"
          >
            Siguiente
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {totalPages > 2 && (
            <button
              aria-label="Última página"
              className="inline-flex items-center justify-center rounded-lg border border-[#c6d7d0] bg-white p-1.5 text-xs text-[#274b42] shadow-2xs transition hover:bg-[#f4f7f6] disabled:pointer-events-none disabled:opacity-30 leading-none cursor-pointer"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage(totalPages)}
              title="Última página"
              type="button"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
