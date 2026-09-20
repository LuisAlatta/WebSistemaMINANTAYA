import { FormEvent, useEffect, useState } from "react";

import { getJson, sendJson, type ApiRow } from "../lib/api";

type GuideOption = { id: string; gre: string };
type Counterparty = { id: string; legalName: string; type: string };
type Action =
  | "status"
  | "withdrawal"
  | "suppliers"
  | "laws"
  | "lawsProgress"
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<
    "COMERCIAL" | "TRANSPORTE"
  >("COMERCIAL");
  const [invoices, setInvoices] = useState<ApiRow[]>([]);

  useEffect(() => {
    if (!guideId) {
      setLots([]);
      return;
    }
    void getJson<{ lots: ApiRow[] }>(`/api/operations/guides/${guideId}`)
      .then((detail) => setLots(detail.lots))
      .catch(() => setLots([]));
  }, [guideId]);
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
      if (action === "commercialInvoice")
        await sendJson("/api/commercial-invoices", "POST", {
          invoiceNumber: form.get("invoiceNumber"),
          issuedAt: isoDate(form.get("issuedAt")),
          amountUsdCents: toCents(form.get("amountUsd")),
          detractionPercent: Number(form.get("detractionPercent")) / 100,
          detractionPenCents: toCents(form.get("detractionPen")),
          lotIds: form.getAll("lotId").map(String),
        });
      if (action === "transportInvoice")
        await sendJson("/api/transport-invoices", "POST", {
          carrierId: form.get("carrierId"),
          invoiceNumber: form.get("invoiceNumber"),
          issuedAt: isoDate(form.get("issuedAt")),
          amountUsdCents: toCents(form.get("amountUsd")),
          detractionPenCents: toCents(form.get("detractionPen")),
          guideIds: form.getAll("transportGuideId").map(String),
        });
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
          <label className="grid gap-1 text-sm font-medium sm:col-span-2">
            Guía
            <select
              className="rounded border border-[#b9cbc4] px-3 py-2"
              required
              value={guideId}
              onChange={(event) => setGuideId(event.target.value)}
            >
              <option value="">Selecciona una guía</option>
              {guides.map((guide) => (
                <option key={guide.id} value={guide.id}>
                  {guide.gre}
                </option>
              ))}
            </select>
          </label>
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
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
              Lotes del reporte
              <select
                className="min-h-24 rounded border border-[#b9cbc4] px-3 py-2"
                multiple
                name="lotId"
                required
              >
                {lots.map((lot) => (
                  <option key={String(lot.lotId)} value={String(lot.lotId)}>
                    {String(lot.code)}
                  </option>
                ))}
              </select>
            </label>
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
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
              Lotes (máximo 4)
              <select
                className="min-h-24 rounded border border-[#b9cbc4] px-3 py-2"
                multiple
                name="lotId"
                required
              >
                {lots.map((lot) => (
                  <option key={String(lot.lotId)} value={String(lot.lotId)}>
                    {String(lot.code)}
                  </option>
                ))}
              </select>
            </label>
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
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
              Guías cubiertas
              <select
                className="min-h-24 rounded border border-[#b9cbc4] px-3 py-2"
                multiple
                name="transportGuideId"
                required
              >
                {guides.map((guide) => (
                  <option key={guide.id} value={guide.id}>
                    {guide.gre}
                  </option>
                ))}
              </select>
            </label>
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
