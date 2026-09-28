import { ReactNode } from "react";
import type { ApiRow } from "../lib/api";
import { StatusBadge } from "./StatusBadge";

export type Column = {
  key: string;
  label: string;
  format?: "usd" | "pen" | "date" | "status" | "number" | "badge" | "custom";
  align?: "left" | "center" | "right";
  render?: (row: ApiRow, value: unknown) => ReactNode;
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

export function OperationsTable({
  columns,
  items,
  onRowClick,
  emptyMessage = "No hay registros para esta vista.",
}: {
  columns: Column[];
  items: ApiRow[];
  onRowClick?: (item: ApiRow) => void;
  emptyMessage?: string;
}) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-[#6e857f]">
        <svg
          className="h-10 w-10 text-[#a3b8b1]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
          />
        </svg>
        <p className="mt-3 text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#dce5e1] bg-white shadow-xs">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b border-[#dce5e1] bg-[#f4f8f6] text-xs font-semibold uppercase tracking-wider text-[#49655f]">
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
              return (
                <th
                  className={`px-4 py-3.5 whitespace-nowrap ${alignClass}`}
                  key={column.key}
                >
                  {column.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2ef]">
          {items.map((item, index) => (
            <tr
              className={`transition-colors ${
                onRowClick
                  ? "cursor-pointer hover:bg-[#f6faf8]"
                  : "hover:bg-[#fafcfb]"
              }`}
              key={String(item.id ?? index)}
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
                    className={`px-4 py-3 align-middle text-[#1a332d] ${alignClass}`}
                    key={column.key}
                  >
                    {column.render
                      ? column.render(item, item[column.key])
                      : cellContent(item[column.key], column.format)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
