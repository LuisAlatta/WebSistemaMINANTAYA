import { ReactNode } from "react";
import type { ApiRow } from "../lib/api";
import { StatusBadge } from "./StatusBadge";
import { formatUsd, formatPen, formatDate } from "./OperationsTable";

type OperationDetailModalProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
};

export function OperationDetailModal({
  title,
  subtitle,
  onClose,
  children,
}: OperationDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-[#d2ded9] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e5ece9] px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-[#10242b]">{title}</h3>
            {subtitle && <p className="text-xs text-[#59756f] mt-0.5">{subtitle}</p>}
          </div>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#59756f] transition hover:bg-[#edf3f0] hover:text-[#10242b]"
            onClick={onClose}
            type="button"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">{children}</div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[#e5ece9] px-6 py-3 bg-[#fafcfb] rounded-b-2xl">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#c6d7d0] bg-white px-4 py-2 text-sm font-semibold text-[#274b42] shadow-xs transition hover:bg-[#f4f7f6]"
            onClick={onClose}
            type="button"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export function GuideDetailView({
  guide,
  lots,
  events,
  alerts,
  invoices,
  settlements,
}: {
  guide: ApiRow;
  lots: ApiRow[];
  events: ApiRow[];
  alerts: ApiRow[];
  invoices?: ApiRow[];
  settlements?: ApiRow[];
}) {
  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[#dce5e1] bg-[#f9fbfa] p-3">
          <p className="text-xs text-[#59756f]">Guía GRE</p>
          <p className="mt-1 font-mono text-base font-bold text-[#10242b]">
            {String(guide.gre ?? "—")}
          </p>
        </div>
        <div className="rounded-xl border border-[#dce5e1] bg-[#f9fbfa] p-3">
          <p className="text-xs text-[#59756f]">Planta Destino</p>
          <p className="mt-1 text-sm font-semibold text-[#10242b]">
            {String(guide.plant ?? "—")}
          </p>
        </div>
        <div className="rounded-xl border border-[#dce5e1] bg-[#f9fbfa] p-3">
          <p className="text-xs text-[#59756f]">Transporte</p>
          <p className="mt-1 text-sm font-semibold text-[#10242b]">
            {String(guide.carrier ?? guide.transportReference ?? "—")}
          </p>
        </div>
        <div className="rounded-xl border border-[#dce5e1] bg-[#f9fbfa] p-3">
          <p className="text-xs text-[#59756f]">Estado</p>
          <div className="mt-1">
            <StatusBadge status={guide.status} />
          </div>
        </div>
      </div>

      {/* Lots Table */}
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wider text-[#3d5953] mb-2">
          Lotes transportados ({lots.length})
        </h4>
        <div className="overflow-x-auto rounded-lg border border-[#dce5e1]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#dce5e1] bg-[#f4f8f6] font-semibold text-[#49655f]">
              <tr>
                <th className="px-3 py-2">Seq</th>
                <th className="px-3 py-2">Código Lote</th>
                <th className="px-3 py-2">Proveedor(es)</th>
                <th className="px-3 py-2 text-right">Sacos</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2">Retiro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2ef]">
              {lots.map((lot, idx) => (
                <tr className="hover:bg-[#fafcfb]" key={String(lot.id ?? idx)}>
                  <td className="px-3 py-2 font-mono text-[#6e847f]">
                    {String(lot.sequence ?? idx + 1)}
                  </td>
                  <td className="px-3 py-2 font-mono font-bold text-[#10242b]">
                    {String(lot.code)}
                  </td>
                  <td className="px-3 py-2 text-[#35524b]">
                    {String(lot.suppliers ?? "—")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {lot.sackCount !== null && lot.sackCount !== undefined
                      ? String(lot.sackCount)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={lot.status} />
                  </td>
                  <td className="px-3 py-2 text-[#6e847f]">
                    {lot.withdrawalRequested ? (
                      <span className="text-rose-700 font-medium">
                        Solicitado ({String(lot.withdrawalReason ?? "Sin detalle")})
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Commercial Invoices linked */}
      {invoices && invoices.length > 0 && (
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-[#3d5953] mb-2">
            Facturas Comerciales Vinculadas
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {invoices.map((inv) => (
              <div
                className="flex items-center justify-between rounded-lg border border-[#dce5e1] bg-[#fbfdfc] p-3 text-xs"
                key={String(inv.id)}
              >
                <div>
                  <span className="font-mono font-bold text-[#10242b]">
                    {String(inv.invoiceNumber)}
                  </span>
                  <span className="ml-2 text-[#6e847f]">
                    {formatDate(inv.issuedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-[#1d4c44]">
                    {formatUsd(inv.amountUsdCents)}
                  </span>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settlements */}
      {settlements && settlements.length > 0 && (
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-[#3d5953] mb-2">
            Liquidaciones a Proveedor
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {settlements.map((st) => (
              <div
                className="rounded-lg border border-[#dce5e1] bg-[#fbfdfc] p-3 text-xs"
                key={String(st.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[#6e847f]">{formatDate(st.settledAt)}</span>
                  <StatusBadge status={st.status} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 font-mono">
                  <div>
                    <span className="block text-[10px] uppercase text-[#6e847f]">
                      Bruto
                    </span>
                    <strong className="text-[#10242b]">
                      {formatUsd(st.grossUsdCents)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-[#6e847f]">
                      Flete
                    </span>
                    <strong className="text-rose-700">
                      -{formatUsd(st.deductionsUsdCents)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-[#6e847f]">
                      Neto
                    </span>
                    <strong className="text-emerald-700">
                      {formatUsd(st.netUsdCents)}
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History and Events */}
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wider text-[#3d5953] mb-2">
          Historial de Movimientos
        </h4>
        <div className="space-y-2">
          {events.map((ev) => (
            <div
              className="flex items-start justify-between rounded-lg border border-[#e5ede9] bg-white p-2.5 text-xs"
              key={String(ev.id)}
            >
              <div>
                <span className="font-semibold text-[#183a32]">
                  {String(ev.eventType)}
                </span>
                <span className="ml-2 text-[#6e847f]">
                  {formatDate(ev.occurredAt)}
                </span>
                {Boolean(ev.detailJson) && (
                  <p className="mt-0.5 text-[#59756f]">{String(ev.detailJson)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
