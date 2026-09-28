import { FormEvent, useEffect, useState } from "react";

import { getJson, sendJson, type ApiRow } from "../lib/api";

type GuideOption = {
  id: string;
  gre: string;
  status?: string;
  lotCount?: number;
  plant?: string;
  carrier?: string;
};
type Counterparty = { id: string; legalName: string; type: string };
type Action =
  | "status"
  | "withdrawal"
  | "suppliers"
  | "laws"
  | "lawsProgress"
  | "supplierLawsApproval"
  | "resample"
  | "resampleProgress"
  | "dispute"
  | "disputeProgress"
  | "proposal"
  | "proposalApprove"
  | "proposalReject"
  | "settlement"
  | "discount"
  | "commercialInvoice"
  | "transportInvoice"
  | "payment"
  | "cancelInvoice"
  | "exchangeRate"
  | "counterparty";

const labels: Record<Action, string> = {
  status: "Estado o baja de guía",
  withdrawal: "Retiro de lote",
  suppliers: "Proveedores de lote",
  laws: "Reporte de leyes",
  lawsProgress: "Enviar / aprobar reporte de leyes",
  supplierLawsApproval: "Conformidad del proveedor",
  resample: "Remuestreo",
  resampleProgress: "Avanzar remuestreo",
  dispute: "Dirimencia",
  disputeProgress: "Avanzar dirimencia",
  proposal: "Propuesta de compra",
  proposalApprove: "Aprobar propuesta",
  proposalReject: "Rechazar propuesta",
  settlement: "Liquidación",
  discount: "Descuento",
  commercialInvoice: "Factura comercial",
  transportInvoice: "Factura de transporte",
  payment: "Pago",
  cancelInvoice: "Anular factura",
  exchangeRate: "Tipo de cambio",
  counterparty: "Proveedor / transportista",
};

function toCents(value: FormDataEntryValue | null) {
  return Math.round(Number(String(value ?? "0")) * 100);
}

function isoDate(value: FormDataEntryValue | null) {
  return new Date(`${String(value)}T12:00:00.000Z`).toISOString();
}

function LotSelectorCards({
  lots,
  selectedLotIds,
  onToggleLot,
  onSelectAll,
  onClear,
  loadingLots,
  selectedGuide,
  newLotCodesInput,
  setNewLotCodesInput,
  creatingLots,
  onAssignLots,
  label = "Lotes (máximo 4)",
  subtitle = "Selecciona con un clic los lotes que corresponden a este movimiento",
}: {
  lots: ApiRow[];
  selectedLotIds: string[];
  onToggleLot: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  loadingLots: boolean;
  selectedGuide?: GuideOption;
  newLotCodesInput: string;
  setNewLotCodesInput: (val: string) => void;
  creatingLots: boolean;
  onAssignLots: () => void;
  label?: string;
  subtitle?: string;
}) {
  return (
    <div className="sm:col-span-2 space-y-2.5 rounded-xl border border-[#d6e3de] bg-[#f9fcfa] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-[#2e6b61]">
            {label}
          </label>
          <p className="text-[11px] text-[#59756f] mt-0.5">{subtitle}</p>
        </div>
        {lots.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                selectedLotIds.length > 0
                  ? "bg-[#e6f0c9] text-[#17333a]"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {selectedLotIds.length} de 4 seleccionados
            </span>
            {selectedLotIds.length < Math.min(lots.length, 4) && (
              <button
                className="text-[11px] font-semibold text-[#2e6b61] hover:underline"
                onClick={onSelectAll}
                type="button"
              >
                Seleccionar todos
              </button>
            )}
            {selectedLotIds.length > 0 && (
              <button
                className="text-[11px] font-semibold text-rose-600 hover:underline"
                onClick={onClear}
                type="button"
              >
                Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {loadingLots ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-[#e5eee9] bg-white p-6 text-xs text-[#59756f]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2e6b61] border-t-transparent" />
          <span>Consultando lotes de la guía…</span>
        </div>
      ) : lots.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {lots.map((lot) => {
            const lotId = String(lot.lotId || lot.id);
            const isSelected = selectedLotIds.includes(lotId);
            const isAlreadyInvoiced = Boolean(
              lot.alreadyInvoiced ||
                String(lot.status ?? "").toUpperCase() === "FACTURADO" ||
                String(lot.status ?? "").toUpperCase() === "RETIRADO",
            );

            return (
              <div
                className={`flex items-start gap-3 rounded-lg border p-3 transition select-none cursor-pointer ${
                  isSelected
                    ? "border-[#2e6b61] bg-[#f0f8f5] shadow-xs ring-1 ring-[#2e6b61]"
                    : isAlreadyInvoiced
                    ? "border-[#e2e8e5] bg-[#f5f7f6] opacity-60 cursor-not-allowed"
                    : "border-[#dce5e1] bg-white hover:border-[#a3c4ba] hover:bg-[#fafcfb]"
                }`}
                key={lotId}
                onClick={() => {
                  if (isAlreadyInvoiced) return;
                  onToggleLot(lotId);
                }}
              >
                <input
                  checked={isSelected}
                  className="mt-0.5 h-4 w-4 rounded border-[#b9cbc4] text-[#2e6b61] focus:ring-[#2e6b61]"
                  disabled={isAlreadyInvoiced}
                  onChange={() => {
                    if (isAlreadyInvoiced) return;
                    onToggleLot(lotId);
                  }}
                  type="checkbox"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#10242b] truncate">
                      {String(lot.code)}
                    </span>
                    {Boolean(lot.status) && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          String(lot.status) === "ACTIVO"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {String(lot.status)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#59756f]">
                    {lot.sackCount ? <span>📦 {String(lot.sackCount)} sacos</span> : null}
                    {lot.suppliers ? (
                      <span className="truncate">👤 {String(lot.suppliers)}</span>
                    ) : null}
                    {isAlreadyInvoiced && (
                      <span className="font-semibold text-amber-700">⚠️ Ya facturado/retirado</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty state when the selected guide has no lots */
        <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-xs">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-amber-600 mt-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <div className="flex-1">
              <p className="font-bold text-amber-900">
                La guía {selectedGuide?.gre ?? "seleccionada"} no tiene lotes registrados en el sistema
              </p>
              <p className="mt-1 text-[11px] text-amber-800 leading-relaxed">
                Ingresa a continuación los códigos de lote de esta guía (máximo 4) separados por coma para crearlos y asociarlos de inmediato a este movimiento:
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className="flex-1 min-w-[200px] rounded-lg border border-[#b9cbc4] bg-white px-3 py-1.5 text-xs text-[#10242b] outline-none transition focus:border-[#2e6b61] focus:ring-1 focus:ring-[#2e6b61]"
                  onChange={(e) => setNewLotCodesInput(e.target.value)}
                  placeholder="Ej: PPO 68300, PPO 68301"
                  type="text"
                  value={newLotCodesInput}
                />
                <button
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2e6b61] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#25574f] disabled:opacity-50 leading-none shrink-0"
                  disabled={creatingLots || !newLotCodesInput.trim()}
                  onClick={onAssignLots}
                  type="button"
                >
                  {creatingLots ? "Asignando…" : "+ Asignar a Guía"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden inputs to feed standard form submit */}
      {selectedLotIds.map((id) => (
        <input key={id} name="lotId" type="hidden" value={id} />
      ))}
    </div>
  );
}

export function OperationActionForm({
  guides,
  counterparties,
  onSaved,
}: {
  guides: GuideOption[];
  counterparties: Counterparty[];
  onSaved: () => void;
}) {
  const [action, setAction] = useState<Action>("status");
  const [guideId, setGuideId] = useState("");
  const [lots, setLots] = useState<ApiRow[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([]);
  const [newLotCodesInput, setNewLotCodesInput] = useState("");
  const [creatingLots, setCreatingLots] = useState(false);
  const [selectedTransportGuideIds, setSelectedTransportGuideIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<
    "COMERCIAL" | "TRANSPORTE"
  >("COMERCIAL");
  const [invoices, setInvoices] = useState<ApiRow[]>([]);

  const selectedGuide = guides.find((g) => g.id === guideId);

  useEffect(() => {
    setSelectedLotIds([]);
    setNewLotCodesInput("");
    if (!guideId) {
      setLots([]);
      setLoadingLots(false);
      return;
    }
    setLoadingLots(true);
    void getJson<{ lots: ApiRow[] }>(`/api/operations/guides/${guideId}`)
      .then((detail) => {
        setLots(detail.lots);
        const available = detail.lots
          .filter(
            (l) =>
              !l.alreadyInvoiced &&
              String(l.status ?? "").toUpperCase() !== "FACTURADO" &&
              String(l.status ?? "").toUpperCase() !== "RETIRADO",
          )
          .map((l) => String(l.lotId || l.id))
          .slice(0, 4);
        setSelectedLotIds(available);
      })
      .catch(() => setLots([]))
      .finally(() => setLoadingLots(false));
  }, [guideId]);

  const toggleLot = (lotId: string) => {
    setSelectedLotIds((prev) => {
      if (prev.includes(lotId)) {
        return prev.filter((id) => id !== lotId);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, lotId];
    });
  };

  const selectAllAvailableLots = () => {
    const available = lots
      .filter(
        (l) =>
          !l.alreadyInvoiced &&
          String(l.status ?? "").toUpperCase() !== "FACTURADO" &&
          String(l.status ?? "").toUpperCase() !== "RETIRADO",
      )
      .map((l) => String(l.lotId || l.id))
      .slice(0, 4);
    setSelectedLotIds(available);
  };

  const handleCreateAndAssignLots = async () => {
    if (!guideId || !newLotCodesInput.trim()) return;
    setCreatingLots(true);
    setMessage(null);
    try {
      const codes = newLotCodesInput
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (codes.length === 0) return;

      const res = await sendJson<{ lots: Array<{ lotId: string; code: string }> }>(
        `/api/guides/${guideId}/lots`,
        "POST",
        { codes },
      );

      const detail = await getJson<{ lots: ApiRow[] }>(`/api/operations/guides/${guideId}`);
      setLots(detail.lots);
      const newIds = res.lots.map((l) => l.lotId).slice(0, 4);
      setSelectedLotIds(newIds);
      setNewLotCodesInput("");
      setMessage(`Se asignaron ${res.lots.length} lotes correctamente a la guía.`);
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : "No se pudieron crear los lotes.");
    } finally {
      setCreatingLots(false);
    }
  };

  useEffect(() => {
    if (action !== "payment") return;
    const path =
      paymentTarget === "COMERCIAL"
        ? "/api/operations/commercial-invoices?limit=200"
        : "/api/operations/transport-invoices?limit=200";
    void getJson<{ items: ApiRow[] }>(path)
      .then((result) => setInvoices(result.items))
      .catch(() => setInvoices([]));
  }, [action, paymentTarget]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      if (action === "status")
        await sendJson(`/api/guides/${guideId}/status`, "PATCH", {
          status: form.get("status"),
          reason: String(form.get("reason") ?? "") || undefined,
        });
      if (action === "withdrawal")
        await sendJson(
          `/api/guides/${guideId}/lots/${form.get("guideLotId")}/withdrawal`,
          String(form.get("operation")) === "confirm" ? "PATCH" : "POST",
          { reason: form.get("reason") },
        );
      if (action === "suppliers")
        await sendJson(
          `/api/guides/${guideId}/lots/${form.get("guideLotId")}/suppliers`,
          "PUT",
          form.getAll("supplierId").map((supplierId) => ({ supplierId })),
        );
      if (action === "laws") {
        const selectedLots = form.getAll("lotId").map(String);
        await sendJson(`/api/guides/${guideId}/assay-reports`, "POST", {
          reportNumber: String(form.get("reportNumber") ?? "") || undefined,
          laboratoryId: String(form.get("laboratoryId") ?? "") || undefined,
          source: form.get("source"),
          results: selectedLots.map((lotId) => ({
            lotId,
            element: form.get("element"),
            resultValue: Number(form.get("resultValue")),
            unit: form.get("unit"),
          })),
        });
      }
      if (action === "lawsProgress")
        await sendJson(
          `/api/guides/${guideId}/assay-reports/${form.get("reportId")}`,
          "PATCH",
          { status: form.get("status") },
        );
      if (action === "supplierLawsApproval")
        await sendJson(
          `/api/guides/${guideId}/assay-reports/${form.get("reportId")}/supplier-approvals`,
          "POST",
          { supplierId: form.get("supplierId"), status: form.get("status") },
        );
      if (action === "resample")
        await sendJson(`/api/guides/${guideId}/resamples`, "POST", {
          reason: form.get("reason"),
        });
      if (action === "resampleProgress")
        await sendJson(
          `/api/guides/${guideId}/resamples/${form.get("caseId")}`,
          "PATCH",
          { status: form.get("status") },
        );
      if (action === "dispute")
        await sendJson(`/api/guides/${guideId}/disputes`, "POST", {
          reason: form.get("reason"),
        });
      if (action === "disputeProgress")
        await sendJson(
          `/api/guides/${guideId}/disputes/${form.get("caseId")}`,
          "PATCH",
          {
            stage: form.get("stage"),
            resolution: String(form.get("resolution") ?? "") || undefined,
          },
        );
      if (action === "proposal")
        await sendJson(`/api/guides/${guideId}/purchase-proposals`, "POST", {
          proposalNumber: String(form.get("proposalNumber") ?? "") || undefined,
          issuedAt: isoDate(form.get("issuedAt")),
          amountUsdCents: toCents(form.get("amountUsd")),
          notes: String(form.get("notes") ?? "") || undefined,
        });
      if (action === "proposalApprove")
        await sendJson(
          `/api/purchase-proposals/${form.get("proposalId")}/approve`,
          "POST",
          {},
        );
      if (action === "proposalReject")
        await sendJson(
          `/api/purchase-proposals/${form.get("proposalId")}/reject`,
          "POST",
          { reason: form.get("reason") },
        );
      if (action === "settlement")
        await sendJson(`/api/guides/${guideId}/settlements`, "POST", {
          purchaseProposalId:
            String(form.get("purchaseProposalId") ?? "") || undefined,
          grossUsdCents: toCents(form.get("grossUsd")),
          deductionsUsdCents: toCents(form.get("deductionsUsd")),
          netUsdCents: toCents(form.get("netUsd")),
          lines: [
            {
              lineType: form.get("lineType"),
              description: form.get("lineDescription"),
              amountUsdCents: toCents(form.get("lineAmountUsd")),
            },
          ],
        });
      if (action === "discount")
        await sendJson(`/api/guides/${guideId}/discounts`, "POST", {
          lotId: String(form.get("lotId") ?? "") || undefined,
          discountType: form.get("discountType"),
          amountUsdCents: toCents(form.get("amountUsd")),
          reason: form.get("reason"),
        });
      if (action === "commercialInvoice") {
        let lotIdsToUse = [...selectedLotIds];
        if (lotIdsToUse.length === 0 && newLotCodesInput.trim() && guideId) {
          const codes = newLotCodesInput
            .split(/[\n,;]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (codes.length > 0) {
            const res = await sendJson<{ lots: Array<{ lotId: string; code: string }> }>(
              `/api/guides/${guideId}/lots`,
              "POST",
              { codes },
            );
            lotIdsToUse = res.lots.map((l) => l.lotId).slice(0, 4);
          }
        }
        if (lotIdsToUse.length === 0) {
          throw new Error("Debes seleccionar al menos un lote o ingresar sus códigos en la casilla de lotes.");
        }

        await sendJson("/api/commercial-invoices", "POST", {
          invoiceNumber: form.get("invoiceNumber"),
          issuedAt: isoDate(form.get("issuedAt")),
          amountUsdCents: toCents(form.get("amountUsd")),
          detractionPercent: Number(form.get("detractionPercent")) / 100,
          detractionPenCents: toCents(form.get("detractionPen")),
          lotIds: lotIdsToUse,
        });
      }
      if (action === "transportInvoice") {
        const guideIdsToUse =
          selectedTransportGuideIds.length > 0
            ? selectedTransportGuideIds
            : form.getAll("transportGuideId").map(String);
        if (guideIdsToUse.length === 0) {
          throw new Error("Debes seleccionar al menos una guía cubierta para la factura de transporte.");
        }
        await sendJson("/api/transport-invoices", "POST", {
          carrierId: form.get("carrierId"),
          invoiceNumber: form.get("invoiceNumber"),
          issuedAt: isoDate(form.get("issuedAt")),
          amountUsdCents: toCents(form.get("amountUsd")),
          detractionPenCents: toCents(form.get("detractionPen")),
          guideIds: guideIdsToUse,
        });
      }
      if (action === "payment")
        await sendJson("/api/payments", "POST", {
          paymentType: paymentTarget,
          commercialInvoiceId:
            paymentTarget === "COMERCIAL" ? form.get("invoiceId") : undefined,
          transportInvoiceId:
            paymentTarget === "TRANSPORTE" ? form.get("invoiceId") : undefined,
          paidAt: isoDate(form.get("paidAt")),
          currency: form.get("currency"),
          amountCents: toCents(form.get("amount")),
          reference: String(form.get("reference") ?? "") || undefined,
        });
      if (action === "cancelInvoice")
        await sendJson(
          `/api/${form.get("invoiceKind")}/${form.get("invoiceId")}/cancel`,
          "POST",
          { reason: form.get("reason") },
        );
      if (action === "exchangeRate")
        await sendJson("/api/exchange-rates", "POST", {
          rateDate: form.get("rateDate"),
          usdToPen: Number(form.get("usdToPen")),
        });
      if (action === "counterparty")
        await sendJson("/api/counterparties", "POST", {
          type: form.get("type"),
          legalName: form.get("legalName"),
          documentNumber: String(form.get("documentNumber") ?? "") || undefined,
          contactName: String(form.get("contactName") ?? "") || undefined,
          contactPhone: String(form.get("contactPhone") ?? "") || undefined,
        });
      setMessage("Movimiento guardado y auditado.");
      onSaved();
      event.currentTarget.reset();
      setGuideId("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el movimiento.",
      );
    } finally {
      setBusy(false);
    }
  }

  const needsGuide = [
    "status",
    "withdrawal",
    "suppliers",
    "laws",
    "lawsProgress",
    "supplierLawsApproval",
    "resample",
    "resampleProgress",
    "dispute",
    "disputeProgress",
    "proposal",
    "settlement",
    "discount",
    "commercialInvoice",
  ].includes(action);
  return (
    <section className="mt-7 border border-[#d9e2df] bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-[#54716f]">
            REGISTRO OPERATIVO
          </p>
          <h3 className="mt-1 text-lg font-semibold">Agregar movimiento</h3>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          Operación
          <select
            className="rounded border border-[#b9cbc4] px-3 py-2"
            value={action}
            onChange={(event) => {
              setAction(event.target.value as Action);
              setMessage(null);
            }}
          >
            <>
              {(Object.keys(labels) as Action[]).map((key) => (
                <option key={key} value={key}>
                  {labels[key]}
                </option>
              ))}
            </>
          </select>
        </label>
      </div>
      {message && (
        <p className="mt-4 rounded bg-[#edf7ed] p-3 text-sm text-[#295b2c]">
          {message}
        </p>
      )}
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        {needsGuide && (
          <div className="grid gap-2 sm:col-span-2">
            <label className="grid gap-1 text-sm font-medium">
              Guía
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2 text-xs sm:text-sm"
                onChange={(event) => setGuideId(event.target.value)}
                required
                value={guideId}
              >
                <option value="">Selecciona una guía</option>
                {guides.map((guide) => {
                  const statusTag = guide.status ? `[${guide.status}]` : "";
                  const lotsTag =
                    guide.lotCount !== undefined
                      ? `(${guide.lotCount} ${guide.lotCount === 1 ? "lote" : "lotes"})`
                      : "";
                  const plantTag = guide.plant ? `· ${guide.plant}` : "";
                  return (
                    <option key={guide.id} value={guide.id}>
                      {guide.gre} {statusTag} {lotsTag} {plantTag}
                    </option>
                  );
                })}
              </select>
            </label>

            {selectedGuide && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#cbe0d8] bg-[#f2f8f5] px-3 py-2 text-xs text-[#183a32]">
                <span className="font-semibold">Guía: {selectedGuide.gre}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    selectedGuide.status === "LIQUIDADA"
                      ? "bg-emerald-100 text-emerald-800"
                      : selectedGuide.status === "FACTURADA"
                      ? "bg-blue-100 text-blue-800"
                      : selectedGuide.status === "EMITIDA"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {selectedGuide.status ?? "EMITIDA"}
                </span>
                {selectedGuide.plant && (
                  <span className="text-[#59756f]">
                    Planta: <strong className="text-[#10242b]">{selectedGuide.plant}</strong>
                  </span>
                )}
                <span className="text-[#59756f]">
                  Lotes registrados: <strong className="text-[#10242b]">{lots.length}</strong>
                </span>
              </div>
            )}
          </div>
        )}
        {action === "status" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Nuevo estado
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="status"
                required
              >
                {[
                  "EN_PLANTA",
                  "LEYES_PENDIENTES",
                  "LEYES_RECIBIDAS",
                  "PROPUESTA_PENDIENTE",
                  "CONFORME",
                  "LIQUIDADA",
                  "ANULADA",
                ].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Motivo (obligatorio para baja)
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="reason"
              />
            </label>
          </>
        )}
        {["withdrawal", "suppliers"].includes(action) && (
          <label className="grid gap-1 text-sm font-medium">
            Lote
            <select
              className="rounded border border-[#b9cbc4] px-3 py-2"
              name="guideLotId"
              required
            >
              {lots.map((lot) => (
                <option key={String(lot.id)} value={String(lot.id)}>
                  {String(lot.code)}
                </option>
              ))}
            </select>
          </label>
        )}
        {action === "withdrawal" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Movimiento
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="operation"
              >
                <option value="request">Solicitar retiro</option>
                <option value="confirm">Confirmar retiro</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
              Motivo
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="reason"
                required
              />
            </label>
          </>
        )}
        {action === "suppliers" && (
          <label className="grid gap-1 text-sm font-medium sm:col-span-2">
            Proveedores asignados
            <select
              className="min-h-24 rounded border border-[#b9cbc4] px-3 py-2"
              multiple
              name="supplierId"
              required
            >
              {counterparties
                .filter((item) => item.type === "PROVEEDOR")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.legalName}
                  </option>
                ))}
            </select>
          </label>
        )}
        {action === "laws" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Nro. reporte
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="reportNumber"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Origen
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="source"
              >
                <option>PLANTA</option>
                <option>EXTERNO</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Laboratorio (opcional)
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="laboratoryId"
              >
                <option value="">Sin asignar</option>
                {counterparties
                  .filter((item) => item.type === "LABORATORIO")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.legalName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Elemento
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="element"
                placeholder="Au"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Resultado y unidad
              <div className="flex gap-2">
                <input
                  className="w-full rounded border border-[#b9cbc4] px-3 py-2"
                  name="resultValue"
                  required
                  step="any"
                  type="number"
                />
                <input
                  className="w-24 rounded border border-[#b9cbc4] px-3 py-2"
                  defaultValue="g/t"
                  name="unit"
                  required
                />
              </div>
            </label>
            <LotSelectorCards
              creatingLots={creatingLots}
              label="Lotes del reporte (máximo 4)"
              loadingLots={loadingLots}
              lots={lots}
              newLotCodesInput={newLotCodesInput}
              onAssignLots={handleCreateAndAssignLots}
              onClear={() => setSelectedLotIds([])}
              onSelectAll={selectAllAvailableLots}
              onToggleLot={toggleLot}
              selectedGuide={selectedGuide}
              selectedLotIds={selectedLotIds}
              setNewLotCodesInput={setNewLotCodesInput}
              subtitle="Selecciona con un clic los lotes a los que aplica este reporte de leyes"
            />
          </>
        )}
        {action === "lawsProgress" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              ID de reporte
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="reportId"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Etapa
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="status"
              >
                <option>ENVIADO_PROVEEDOR</option>
                <option>APROBADO</option>
                <option>OBSERVADO</option>
              </select>
            </label>
          </>
        )}
        {action === "supplierLawsApproval" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              ID de reporte
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="reportId"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Proveedor
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="supplierId"
                required
              >
                <option value="">Seleccionar</option>
                {counterparties
                  .filter((item) => item.type === "PROVEEDOR")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.legalName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Respuesta
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="status"
              >
                <option>APROBADO</option>
                <option>OBSERVADO</option>
              </select>
            </label>
          </>
        )}
        {["resample", "dispute", "proposalReject", "cancelInvoice"].includes(
          action,
        ) && (
          <label className="grid gap-1 text-sm font-medium sm:col-span-2">
            Motivo
            <textarea
              className="min-h-20 rounded border border-[#b9cbc4] px-3 py-2"
              name="reason"
              required
            />
          </label>
        )}
        {action === "resampleProgress" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              ID de remuestreo
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="caseId"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Nueva etapa
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="status"
              >
                <option>COORDINADO</option>
                <option>ENVIADO_LABORATORIO</option>
                <option>RESULTADO_RECIBIDO</option>
                <option>CERRADO</option>
              </select>
            </label>
          </>
        )}
        {action === "disputeProgress" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              ID de dirimencia
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="caseId"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Nueva etapa
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="stage"
              >
                <option>MUESTRAS_ENVIADAS</option>
                <option>ANALISIS_LIMA</option>
                <option>RESULTADO_RECIBIDO</option>
                <option>CERRADA</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
              Resolución (obligatoria al cerrar)
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="resolution"
              />
            </label>
          </>
        )}
        {action === "proposal" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Nro. propuesta
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="proposalNumber"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Fecha
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                defaultValue={new Date().toISOString().slice(0, 10)}
                name="issuedAt"
                required
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Monto USD
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                min="0"
                name="amountUsd"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Notas
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="notes"
              />
            </label>
          </>
        )}
        {["proposalApprove", "proposalReject"].includes(action) && (
          <label className="grid gap-1 text-sm font-medium">
            ID de propuesta
            <input
              className="rounded border border-[#b9cbc4] px-3 py-2"
              name="proposalId"
              required
            />
          </label>
        )}
        {action === "settlement" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              ID propuesta aprobada (opcional)
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="purchaseProposalId"
              />
            </label>
            <span />
            <label className="grid gap-1 text-sm font-medium">
              Bruto USD
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                min="0"
                name="grossUsd"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Descuentos USD
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                min="0"
                defaultValue="0"
                name="deductionsUsd"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Neto USD
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                min="0"
                name="netUsd"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Línea
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="lineType"
              >
                <option>METAL</option>
                <option>DESCUENTO</option>
                <option>PENALIDAD</option>
                <option>AJUSTE</option>
                <option>OTRO</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Detalle línea
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="lineDescription"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Monto línea USD
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="lineAmountUsd"
                required
                step="0.01"
                type="number"
              />
            </label>
          </>
        )}
        {action === "discount" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Lote (opcional)
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="lotId"
              >
                <option value="">Descuento a guía</option>
                {lots.map((lot) => (
                  <option key={String(lot.lotId)} value={String(lot.lotId)}>
                    {String(lot.code)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Tipo
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="discountType"
              >
                {[
                  "TRANSPORTE",
                  "MAQUILA",
                  "HUMEDAD",
                  "IMPUREZA",
                  "PENALIDAD",
                  "OTRO",
                ].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Monto USD
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                min="0"
                name="amountUsd"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Motivo
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="reason"
                required
              />
            </label>
          </>
        )}
        {action === "commercialInvoice" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Factura
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="invoiceNumber"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Fecha
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                defaultValue={new Date().toISOString().slice(0, 10)}
                name="issuedAt"
                required
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Monto USD
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                min="0"
                name="amountUsd"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Detracción %
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                defaultValue="10"
                min="0"
                max="100"
                name="detractionPercent"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Detracción PEN
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                defaultValue="0"
                min="0"
                name="detractionPen"
                required
                step="0.01"
                type="number"
              />
            </label>
            <LotSelectorCards
              creatingLots={creatingLots}
              label="Lotes a facturar (máximo 4)"
              loadingLots={loadingLots}
              lots={lots}
              newLotCodesInput={newLotCodesInput}
              onAssignLots={handleCreateAndAssignLots}
              onClear={() => setSelectedLotIds([])}
              onSelectAll={selectAllAvailableLots}
              onToggleLot={toggleLot}
              selectedGuide={selectedGuide}
              selectedLotIds={selectedLotIds}
              setNewLotCodesInput={setNewLotCodesInput}
              subtitle="Selecciona con un clic los lotes que cubre esta factura comercial"
            />
          </>
        )}
        {action === "transportInvoice" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Transportista
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="carrierId"
                required
              >
                <option value="">Seleccionar</option>
                {counterparties
                  .filter((item) => item.type === "TRANSPORTISTA")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.legalName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Factura
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="invoiceNumber"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Fecha
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                defaultValue={new Date().toISOString().slice(0, 10)}
                name="issuedAt"
                required
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Monto USD
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                min="0"
                name="amountUsd"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Detracción PEN
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                defaultValue="0"
                min="0"
                name="detractionPen"
                required
                step="0.01"
                type="number"
              />
            </label>
            <div className="sm:col-span-2 space-y-2 rounded-xl border border-[#d6e3de] bg-[#f9fcfa] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#2e6b61]">
                    Guías cubiertas
                  </label>
                  <p className="text-[11px] text-[#59756f] mt-0.5">
                    Selecciona con un clic las guías amparadas por esta factura de transporte
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      selectedTransportGuideIds.length > 0
                        ? "bg-[#e6f0c9] text-[#17333a]"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {selectedTransportGuideIds.length} seleccionadas
                  </span>
                  {selectedTransportGuideIds.length > 0 && (
                    <button
                      className="text-[11px] font-semibold text-rose-600 hover:underline"
                      onClick={() => setSelectedTransportGuideIds([])}
                      type="button"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-lg border border-[#c6d7d0] bg-white divide-y divide-[#edf2ef]">
                {guides.map((guide) => {
                  const isSelected = selectedTransportGuideIds.includes(guide.id);
                  return (
                    <label
                      className={`flex items-center gap-2.5 p-2.5 text-xs transition cursor-pointer select-none ${
                        isSelected
                          ? "bg-[#f0f8f5] text-[#183a32] font-semibold"
                          : "hover:bg-[#fafcfb] text-[#10242b]"
                      }`}
                      key={guide.id}
                    >
                      <input
                        checked={isSelected}
                        className="h-4 w-4 rounded border-[#b9cbc4] text-[#2e6b61] focus:ring-[#2e6b61]"
                        onChange={() => {
                          setSelectedTransportGuideIds((prev) =>
                            prev.includes(guide.id)
                              ? prev.filter((id) => id !== guide.id)
                              : [...prev, guide.id],
                          );
                        }}
                        type="checkbox"
                      />
                      <span className="font-mono font-medium">{guide.gre}</span>
                      {guide.plant && (
                        <span className="text-[10px] text-[#59756f]">({guide.plant})</span>
                      )}
                      {guide.status && (
                        <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase text-slate-600">
                          {guide.status}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {selectedTransportGuideIds.map((id) => (
                <input key={id} name="transportGuideId" type="hidden" value={id} />
              ))}
            </div>
          </>
        )}
        {action === "payment" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Tipo
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                value={paymentTarget}
                onChange={(event) =>
                  setPaymentTarget(
                    event.target.value as "COMERCIAL" | "TRANSPORTE",
                  )
                }
              >
                <option value="COMERCIAL">Comercial</option>
                <option value="TRANSPORTE">Transporte</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Factura
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="invoiceId"
                required
              >
                <option value="">Seleccionar</option>
                {invoices
                  .filter((invoice) => invoice.status !== "ANULADA")
                  .map((invoice) => (
                    <option key={String(invoice.id)} value={String(invoice.id)}>
                      {String(invoice.invoiceNumber)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Fecha de pago
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                defaultValue={new Date().toISOString().slice(0, 10)}
                name="paidAt"
                required
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Moneda
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="currency"
              >
                <option>USD</option>
                <option>PEN</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Monto
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                min="0.01"
                name="amount"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Referencia
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="reference"
              />
            </label>
          </>
        )}
        {action === "cancelInvoice" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Clase
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="invoiceKind"
              >
                <option value="commercial-invoices">Comercial</option>
                <option value="transport-invoices">Transporte</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              ID de factura
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="invoiceId"
                required
              />
            </label>
          </>
        )}
        {action === "exchangeRate" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Fecha
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                defaultValue={new Date().toISOString().slice(0, 10)}
                name="rateDate"
                required
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              USD a PEN - Caja Arequipa
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                min="0.0001"
                name="usdToPen"
                required
                step="0.0001"
                type="number"
              />
            </label>
          </>
        )}
        {action === "counterparty" && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Tipo
              <select
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="type"
              >
                <option>PROVEEDOR</option>
                <option>TRANSPORTISTA</option>
                <option>LABORATORIO</option>
                <option>CLIENTE</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Razón social
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="legalName"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Documento
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="documentNumber"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Contacto
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="contactName"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Teléfono
              <input
                className="rounded border border-[#b9cbc4] px-3 py-2"
                name="contactPhone"
              />
            </label>
          </>
        )}
        <div className="sm:col-span-2">
          <button
            className="rounded bg-[#2e6b61] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Guardando…" : "Guardar movimiento"}
          </button>
        </div>
      </form>
    </section>
  );
}
