import { FormEvent, useEffect, useMemo, useState } from "react";

import { OperationsTable, Column, formatUsd, formatPen } from "./components/OperationsTable";
import { OperationActionForm } from "./components/OperationActionForm";
import { MetricCard } from "./components/MetricCard";
import { StatusBadge } from "./components/StatusBadge";
import { OperationDetailModal, GuideDetailView } from "./components/OperationDetailModal";
import { getJson, sendJson, type ApiRow } from "./lib/api";

type Dashboard = {
  pendingLaws: number;
  pendingProposal: number;
  openAlerts: number;
  missingTransportInvoice: number;
};

type UserAccount = {
  username: string;
  role: string;
  active: number;
  createdAt: string;
};

type ViewData = {
  items?: ApiRow[];
  reports?: ApiRow[];
  resamples?: ApiRow[];
  disputes?: ApiRow[];
  comparisons?: ApiRow[];
  proposals?: ApiRow[];
  settlements?: ApiRow[];
  rates?: ApiRow[];
  summary?: Record<string, unknown>;
  limit?: number;
  offset?: number;
};

const sections = [
  ["Inicio", "/api/dashboard"],
  ["Guías y lotes", "/api/operations/guides"],
  ["Leyes y laboratorio", "/api/operations/quality"],
  ["Propuestas y liquidaciones", "/api/operations/settlements"],
  ["Facturas comerciales", "/api/operations/commercial-invoices"],
  ["Transporte y pagos", "/api/operations/transport-invoices"],
  ["Descuentos", "/api/operations/discounts"],
  ["Tipo de cambio", "/api/operations/exchange-rates"],
  ["Auditoría", "/api/operations/audit"],
  ["Datos de prueba", "/api/operations/test-data"],
  ["Usuarios", "/api/auth/users"],
] as const;

type SectionName = (typeof sections)[number][0];

const tableColumns: Record<string, Column[]> = {
  "Guías y lotes": [
    { key: "gre", label: "GRE" },
    { key: "issuedAt", label: "Fecha GRE", format: "date" },
    { key: "plant", label: "Planta" },
    { key: "carrier", label: "Transporte" },
    { key: "suppliers", label: "Proveedor(es)" },
    { key: "lots", label: "Lotes PPO" },
    { key: "totalSacks", label: "Sacos", format: "number", align: "right" },
    { key: "invoices", label: "Factura Comercial" },
    { key: "liquidationStatus", label: "Liquidación", format: "status" },
    { key: "status", label: "Estado", format: "status" },
  ],
  "Facturas comerciales": [
    { key: "invoiceNumber", label: "N° Factura" },
    { key: "issuedAt", label: "Fecha", format: "date" },
    { key: "plant", label: "Planta" },
    { key: "suppliers", label: "Proveedor(es)" },
    { key: "lots", label: "Lotes" },
    { key: "guides", label: "Guía GRE" },
    { key: "amountUsdCents", label: "Monto Factura", format: "usd", align: "right" },
    { key: "detractionUsdCents", label: "Detracción (10%)", format: "usd", align: "right" },
    { key: "netDepositUsdCents", label: "Depósito Neto", format: "usd", align: "right" },
    { key: "supplierSettlementUsdCents", label: "Costo Liq.", format: "usd", align: "right" },
    { key: "differenceUsdCents", label: "Diferencia Margen", format: "usd", align: "right" },
    { key: "transportCarrier", label: "Transportista" },
    { key: "transportInvoiceNumber", label: "Fact. Flete" },
    { key: "status", label: "Estado", format: "status" },
    { key: "paidUsdCents", label: "Cobrado", format: "usd", align: "right" },
  ],
  "Transporte y pagos": [
    { key: "invoiceNumber", label: "N° Factura" },
    { key: "issuedAt", label: "Fecha", format: "date" },
    { key: "carrier", label: "Conductor / Transportista" },
    { key: "ruc", label: "RUC" },
    { key: "guides", label: "Guías GRE" },
    { key: "suppliers", label: "Proveedor(es)" },
    { key: "amountUsdCents", label: "Monto Flete ($)", format: "usd", align: "right" },
    { key: "exchangeRate", label: "T/C", format: "number", align: "right" },
    { key: "detractionPenCents", label: "Detracción (S/)", format: "pen", align: "right" },
    { key: "netAmountUsdCents", label: "Pago Neto ($)", format: "usd", align: "right" },
    { key: "invoicePaymentStatus", label: "Pago Factura", format: "status" },
    { key: "detractionPaymentStatus", label: "Pago Detracción", format: "status" },
    { key: "status", label: "Estado", format: "status" },
  ],
  Descuentos: [
    { key: "gre", label: "Guía GRE" },
    { key: "lotCode", label: "Lote" },
    { key: "plant", label: "Planta" },
    { key: "carrier", label: "Transporte" },
    { key: "suppliers", label: "Proveedor" },
    { key: "discountType", label: "Tipo" },
    { key: "reason", label: "Detalle / Motivo" },
    { key: "amountUsdCents", label: "Monto Descontado", format: "usd", align: "right" },
  ],
  "Tipo de cambio": [
    { key: "rateDate", label: "Fecha", format: "date" },
    { key: "usdToPen", label: "USD a PEN (T/C)", format: "number", align: "right" },
    { key: "source", label: "Fuente" },
  ],
  Auditoría: [
    { key: "createdAt", label: "Fecha y hora", format: "date" },
    { key: "actorUsername", label: "Usuario" },
    { key: "action", label: "Acción" },
    { key: "entityType", label: "Entidad" },
    { key: "reason", label: "Motivo / Justificación" },
  ],
  "Datos de prueba": [
    { key: "label", label: "Lote de Importación" },
    { key: "sourceRowCount", label: "Filas Fuente Excel", format: "number", align: "right" },
    { key: "structuredEntityCount", label: "Entidades Operativas", format: "number", align: "right" },
    { key: "openIssueCount", label: "Observaciones", format: "number", align: "right" },
    { key: "createdBy", label: "Usuario" },
    { key: "createdAt", label: "Fecha Carga", format: "date" },
  ],
};

function renderNavIcon(name: SectionName) {
  switch (name) {
    case "Inicio":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      );
    case "Guías y lotes":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      );
    case "Leyes y laboratorio":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.942A4.5 4.5 0 0 1 15.9 16.5H8.1a4.5 4.5 0 0 1-2.33-.658L4.2 14.9M19.8 15.3a2.25 2.25 0 0 1 .45 1.35V19.5a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25v-2.85c0-.49.16-.96.45-1.35" />
        </svg>
      );
    case "Propuestas y liquidaciones":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      );
    case "Facturas comerciales":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6H2.25m0 0v8.25m0 0a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6m0 0h-.75a.75.75 0 0 1-.75-.75V4.5m0 0a3 3 0 0 0-3-3H6.75a3 3 0 0 0-3 3Z" />
        </svg>
      );
    case "Transporte y pagos":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25H2.25m12 0v11.25" />
        </svg>
      );
    case "Descuentos":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 14.25 6-6m4.5-3.75H4.5A2.25 2.25 0 0 0 2.25 6.75v10.5A2.25 2.25 0 0 0 4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5Z" />
        </svg>
      );
    case "Tipo de cambio":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      );
    case "Auditoría":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
      );
    case "Datos de prueba":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      );
    case "Usuarios":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      );
  }
}

export function App() {
  const [section, setSection] = useState<SectionName>("Inicio");
  const [username, setUsername] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [data, setData] = useState<ViewData>({});
  const [dashboard, setDashboard] = useState<Dashboard>({
    pendingLaws: 0,
    pendingProposal: 0,
    openAlerts: 0,
    missingTransportInvoice: 0,
  });
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sub-tabs
  const [transportTab, setTransportTab] = useState<"pagos" | "volados" | "dashboard">("pagos");
  const [qualityTab, setQualityTab] = useState<"comparativo" | "reportes" | "disputas">("comparativo");
  const [settlementTab, setSettlementTab] = useState<"liquidaciones" | "propuestas" | "tarifas">("liquidaciones");
  const [invoiceMonthFilter, setInvoiceMonthFilter] = useState<string>("TODOS");

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [plantFilter, setPlantFilter] = useState("TODOS");

  // Details & Modals
  const [guideDetail, setGuideDetail] = useState<{
    guide: ApiRow;
    lots: ApiRow[];
    events: ApiRow[];
    alerts: ApiRow[];
    invoices?: ApiRow[];
    settlements?: ApiRow[];
  } | null>(null);

  const [sourceData, setSourceData] = useState<{
    batch: ApiRow;
    items: ApiRow[];
    issues: ApiRow[];
    offset: number;
    limit: number;
  } | null>(null);

  const [showGuideForm, setShowGuideForm] = useState(false);
  const [guides, setGuides] = useState<Array<{ id: string; gre: string }>>([]);
  const [counterparties, setCounterparties] = useState<
    Array<{ id: string; legalName: string; type: string }>
  >([]);
  const [showActionPanel, setShowActionPanel] = useState(false);

  const endpoint = useMemo(
    () => sections.find(([name]) => name === section)?.[1] ?? "/api/dashboard",
    [section],
  );

  async function refresh() {
    if (!username) return;
    setLoading(true);
    setError(null);
    setGuideDetail(null);
    setSourceData(null);
    try {
      if (section === "Inicio") {
        setDashboard(await getJson<Dashboard>("/api/dashboard"));
      } else if (section === "Usuarios") {
        setUsers((await getJson<{ items: UserAccount[] }>("/api/auth/users")).items);
      } else {
        setData(await getJson<ViewData>(`${endpoint}?limit=500&offset=0`));
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : "No se pudo cargar esta sección.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const current = await getJson<{ username: string }>("/api/auth/me");
        setUsername(current.username);
      } catch {
        setUsername(null);
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    void refresh();
  }, [section, username]);

  useEffect(() => {
    if (!username) return;
    void Promise.all([
      getJson<{ items: Array<{ id: string; gre: string }> }>("/api/operations/guides?limit=300"),
      getJson<{ items: Array<{ id: string; legalName: string; type: string }> }>("/api/counterparties"),
    ])
      .then(([guideResult, counterpartiesResult]) => {
        setGuides(guideResult.items);
        setCounterparties(counterpartiesResult.items);
      })
      .catch(() => undefined);
  }, [username]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAuthenticating(true);
    setError(null);
    try {
      const result = await sendJson<{ username: string }>("/api/auth/login", "POST", {
        username: String(form.get("username") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      setUsername(result.username);
    } catch (value) {
      setError(value instanceof Error ? value.message : "No se pudo iniciar sesión.");
    } finally {
      setAuthenticating(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUsername(null);
    setData({});
  }

  async function createGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const issuedAt = String(form.get("issuedAt"));
    const lots = String(form.get("lots"))
      .split(/\n|,/)
      .map((code) => code.trim())
      .filter(Boolean)
      .map((code) => ({ code }));
    try {
      await sendJson("/api/guides", "POST", {
        gre: String(form.get("gre")),
        issuedAt: new Date(`${issuedAt}T12:00:00.000Z`).toISOString(),
        lots,
      });
      setShowGuideForm(false);
      if (section === "Guías y lotes") await refresh();
      else setSection("Guías y lotes");
    } catch (value) {
      setError(value instanceof Error ? value.message : "No se pudo registrar la guía.");
    }
  }

  async function openGuide(id: string) {
    try {
      setGuideDetail(await getJson(`/api/operations/guides/${id}`));
    } catch (value) {
      setError(value instanceof Error ? value.message : "No se pudo abrir la guía.");
    }
  }

  async function openSource(batchId: string, offset = 0) {
    try {
      setSourceData(
        await getJson(`/api/operations/test-data/${batchId}/source-rows?limit=100&offset=${offset}`),
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : "No se pudieron abrir las filas fuente.");
    }
  }

  // Filtered rows for current view
  const records = useMemo(() => {
    let list = data.items ?? [];

    // Filter by transport tab
    if (section === "Transporte y pagos") {
      if (transportTab === "volados") {
        list = list.filter((r) => r.isVolado === 1 || String(r.invoiceNumber).includes("3218") || String(r.invoiceNumber).includes("3219"));
      }
    }

    // Filter by commercial invoice month
    if (section === "Facturas comerciales" && invoiceMonthFilter !== "TODOS") {
      list = list.filter((r) => {
        if (!r.issuedAt) return false;
        const month = String(r.issuedAt).substring(5, 7);
        if (invoiceMonthFilter === "09") return month === "09";
        if (invoiceMonthFilter === "08") return month === "08";
        if (invoiceMonthFilter === "07") return month === "07";
        return true;
      });
    }

    // Filter by plant
    if (plantFilter !== "TODOS") {
      list = list.filter((r) => String(r.plant ?? "").toUpperCase().includes(plantFilter.toUpperCase()));
    }

    // Filter by status
    if (statusFilter !== "TODOS") {
      list = list.filter((r) => String(r.status ?? "").toUpperCase() === statusFilter.toUpperCase());
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) =>
        Object.values(r).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q)),
      );
    }

    return list;
  }, [data.items, section, transportTab, invoiceMonthFilter, plantFilter, statusFilter, searchQuery]);

  if (!authReady) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f4f7f6] text-[#10242b]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#2e6b61] border-t-transparent" />
          <p className="text-sm font-semibold tracking-wide text-[#345c53]">Cargando Sistema MINANTAYA…</p>
        </div>
      </main>
    );
  }

  if (!username) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f0f4f2] p-4 text-[#10242b]">
        <div className="w-full max-w-md rounded-2xl border border-[#cfdcd7] bg-white p-8 shadow-xl">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-[#345c53]">MINANTAYA</p>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#10242b]">Sistema de Control Minero</h1>
          <p className="mt-1.5 text-xs text-[#59756f]">
            Acceso administrativo para trazabilidad de minerales, fletes y liquidaciones.
          </p>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">
              {error}
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={authenticate}>
            <div>
              <label className="block text-xs font-semibold text-[#274b42]">Usuario</label>
              <input
                className="mt-1.5 w-full rounded-lg border border-[#b9cbc4] px-3.5 py-2 text-sm text-[#10242b] outline-none transition focus:border-[#2e6b61] focus:ring-2 focus:ring-[#2e6b61]/20"
                name="username"
                placeholder="Nombre de usuario"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#274b42]">Contraseña</label>
              <input
                className="mt-1.5 w-full rounded-lg border border-[#b9cbc4] px-3.5 py-2 text-sm text-[#10242b] outline-none transition focus:border-[#2e6b61] focus:ring-2 focus:ring-[#2e6b61]/20"
                minLength={8}
                name="password"
                placeholder="••••••••••••"
                required
                type="password"
              />
            </div>
            <button
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2e6b61] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#25574f] disabled:opacity-50 leading-none"
              disabled={authenticating}
              type="submit"
            >
              {authenticating ? "Verificando acceso…" : "Ingresar al Sistema"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#f4f7f6] text-[#10242b] lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-[100dvh] lg:h-full lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="border-b border-[#203c44] bg-[#0d252d] text-[#e8f0ed] lg:border-r lg:border-b-0 flex flex-col justify-between lg:h-full lg:sticky lg:top-0 lg:overflow-y-auto shrink-0">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="border-b border-[#1b3a43] px-5 pt-6 pb-5 shrink-0">
              <p className="text-xs font-bold tracking-[0.2em] text-[#a9c4ba]">MINANTAYA</p>
              <h1 className="mt-1 text-sm font-semibold text-white leading-tight">Control Operativo</h1>
            </div>

            <nav className="flex flex-col overflow-y-auto">
              {sections.map(([name]) => {
                const isActive = section === name;
                return (
                  <button
                    className={`inline-flex w-full items-center gap-3 px-5 py-3 text-left text-xs transition rounded-none leading-none shrink-0 ${
                      isActive
                        ? "bg-[#e6f0c9] text-[#17333a] font-bold"
                        : "text-[#c8d8d2] hover:bg-[#14323a] hover:text-white font-medium"
                    }`}
                    key={name}
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("TODOS");
                      setPlantFilter("TODOS");
                      setSection(name);
                    }}
                    type="button"
                  >
                    <span className={`inline-flex items-center justify-center shrink-0 ${isActive ? "text-[#17333a]" : "text-[#7f9e95]"}`}>
                      {renderNavIcon(name)}
                    </span>
                    <span className="truncate">{name}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-[#203c44] p-5 shrink-0">
            <div className="flex items-center justify-between text-xs text-[#a9c4ba]">
              <div>
                <span className="block text-[10px] uppercase text-[#73948a]">Sesión Activa</span>
                <span className="font-semibold text-white">{username}</span>
              </div>
              <button
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2a4e58] px-2.5 py-1 text-xs font-medium text-[#e6f0c9] transition hover:bg-[#183941] leading-none"
                onClick={() => void logout()}
                type="button"
              >
                Salir
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <section className="px-4 py-6 sm:px-8 lg:px-10 overflow-y-auto lg:h-full">
          <div className="mx-auto max-w-[1550px]">
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dce5e1] pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#59756f]">
                    Módulo Operacional
                  </span>
                  <span className="text-xs text-[#99b0a9]">•</span>
                  <span className="text-xs font-medium text-[#2e6b61]">En línea</span>
                </div>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#10242b]">{section}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#c6d7d0] bg-white px-3.5 py-2 text-xs font-semibold text-[#274b42] shadow-xs transition hover:bg-[#f4f7f6] leading-none"
                  onClick={() => void refresh()}
                  title="Actualizar datos"
                  type="button"
                >
                  <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Actualizar
                </button>

                {section === "Guías y lotes" && (
                  <button
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2e6b61] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#25574f] leading-none"
                    onClick={() => setShowGuideForm(true)}
                    type="button"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Registrar Guía GRE
                  </button>
                )}

                {![ "Inicio", "Auditoría", "Datos de prueba", "Usuarios" ].includes(section) && (
                  <button
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold shadow-xs transition leading-none ${
                      showActionPanel
                        ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
                        : "border-[#2e6b61] bg-[#f0f8f5] text-[#1f594f] hover:bg-[#e4f2ee]"
                    }`}
                    onClick={() => setShowActionPanel((open) => !open)}
                    type="button"
                  >
                    {showActionPanel ? "Cerrar Panel" : "Registrar Movimiento"}
                  </button>
                )}
              </div>
            </header>

            {/* Action Form Dropdown */}
            {showActionPanel && (
              <div className="mt-5 rounded-2xl border border-[#cbe0d8] bg-[#f9fcfa] p-5 shadow-md">
                <OperationActionForm
                  counterparties={counterparties}
                  guides={guides}
                  onSaved={() => {
                    setShowActionPanel(false);
                    void refresh();
                  }}
                />
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="mt-5 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  <span>{error}</span>
                </div>
                <button className="text-rose-600 hover:text-rose-900" onClick={() => setError(null)} type="button">
                  Cerrar
                </button>
              </div>
            )}

            {/* SECTION: INICIO (DASHBOARD GENERAL) */}
            {section === "Inicio" && (
              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#3d5953] mb-3">
                    Resumen Operativo y Pendientes Críticos
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      icon={renderNavIcon("Leyes y laboratorio")}
                      subtitle="Guías con mineral en planta sin leyes"
                      title="Leyes Pendientes"
                      value={dashboard.pendingLaws}
                      variant={dashboard.pendingLaws > 0 ? "warning" : "default"}
                    />
                    <MetricCard
                      icon={renderNavIcon("Propuestas y liquidaciones")}
                      subtitle="Guías con leyes listas para compra"
                      title="Propuestas Pendientes"
                      value={dashboard.pendingProposal}
                      variant={dashboard.pendingProposal > 0 ? "primary" : "default"}
                    />
                    <MetricCard
                      icon={renderNavIcon("Transporte y pagos")}
                      subtitle="Guías sin factura de transporte vinculada"
                      title="Fletes por Facturar"
                      value={dashboard.missingTransportInvoice}
                      variant={dashboard.missingTransportInvoice > 0 ? "warning" : "default"}
                    />
                    <MetricCard
                      icon={renderNavIcon("Auditoría")}
                      subtitle="Incidencias o retrasos operativos"
                      title="Alertas Abiertas"
                      value={dashboard.openAlerts}
                      variant={dashboard.openAlerts > 0 ? "accent" : "success"}
                    />
                  </div>
                </div>

                {/* Quick Shortcuts */}
                <div className="rounded-2xl border border-[#dce5e1] bg-white p-6 shadow-xs">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#3d5953] mb-4">
                    Acceso Rápido a Módulos del Sistema
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {[
                      {
                        title: "Guías y Lotes",
                        desc: "Consulta GRE, sacos, lotes y proveedores",
                        target: "Guías y lotes" as SectionName,
                      },
                      {
                        title: "Facturas Comerciales",
                        desc: "Facturas de mineral a plantas, detracciones y depósitos",
                        target: "Facturas comerciales" as SectionName,
                      },
                      {
                        title: "Transporte y Pagos",
                        desc: "Fletes de Gianger, Wiracocha y Coasur con detracciones",
                        target: "Transporte y pagos" as SectionName,
                      },
                      {
                        title: "Leyes y Laboratorio",
                        desc: "Comparativa de Ley Planta vs Ley Laboratorio",
                        target: "Leyes y laboratorio" as SectionName,
                      },
                      {
                        title: "Liquidaciones y Tarifas",
                        desc: "Liquidaciones con fletes descontados y T/C",
                        target: "Propuestas y liquidaciones" as SectionName,
                      },
                      {
                        title: "Datos de Prueba",
                        desc: "Filas fuente originales de los 4 libros Excel",
                        target: "Datos de prueba" as SectionName,
                      },
                    ].map((item) => (
                      <button
                        className="flex flex-col items-start rounded-xl border border-[#e5ece9] p-4 text-left transition hover:border-[#2e6b61] hover:bg-[#f6faf8]"
                        key={item.title}
                        onClick={() => setSection(item.target)}
                        type="button"
                      >
                        <strong className="text-sm font-bold text-[#10242b]">{item.title}</strong>
                        <span className="mt-1 text-xs text-[#59756f]">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: FACTURAS COMERCIALES */}
            {section === "Facturas comerciales" && (
              <div className="mt-6 space-y-6">
                {/* KPI Cards */}
                {data.summary && (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <MetricCard
                      subtitle="Total facturado a plantas"
                      title="Monto Facturado"
                      value={formatUsd(data.summary.totalAmountUsdCents)}
                      variant="primary"
                    />
                    <MetricCard
                      subtitle="10% retenido SUNAT"
                      title="Detracción (10%)"
                      value={formatUsd(data.summary.totalDetractionUsdCents)}
                    />
                    <MetricCard
                      subtitle="Neto depositado en cuenta"
                      title="Depósito Neto"
                      value={formatUsd(data.summary.totalDepositUsdCents)}
                      variant="success"
                    />
                    <MetricCard
                      subtitle="Facturas con pago confirmado"
                      title="Facturas Pagadas"
                      value={Number(data.summary.paidInvoicesCount ?? 0)}
                    />
                    <MetricCard
                      subtitle="Facturas por cobrar"
                      title="Facturas Pendientes"
                      value={Number(data.summary.pendingInvoicesCount ?? 0)}
                      variant={Number(data.summary.pendingInvoicesCount ?? 0) > 0 ? "warning" : "default"}
                    />
                  </div>
                )}

                {/* Sub-Filters / Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce5e1] bg-white p-3 shadow-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#59756f] mr-1">Período:</span>
                    {[
                      ["TODOS", "Todos los meses"],
                      ["09", "Setiembre 2026"],
                      ["08", "Agosto 2026"],
                      ["07", "Julio 2026"],
                    ].map(([key, label]) => (
                      <button
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition leading-none ${
                          invoiceMonthFilter === key
                            ? "bg-[#2e6b61] text-white"
                            : "bg-[#edf3f0] text-[#345c53] hover:bg-[#dce9e4]"
                        }`}
                        key={key}
                        onClick={() => setInvoiceMonthFilter(key)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Search Bar */}
                  <div className="relative min-w-[240px]">
                    <input
                      className="w-full rounded-lg border border-[#c6d7d0] py-1.5 pl-8 pr-3 text-xs text-[#10242b] outline-none transition focus:border-[#2e6b61]"
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar factura, proveedor o GRE…"
                      value={searchQuery}
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
                  </div>
                </div>

                {/* Table */}
                <OperationsTable
                  columns={tableColumns["Facturas comerciales"]}
                  emptyMessage="No se encontraron facturas comerciales para los filtros seleccionados."
                  items={records}
                />
              </div>
            )}

            {/* SECTION: TRANSPORTE Y PAGOS */}
            {section === "Transporte y pagos" && (
              <div className="mt-6 space-y-6">
                {/* KPI Cards */}
                {data.summary && (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <MetricCard
                      subtitle="Fletes totales en dólares"
                      title="Total Facturado"
                      value={formatUsd(data.summary.totalAmountUsdCents)}
                      variant="primary"
                    />
                    <MetricCard
                      subtitle="4% SUNAT transporte"
                      title="Detracción en Soles"
                      value={formatPen(data.summary.totalDetractionPenCents)}
                      variant="warning"
                    />
                    <MetricCard
                      subtitle="96% flete neto"
                      title="Pago Neto Flete"
                      value={formatUsd(data.summary.totalNetUsdCents)}
                      variant="success"
                    />
                    <MetricCard
                      subtitle="Fletes cancelados"
                      title="Facturas Pagadas"
                      value={Number(data.summary.paidCount ?? 0)}
                    />
                    <MetricCard
                      subtitle="Fletes por pagar"
                      title="Facturas Pendientes"
                      value={Number(data.summary.pendingCount ?? 0)}
                      variant={Number(data.summary.pendingCount ?? 0) > 0 ? "warning" : "default"}
                    />
                  </div>
                )}

                {/* Tabs: Control de Pagos / Lotes Volados / Dashboard */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce5e1] pb-2">
                  <div className="flex gap-2">
                    <button
                      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition leading-none ${
                        transportTab === "pagos"
                          ? "bg-[#2e6b61] text-white shadow-xs"
                          : "bg-white border border-[#c6d7d0] text-[#345c53] hover:bg-[#f4f7f6]"
                      }`}
                      onClick={() => setTransportTab("pagos")}
                      type="button"
                    >
                      Control de Pagos
                    </button>
                    <button
                      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition leading-none ${
                        transportTab === "volados"
                          ? "bg-[#2e6b61] text-white shadow-xs"
                          : "bg-white border border-[#c6d7d0] text-[#345c53] hover:bg-[#f4f7f6]"
                      }`}
                      onClick={() => setTransportTab("volados")}
                      type="button"
                    >
                      Lotes Volados
                    </button>
                  </div>

                  <div className="relative min-w-[240px]">
                    <input
                      className="w-full rounded-lg border border-[#c6d7d0] py-1.5 pl-8 pr-3 text-xs text-[#10242b] outline-none transition focus:border-[#2e6b61]"
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar transportista, RUC o factura…"
                      value={searchQuery}
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
                  </div>
                </div>

                <OperationsTable
                  columns={tableColumns["Transporte y pagos"]}
                  emptyMessage="No hay facturas de transporte para esta vista."
                  items={records}
                />
              </div>
            )}

            {/* SECTION: GUIAS Y LOTES */}
            {section === "Guías y lotes" && (
              <div className="mt-6 space-y-6">
                {/* KPI Cards */}
                {data.summary && (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <MetricCard
                      subtitle="GREs emitidas registradas"
                      title="Total Guías"
                      value={Number(data.summary.totalGuides ?? 0)}
                      variant="primary"
                    />
                    <MetricCard
                      subtitle="Guías con factura comercial"
                      title="Facturadas"
                      value={Number(data.summary.invoicedGuides ?? 0)}
                      variant="success"
                    />
                    <MetricCard
                      subtitle="Guías en planta o en proceso"
                      title="En Proceso"
                      value={Number(data.summary.activeGuides ?? 0)}
                    />
                    <MetricCard
                      subtitle="Lotes individuales"
                      title="Total Lotes"
                      value={Number(data.summary.totalLots ?? 0)}
                    />
                    <MetricCard
                      subtitle="Sacos de mineral transportados"
                      title="Total Sacos"
                      value={Number(data.summary.totalSacks ?? 0)}
                    />
                  </div>
                )}

                {/* Filter Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce5e1] bg-white p-3 shadow-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#59756f]">Planta:</span>
                    {["TODOS", "ANALYTICA", "COLIBRI", "AEQUUM"].map((p) => (
                      <button
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition leading-none ${
                          plantFilter === p
                            ? "bg-[#2e6b61] text-white"
                            : "bg-[#edf3f0] text-[#345c53] hover:bg-[#dce9e4]"
                        }`}
                        key={p}
                        onClick={() => setPlantFilter(p)}
                        type="button"
                      >
                        {p === "TODOS" ? "Todas" : p}
                      </button>
                    ))}
                  </div>

                  <div className="relative min-w-[240px]">
                    <input
                      className="w-full rounded-lg border border-[#c6d7d0] py-1.5 pl-8 pr-3 text-xs text-[#10242b] outline-none transition focus:border-[#2e6b61]"
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por GRE, Lote, Proveedor…"
                      value={searchQuery}
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
                  </div>
                </div>

                <OperationsTable
                  columns={tableColumns["Guías y lotes"]}
                  emptyMessage="No se encontraron guías operativas."
                  items={records}
                  onRowClick={(item) => openGuide(String(item.id))}
                />
              </div>
            )}

            {/* SECTION: LEYES Y LABORATORIO */}
            {section === "Leyes y laboratorio" && (
              <div className="mt-6 space-y-6">
                {/* Tabs */}
                <div className="flex gap-2 border-b border-[#dce5e1] pb-2">
                  <button
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition leading-none ${
                      qualityTab === "comparativo"
                        ? "bg-[#2e6b61] text-white shadow-xs"
                        : "bg-white border border-[#c6d7d0] text-[#345c53] hover:bg-[#f4f7f6]"
                    }`}
                    onClick={() => setQualityTab("comparativo")}
                    type="button"
                  >
                    Cuadro Comparativo de Leyes (Laboratorio vs Planta)
                  </button>
                  <button
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition leading-none ${
                      qualityTab === "reportes"
                        ? "bg-[#2e6b61] text-white shadow-xs"
                        : "bg-white border border-[#c6d7d0] text-[#345c53] hover:bg-[#f4f7f6]"
                    }`}
                    onClick={() => setQualityTab("reportes")}
                    type="button"
                  >
                    Reportes de Calidad ({data.reports?.length ?? 0})
                  </button>
                  <button
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition leading-none ${
                      qualityTab === "disputas"
                        ? "bg-[#2e6b61] text-white shadow-xs"
                        : "bg-white border border-[#c6d7d0] text-[#345c53] hover:bg-[#f4f7f6]"
                    }`}
                    onClick={() => setQualityTab("disputas")}
                    type="button"
                  >
                    Remuestreos y Dirimencias ({(data.resamples?.length ?? 0) + (data.disputes?.length ?? 0)})
                  </button>
                </div>

                {qualityTab === "comparativo" && (
                  <OperationsTable
                    columns={[
                      { key: "gre", label: "GRE" },
                      { key: "lotCode", label: "Lote PPO" },
                      { key: "sackCount", label: "Sacos", format: "number", align: "right" },
                      { key: "plantAssay", label: "Ley Planta (Au)", format: "number", align: "right" },
                      { key: "labAssay", label: "Ley Laboratorio (Au)", format: "number", align: "right" },
                      {
                        key: "difference",
                        label: "Diferencia",
                        align: "right",
                        render: (_, val) => {
                          const diff = Number(val);
                          if (Number.isNaN(diff) || val === null || val === undefined) return "—";
                          const isPositive = diff > 0;
                          return (
                            <span
                              className={`font-mono font-bold ${
                                isPositive ? "text-emerald-700" : diff < 0 ? "text-rose-700" : "text-[#59756f]"
                              }`}
                            >
                              {diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3)}
                            </span>
                          );
                        },
                      },
                      {
                        key: "actions",
                        label: "Acción",
                        align: "center",
                        render: (row) => (
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-[#c6d7d0] px-2 py-1 text-[11px] font-semibold text-[#2e6b61] hover:bg-[#f4f7f6]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowActionPanel(true);
                            }}
                            type="button"
                          >
                            Abrir Dirimencia
                          </button>
                        ),
                      },
                    ]}
                    emptyMessage="No hay comparativos de leyes registrados en el sistema."
                    items={data.comparisons ?? []}
                  />
                )}

                {qualityTab === "reportes" && (
                  <OperationsTable
                    columns={[
                      { key: "gre", label: "GRE" },
                      { key: "reportNumber", label: "N° Reporte" },
                      { key: "source", label: "Origen" },
                      { key: "laboratory", label: "Laboratorio" },
                      { key: "resultCount", label: "Resultados", format: "number", align: "right" },
                      { key: "status", label: "Estado", format: "status" },
                    ]}
                    emptyMessage="No hay reportes de leyes registrados."
                    items={data.reports ?? []}
                  />
                )}

                {qualityTab === "disputas" && (
                  <div className="grid gap-6 xl:grid-cols-2">
                    <div className="rounded-xl border border-[#dce5e1] bg-white p-4 shadow-xs">
                      <h4 className="text-sm font-bold text-[#10242b] mb-3">Remuestreos Solicitados</h4>
                      <OperationsTable
                        columns={[
                          { key: "gre", label: "GRE" },
                          { key: "supplier", label: "Proveedor" },
                          { key: "reason", label: "Motivo" },
                          { key: "status", label: "Estado", format: "status" },
                        ]}
                        emptyMessage="No hay solicitudes de remuestreo."
                        items={data.resamples ?? []}
                      />
                    </div>
                    <div className="rounded-xl border border-[#dce5e1] bg-white p-4 shadow-xs">
                      <h4 className="text-sm font-bold text-[#10242b] mb-3">Dirimencias Abiertas</h4>
                      <OperationsTable
                        columns={[
                          { key: "gre", label: "GRE" },
                          { key: "reason", label: "Motivo" },
                          { key: "stage", label: "Etapa", format: "status" },
                        ]}
                        emptyMessage="No hay dirimencias abiertas."
                        items={data.disputes ?? []}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SECTION: PROPUESTAS Y LIQUIDACIONES */}
            {section === "Propuestas y liquidaciones" && (
              <div className="mt-6 space-y-6">
                {/* KPI Cards */}
                {data.summary && (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      subtitle="Liquidaciones calculadas a mineros"
                      title="Liquidación Bruta ($)"
                      value={formatUsd(data.summary.totalGrossUsdCents)}
                      variant="primary"
                    />
                    <MetricCard
                      subtitle="Descuento flete aplicado a compras"
                      title="Descuento Transporte ($)"
                      value={formatUsd(data.summary.totalDeductionsUsdCents)}
                      variant="warning"
                    />
                    <MetricCard
                      subtitle="Neto a pagar a proveedores"
                      title="Monto Neto ($)"
                      value={formatUsd(data.summary.totalNetUsdCents)}
                      variant="success"
                    />
                    <MetricCard
                      subtitle="Propuestas con visto bueno"
                      title="Propuestas Aprobadas"
                      value={Number(data.summary.approvedProposals ?? 0)}
                    />
                  </div>
                )}

                {/* Tabs */}
                <div className="flex gap-2 border-b border-[#dce5e1] pb-2">
                  <button
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition leading-none ${
                      settlementTab === "liquidaciones"
                        ? "bg-[#2e6b61] text-white shadow-xs"
                        : "bg-white border border-[#c6d7d0] text-[#345c53] hover:bg-[#f4f7f6]"
                    }`}
                    onClick={() => setSettlementTab("liquidaciones")}
                    type="button"
                  >
                    Liquidaciones a Proveedor ({data.settlements?.length ?? 0})
                  </button>
                  <button
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition leading-none ${
                      settlementTab === "propuestas"
                        ? "bg-[#2e6b61] text-white shadow-xs"
                        : "bg-white border border-[#c6d7d0] text-[#345c53] hover:bg-[#f4f7f6]"
                    }`}
                    onClick={() => setSettlementTab("propuestas")}
                    type="button"
                  >
                    Propuestas de Compra ({data.proposals?.length ?? 0})
                  </button>
                  <button
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition leading-none ${
                      settlementTab === "tarifas"
                        ? "bg-[#2e6b61] text-white shadow-xs"
                        : "bg-white border border-[#c6d7d0] text-[#345c53] hover:bg-[#f4f7f6]"
                    }`}
                    onClick={() => setSettlementTab("tarifas")}
                    type="button"
                  >
                    Tarifas de Transporte x TM ({data.rates?.length ?? 0})
                  </button>
                </div>

                {settlementTab === "liquidaciones" && (
                  <OperationsTable
                    columns={[
                      { key: "gre", label: "GRE" },
                      { key: "plant", label: "Planta" },
                      { key: "suppliers", label: "Proveedor" },
                      { key: "lots", label: "Lotes" },
                      { key: "grossUsdCents", label: "Liquidación Bruta ($)", format: "usd", align: "right" },
                      { key: "deductionsUsdCents", label: "Descuento Flete ($)", format: "usd", align: "right" },
                      { key: "netUsdCents", label: "Neto a Pagar ($)", format: "usd", align: "right" },
                      { key: "exchangeRate", label: "T/C", format: "number", align: "right" },
                      { key: "netPenCents", label: "Neto en Soles (PEN)", format: "pen", align: "right" },
                      { key: "status", label: "Estado", format: "status" },
                    ]}
                    emptyMessage="No hay liquidaciones registradas."
                    items={data.settlements ?? []}
                  />
                )}

                {settlementTab === "propuestas" && (
                  <OperationsTable
                    columns={[
                      { key: "gre", label: "GRE" },
                      { key: "proposalNumber", label: "N° Propuesta" },
                      { key: "issuedAt", label: "Fecha Emisión", format: "date" },
                      { key: "amountUsdCents", label: "Importe Propuesta", format: "usd", align: "right" },
                      { key: "status", label: "Estado", format: "status" },
                    ]}
                    emptyMessage="No hay propuestas de compra registradas."
                    items={data.proposals ?? []}
                  />
                )}

                {settlementTab === "tarifas" && (
                  <OperationsTable
                    columns={[
                      { key: "origin", label: "Origen" },
                      { key: "destination", label: "Destino / Planta" },
                      { key: "carrier", label: "Transportista" },
                      { key: "rateType", label: "Tipo Tarifa", format: "badge" },
                      { key: "amountCents", label: "Tarifa x TM ($)", format: "usd", align: "right" },
                      { key: "active", label: "Activo", format: "status" },
                    ]}
                    emptyMessage="No hay tarifas de transporte configuradas."
                    items={data.rates ?? []}
                  />
                )}
              </div>
            )}

            {/* SECTION: DESCUENTOS */}
            {section === "Descuentos" && (
              <div className="mt-6 space-y-6">
                {data.summary && (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <MetricCard
                      subtitle="Total descuentos a proveedores"
                      title="Monto Descontado ($)"
                      value={formatUsd(data.summary.totalDiscountUsdCents)}
                      variant="warning"
                    />
                    <MetricCard
                      subtitle="Descuentos de flete y transporte"
                      title="Descuentos de Transporte"
                      value={Number(data.summary.transportDiscountsCount ?? 0)}
                      variant="primary"
                    />
                    <MetricCard
                      subtitle="Penalidades y ajustes"
                      title="Otros Descuentos"
                      value={Number(data.summary.otherDiscountsCount ?? 0)}
                    />
                  </div>
                )}

                <OperationsTable
                  columns={tableColumns["Descuentos"]}
                  emptyMessage="No hay descuentos registrados."
                  items={records}
                />
              </div>
            )}

            {/* SECTION: TIPO DE CAMBIO */}
            {section === "Tipo de cambio" && (
              <div className="mt-6 space-y-6">
                <div className="flex items-center justify-between rounded-xl border border-[#dce5e1] bg-white p-4 shadow-xs">
                  <div>
                    <h3 className="text-sm font-bold text-[#10242b]">Tipo de Cambio Caja Arequipa</h3>
                    <p className="text-xs text-[#59756f]">
                      Fuente oficial para liquidaciones de mineral a proveedores y detracciones en soles.
                    </p>
                  </div>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#2e6b61] bg-[#f0f8f5] px-3.5 py-2 text-xs font-semibold text-[#1f594f] hover:bg-[#e4f2ee]"
                    onClick={() => setShowActionPanel(true)}
                    type="button"
                  >
                    Registrar T/C de Hoy
                  </button>
                </div>

                <OperationsTable
                  columns={tableColumns["Tipo de cambio"]}
                  emptyMessage="No hay tipos de cambio registrados."
                  items={records}
                />
              </div>
            )}

            {/* SECTION: AUDITORIA */}
            {section === "Auditoría" && (
              <div className="mt-6 space-y-6">
                <div className="rounded-xl border border-[#dce5e1] bg-white p-4 shadow-xs">
                  <h3 className="text-sm font-bold text-[#10242b]">Bitácora de Trazabilidad Inmutable</h3>
                  <p className="text-xs text-[#59756f]">
                    Cada operación queda firmada con el usuario activo en sesión y no se puede modificar.
                  </p>
                </div>

                <OperationsTable
                  columns={tableColumns["Auditoría"]}
                  emptyMessage="No hay registros de auditoría."
                  items={records}
                />
              </div>
            )}

            {/* SECTION: DATOS DE PRUEBA */}
            {section === "Datos de prueba" && (
              <div className="mt-6 space-y-6">
                <div className="rounded-xl border border-[#dce5e1] bg-white p-4 shadow-xs">
                  <h3 className="text-sm font-bold text-[#10242b]">Libros Operativos Excel Importados</h3>
                  <p className="text-xs text-[#59756f]">
                    Datos trazables importados desde los 4 libros Excel entregados. Puedes auditar cada fila fuente.
                  </p>
                </div>

                <OperationsTable
                  columns={tableColumns["Datos de prueba"]}
                  emptyMessage="No hay lotes de prueba cargados."
                  items={records}
                  onRowClick={(item) => openSource(String(item.id))}
                />
              </div>
            )}

            {/* SECTION: USUARIOS */}
            {section === "Usuarios" && (
              <div className="mt-6 space-y-6">
                <div className="rounded-xl border border-[#dce5e1] bg-white p-4 shadow-xs">
                  <h3 className="text-sm font-bold text-[#10242b]">Cuentas de Administración</h3>
                  <p className="text-xs text-[#59756f]">
                    Acceso restringido a dos administradores con control total.
                  </p>
                </div>

                <OperationsTable
                  columns={[
                    { key: "username", label: "Nombre de Usuario" },
                    { key: "role", label: "Rol Asignado", format: "badge" },
                    { key: "active", label: "Estado", format: "status" },
                    { key: "createdAt", label: "Fecha de Creación", format: "date" },
                  ]}
                  emptyMessage="No hay usuarios."
                  items={users as unknown as ApiRow[]}
                />
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Guide Detail Modal */}
      {guideDetail && (
        <OperationDetailModal
          onClose={() => setGuideDetail(null)}
          subtitle="Desglose operativo completo de la guía de remisión"
          title={`Detalle de Guía ${String(guideDetail.guide.gre)}`}
        >
          <GuideDetailView
            alerts={guideDetail.alerts}
            events={guideDetail.events}
            guide={guideDetail.guide}
            invoices={guideDetail.invoices}
            lots={guideDetail.lots}
            settlements={guideDetail.settlements}
          />
        </OperationDetailModal>
      )}

      {/* Source Data Modal */}
      {sourceData && (
        <OperationDetailModal
          onClose={() => setSourceData(null)}
          subtitle={`Lote: ${String(sourceData.batch.label)} (${sourceData.items.length} filas fuente)`}
          title="Auditoría de Filas Fuente Excel"
        >
          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-[#3d5953]">
              Filas leídas directamente de los libros
            </h4>
            <div className="max-h-[500px] overflow-y-auto rounded-lg border border-[#dce5e1]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-[#dce5e1] bg-[#f4f8f6] font-semibold text-[#49655f]">
                  <tr>
                    <th className="px-3 py-2">Archivo</th>
                    <th className="px-3 py-2">Hoja</th>
                    <th className="px-3 py-2 text-center">Fila</th>
                    <th className="px-3 py-2">Valores JSON</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2ef]">
                  {sourceData.items.map((row) => (
                    <tr className="hover:bg-[#fafcfb]" key={String(row.id)}>
                      <td className="px-3 py-2 font-medium text-[#10242b]">{String(row.sourceFile)}</td>
                      <td className="px-3 py-2 text-[#49655f]">{String(row.sheetName)}</td>
                      <td className="px-3 py-2 text-center font-mono">{String(row.sourceRowNumber)}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-[#2d5248] max-w-lg truncate">
                        {String(row.valuesJson)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </OperationDetailModal>
      )}

      {/* Guide Creation Modal */}
      {showGuideForm && (
        <OperationDetailModal
          onClose={() => setShowGuideForm(false)}
          subtitle="Emisión de nueva Guía de Remisión Electrónica con lotes iniciales"
          title="Registrar Nueva Guía GRE"
        >
          <form className="space-y-4" onSubmit={createGuide}>
            <div>
              <label className="block text-xs font-semibold text-[#274b42]">Código GRE (ej: EG07-370)</label>
              <input
                className="mt-1.5 w-full rounded-lg border border-[#b9cbc4] px-3.5 py-2 text-sm text-[#10242b] outline-none transition focus:border-[#2e6b61]"
                name="gre"
                placeholder="EG07-370"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#274b42]">Fecha de Emisión</label>
              <input
                className="mt-1.5 w-full rounded-lg border border-[#b9cbc4] px-3.5 py-2 text-sm text-[#10242b] outline-none transition focus:border-[#2e6b61]"
                defaultValue={new Date().toISOString().substring(0, 10)}
                name="issuedAt"
                required
                type="date"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#274b42]">
                Códigos de Lotes Iniciales (separados por coma o salto de línea)
              </label>
              <textarea
                className="mt-1.5 w-full rounded-lg border border-[#b9cbc4] px-3.5 py-2 text-sm text-[#10242b] outline-none transition focus:border-[#2e6b61]"
                name="lots"
                placeholder="PPO 68300, PPO 68301"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="rounded-lg border border-[#c6d7d0] px-4 py-2 text-xs font-semibold text-[#274b42] hover:bg-[#f4f7f6]"
                onClick={() => setShowGuideForm(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-[#2e6b61] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#25574f]"
                type="submit"
              >
                Guardar Guía
              </button>
            </div>
          </form>
        </OperationDetailModal>
      )}
    </main>
  );
}
