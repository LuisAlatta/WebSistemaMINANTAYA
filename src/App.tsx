import { FormEvent, useEffect, useMemo, useState } from "react";

import { OperationsTable } from "./components/OperationsTable";
import { OperationActionForm } from "./components/OperationActionForm";
import { PageControls } from "./components/PageControls";
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
  proposals?: ApiRow[];
  settlements?: ApiRow[];
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

const columns: Record<
  string,
  Array<{
    key: string;
    label: string;
    format?: "usd" | "pen" | "date" | "status";
  }>
> = {
  "Guías y lotes": [
    { key: "gre", label: "GRE" },
    { key: "issuedAt", label: "Emisión", format: "date" },
    { key: "plant", label: "Planta" },
    { key: "suppliers", label: "Proveedor(es)" },
    { key: "lots", label: "Lotes" },
    { key: "lotCount", label: "Cant." },
    { key: "carrier", label: "Transporte" },
    { key: "status", label: "Estado", format: "status" },
  ],
  "Facturas comerciales": [
    { key: "invoiceNumber", label: "Factura" },
    { key: "issuedAt", label: "Fecha", format: "date" },
    { key: "lots", label: "Lotes" },
    { key: "amountUsdCents", label: "Monto", format: "usd" },
    { key: "paidUsdCents", label: "Pagado", format: "usd" },
    { key: "status", label: "Estado", format: "status" },
  ],
  "Transporte y pagos": [
    { key: "invoiceNumber", label: "Factura" },
    { key: "issuedAt", label: "Fecha", format: "date" },
    { key: "carrier", label: "Transportista" },
    { key: "ruc", label: "RUC" },
    { key: "guides", label: "Guías" },
    { key: "amountUsdCents", label: "Monto", format: "usd" },
    { key: "paidUsdCents", label: "Pago neto", format: "usd" },
    { key: "status", label: "Estado", format: "status" },
  ],
  Descuentos: [
    { key: "gre", label: "GRE" },
    { key: "lotCode", label: "Lote" },
    { key: "discountType", label: "Tipo" },
    { key: "reason", label: "Detalle" },
    { key: "amountUsdCents", label: "Monto", format: "usd" },
  ],
  "Tipo de cambio": [
    { key: "rateDate", label: "Fecha", format: "date" },
    { key: "usdToPen", label: "USD a PEN" },
    { key: "source", label: "Fuente" },
  ],
  Auditoría: [
    { key: "createdAt", label: "Fecha", format: "date" },
    { key: "actorUsername", label: "Usuario" },
    { key: "action", label: "Acción" },
    { key: "entityType", label: "Entidad" },
    { key: "reason", label: "Motivo" },
  ],
  "Datos de prueba": [
    { key: "label", label: "Lote" },
    { key: "sourceRowCount", label: "Filas fuente" },
    { key: "structuredEntityCount", label: "Registros operativos" },
    { key: "openIssueCount", label: "Observaciones" },
    { key: "createdBy", label: "Registrado por" },
    { key: "createdAt", label: "Carga", format: "date" },
  ],
};

function dollars(cents: unknown) {
  return typeof cents === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(cents / 100)
    : "—";
}

export function App() {
  const [section, setSection] =
    useState<(typeof sections)[number][0]>("Inicio");
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
  const [guideDetail, setGuideDetail] = useState<{
    guide: ApiRow;
    lots: ApiRow[];
    events: ApiRow[];
    alerts: ApiRow[];
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
  const [pageOffset, setPageOffset] = useState(0);

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
      if (section === "Inicio")
        setDashboard(await getJson<Dashboard>("/api/dashboard"));
      else if (section === "Usuarios")
        setUsers(
          (await getJson<{ items: UserAccount[] }>("/api/auth/users")).items,
        );
      else
        setData(
          await getJson<ViewData>(`${endpoint}?limit=100&offset=${pageOffset}`),
        );
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "No se pudo cargar esta sección.",
      );
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
  }, [section, username, pageOffset]);
  useEffect(() => {
    if (!username) return;
    void Promise.all([
      getJson<{ items: Array<{ id: string; gre: string }> }>(
        "/api/operations/guides?limit=200",
      ),
      getJson<{
        items: Array<{ id: string; legalName: string; type: string }>;
      }>("/api/counterparties"),
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
      const result = await sendJson<{ username: string }>(
        "/api/auth/login",
        "POST",
        {
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? ""),
        },
      );
      setUsername(result.username);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "No se pudo iniciar sesión.",
      );
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
      setPageOffset(0);
      if (section === "Guías y lotes") await refresh();
      else setSection("Guías y lotes");
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "No se pudo registrar la guía.",
      );
    }
  }
  async function openGuide(id: string) {
    try {
      setGuideDetail(await getJson(`/api/operations/guides/${id}`));
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "No se pudo abrir la guía.",
      );
    }
  }
  async function openSource(batchId: string, offset = 0) {
    try {
      setSourceData(
        await getJson(
          `/api/operations/test-data/${batchId}/source-rows?limit=100&offset=${offset}`,
        ),
      );
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "No se pudieron abrir las filas fuente.",
      );
    }
  }

  if (!authReady)
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f4f7f6] text-[#10242b]">
        Cargando sistema…
      </main>
    );
  if (!username)
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f4f7f6] p-4 text-[#10242b]">
        <form
          className="w-full max-w-md border border-[#cfdcd7] bg-white p-7 shadow-sm"
          onSubmit={authenticate}
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-[#54716f]">
            MINANTAYA
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            Ingresar al control minero
          </h1>
          <p className="mt-2 text-sm text-[#607876]">
            Usa tu nombre de usuario y contraseña.
          </p>
          {error && (
            <p className="mt-4 rounded bg-[#fff3f0] p-3 text-sm text-[#7f301f]">
              {error}
            </p>
          )}
          <label className="mt-5 grid gap-1 text-sm font-medium">
            Usuario
            <input
              className="rounded border border-[#b9cbc4] px-3 py-2"
              name="username"
              required
            />
          </label>
          <label className="mt-4 grid gap-1 text-sm font-medium">
            Contraseña
            <input
              className="rounded border border-[#b9cbc4] px-3 py-2"
              minLength={12}
              name="password"
              required
              type="password"
            />
          </label>
          <button
            className="mt-6 w-full rounded bg-[#2e6b61] px-4 py-2.5 text-sm font-semibold text-white"
            disabled={authenticating}
          >
            {authenticating ? "Validando…" : "Ingresar"}
          </button>
        </form>
      </main>
    );

  const records = data.items ?? [];
  const pagedCount =
    section === "Leyes y laboratorio"
      ? Math.max(
          data.reports?.length ?? 0,
          data.resamples?.length ?? 0,
          data.disputes?.length ?? 0,
        )
      : section === "Propuestas y liquidaciones"
        ? Math.max(data.proposals?.length ?? 0, data.settlements?.length ?? 0)
        : records.length;
  return (
    <main className="min-h-[100dvh] bg-[#f4f7f6] text-[#10242b]">
      <div className="grid min-h-[100dvh] lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-b border-[#31515a] bg-[#0d252d] p-5 text-[#e8f0ed] lg:border-r lg:border-b-0">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#a9c4ba]">
            MINANTAYA
          </p>
          <h1 className="mt-2 text-xl font-semibold">Control minero</h1>
          <p className="mt-2 text-sm text-[#b8cbc4]">
            Operación, leyes, ventas y transporte.
          </p>
          <nav className="mt-8 grid gap-1">
            {sections.map(([name]) => (
              <button
                className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium ${section === name ? "bg-[#e6f0c9] text-[#17333a]" : "text-[#c8d8d2] hover:bg-[#183941]"}`}
                key={name}
                onClick={() => {
                  setPageOffset(0);
                  setSection(name);
                }}
              >
                {name}
              </button>
            ))}
          </nav>
          <div className="mt-8 border-t border-[#31515a] pt-4 text-xs text-[#a9c4ba]">
            Sesión: {username}
            <button
              className="mt-2 block font-semibold text-[#e6f0c9] underline"
              onClick={() => void logout()}
            >
              Cerrar sesión
            </button>
          </div>
        </aside>
        <section className="px-4 py-6 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[1500px]">
            <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#d9e2df] pb-6">
              <div>
                <p className="text-sm font-medium text-[#54716f]">
                  Operación minera
                </p>
                <h2 className="mt-1 text-3xl font-semibold">{section}</h2>
                <p className="mt-2 text-sm text-[#607876]">
                  Consulta, seguimiento y trazabilidad de las filas operativas.
                </p>
              </div>
              <div className="flex gap-2">
                {section === "Guías y lotes" && (
                  <button
                    className="rounded-lg bg-[#2e6b61] px-4 py-2.5 text-sm font-semibold text-white"
                    onClick={() => setShowGuideForm(true)}
                  >
                    Registrar guía
                  </button>
                )}
                {![
                  "Inicio",
                  "Auditoría",
                  "Datos de prueba",
                  "Usuarios",
                ].includes(section) && (
                  <button
                    className="rounded-lg border border-[#2e6b61] px-4 py-2.5 text-sm font-semibold text-[#1f594f]"
                    onClick={() => setShowActionPanel((open) => !open)}
                  >
                    {showActionPanel
                      ? "Cerrar registro"
                      : "Registrar movimiento"}
                  </button>
                )}
              </div>
            </header>
            {showActionPanel && (
              <OperationActionForm
                counterparties={counterparties}
                guides={guides}
                onSaved={() => {
                  setShowActionPanel(false);
                  void refresh();
                }}
              />
            )}
            {error && (
              <p className="mt-5 rounded border border-[#c97965] bg-[#fff3f0] p-3 text-sm text-[#7f301f]">
                {error}
              </p>
            )}
            {loading && (
              <p className="mt-6 text-sm text-[#607876]">Cargando registros…</p>
            )}
            {section === "Inicio" && (
              <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Leyes pendientes", dashboard.pendingLaws],
                  ["Propuestas pendientes", dashboard.pendingProposal],
                  ["Alertas abiertas", dashboard.openAlerts],
                  ["Transporte pendiente", dashboard.missingTransportInvoice],
                ].map(([label, value]) => (
                  <article
                    className="border border-[#d9e2df] bg-white p-5"
                    key={String(label)}
                  >
                    <p className="text-xs font-semibold tracking-[0.1em] text-[#54716f]">
                      {label}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">{value}</p>
                  </article>
                ))}
              </section>
            )}
            {section === "Leyes y laboratorio" && (
              <section className="mt-7 grid gap-6">
                <div className="border border-[#d9e2df] bg-white">
                  <h3 className="border-b border-[#d9e2df] px-5 py-4 font-semibold">
                    Reportes de leyes
                  </h3>
                  <OperationsTable
                    columns={[
                      { key: "gre", label: "GRE" },
                      { key: "reportNumber", label: "Reporte" },
                      { key: "source", label: "Origen" },
                      { key: "laboratory", label: "Laboratorio" },
                      { key: "resultCount", label: "Resultados" },
                      { key: "status", label: "Estado", format: "status" },
                    ]}
                    items={data.reports ?? []}
                  />
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="border border-[#d9e2df] bg-white">
                    <h3 className="border-b border-[#d9e2df] px-5 py-4 font-semibold">
                      Remuestreos
                    </h3>
                    <OperationsTable
                      columns={[
                        { key: "gre", label: "GRE" },
                        { key: "reason", label: "Motivo" },
                        { key: "status", label: "Estado", format: "status" },
                      ]}
                      items={data.resamples ?? []}
                    />
                  </div>
                  <div className="border border-[#d9e2df] bg-white">
                    <h3 className="border-b border-[#d9e2df] px-5 py-4 font-semibold">
                      Dirimencias
                    </h3>
                    <OperationsTable
                      columns={[
                        { key: "gre", label: "GRE" },
                        { key: "reason", label: "Motivo" },
                        { key: "stage", label: "Etapa", format: "status" },
                      ]}
                      items={data.disputes ?? []}
                    />
                  </div>
                </div>
              </section>
            )}
            {section === "Propuestas y liquidaciones" && (
              <section className="mt-7 grid gap-6">
                <div className="border border-[#d9e2df] bg-white">
                  <h3 className="border-b border-[#d9e2df] px-5 py-4 font-semibold">
                    Propuestas de compra
                  </h3>
                  <OperationsTable
                    columns={[
                      { key: "gre", label: "GRE" },
                      { key: "proposalNumber", label: "Propuesta" },
                      { key: "issuedAt", label: "Fecha", format: "date" },
                      { key: "amountUsdCents", label: "Monto", format: "usd" },
                      { key: "status", label: "Estado", format: "status" },
                    ]}
                    items={data.proposals ?? []}
                  />
                </div>
                <div className="border border-[#d9e2df] bg-white">
                  <h3 className="border-b border-[#d9e2df] px-5 py-4 font-semibold">
                    Liquidaciones
                  </h3>
                  <OperationsTable
                    columns={[
                      { key: "gre", label: "GRE" },
                      { key: "grossUsdCents", label: "Bruto", format: "usd" },
                      {
                        key: "deductionsUsdCents",
                        label: "Descuentos",
                        format: "usd",
                      },
                      { key: "netUsdCents", label: "Neto", format: "usd" },
                      { key: "status", label: "Estado", format: "status" },
                    ]}
                    items={data.settlements ?? []}
                  />
                </div>
              </section>
            )}
            {[
              "Guías y lotes",
              "Facturas comerciales",
              "Transporte y pagos",
              "Descuentos",
              "Tipo de cambio",
              "Auditoría",
            ].includes(section) && (
              <section className="mt-7 border border-[#d9e2df] bg-white">
                <OperationsTable
                  columns={columns[section]}
                  items={records}
                  onRowClick={
                    section === "Guías y lotes"
                      ? (row) => void openGuide(String(row.id))
                      : undefined
                  }
                />
              </section>
            )}
            {section === "Usuarios" && (
              <section className="mt-7 border border-[#d9e2df] bg-white divide-y divide-[#e6ece9]">
                {users.map((user) => (
                  <div
                    className="flex justify-between px-5 py-4"
                    key={user.username}
                  >
                    <div>
                      <p className="font-semibold">{user.username}</p>
                      <p className="text-xs text-[#607876]">{user.role}</p>
                    </div>
                    <span className="rounded-full bg-[#d8ead5] px-2.5 py-1 text-xs font-semibold text-[#295b2c]">
                      Activo
                    </span>
                  </div>
                ))}
              </section>
            )}
            {section === "Datos de prueba" && (
              <section className="mt-7 grid gap-6">
                <div className="border border-[#d9e2df] bg-white">
                  <OperationsTable
                    columns={columns["Datos de prueba"]}
                    items={records}
                    onRowClick={(row) => void openSource(String(row.id))}
                  />
                </div>
                {sourceData && (
                  <div className="border border-[#d9e2df] bg-white">
                    <div className="border-b border-[#d9e2df] p-5">
                      <h3 className="font-semibold">
                        {String(sourceData.batch.label)}
                      </h3>
                      <p className="mt-1 text-sm text-[#607876]">
                        Filas originales del Excel y observaciones detectadas
                        sin alterar el origen.
                      </p>
                    </div>
                    <div className="p-5">
                      <h4 className="font-semibold">Observaciones</h4>
                      <OperationsTable
                        columns={[
                          { key: "severity", label: "Nivel", format: "status" },
                          { key: "category", label: "Categoría" },
                          { key: "description", label: "Detalle" },
                          { key: "sourceFile", label: "Archivo" },
                          { key: "sourceRowNumber", label: "Fila" },
                        ]}
                        items={sourceData.issues}
                      />
                      <h4 className="mt-6 font-semibold">Filas fuente</h4>
                      <OperationsTable
                        columns={[
                          { key: "sourceFile", label: "Archivo" },
                          { key: "sheetName", label: "Hoja" },
                          { key: "sourceRowNumber", label: "Fila" },
                          { key: "valuesJson", label: "Valores" },
                        ]}
                        items={sourceData.items}
                      />
                      <PageControls
                        count={sourceData.items.length}
                        limit={sourceData.limit}
                        offset={sourceData.offset}
                        onChange={(offset) =>
                          void openSource(String(sourceData.batch.id), offset)
                        }
                      />
                    </div>
                  </div>
                )}
              </section>
            )}
            {section !== "Inicio" &&
              section !== "Usuarios" &&
              data.limit !== undefined && (
                <PageControls
                  count={pagedCount}
                  limit={data.limit}
                  offset={data.offset ?? pageOffset}
                  onChange={setPageOffset}
                />
              )}
            {showGuideForm && (
              <section className="fixed inset-0 grid place-items-center bg-black/40 p-4">
                <form
                  className="w-full max-w-lg bg-white p-6 shadow-xl"
                  onSubmit={createGuide}
                >
                  <div className="flex justify-between">
                    <h3 className="text-xl font-semibold">Registrar guía</h3>
                    <button
                      onClick={() => setShowGuideForm(false)}
                      type="button"
                    >
                      Cerrar
                    </button>
                  </div>
                  <label className="mt-5 grid gap-1 text-sm font-medium">
                    Código GRE
                    <input
                      className="rounded border border-[#b9cbc4] px-3 py-2"
                      name="gre"
                      placeholder="EG07 - 500"
                      required
                    />
                  </label>
                  <label className="mt-4 grid gap-1 text-sm font-medium">
                    Fecha de emisión
                    <input
                      className="rounded border border-[#b9cbc4] px-3 py-2"
                      name="issuedAt"
                      required
                      type="date"
                    />
                  </label>
                  <label className="mt-4 grid gap-1 text-sm font-medium">
                    Lotes
                    <textarea
                      className="min-h-24 rounded border border-[#b9cbc4] px-3 py-2"
                      name="lots"
                      placeholder={"PPO 70001\nPPO 70002"}
                      required
                    />
                  </label>
                  <button className="mt-5 rounded bg-[#2e6b61] px-4 py-2 text-sm font-semibold text-white">
                    Guardar guía
                  </button>
                </form>
              </section>
            )}
            {guideDetail && (
              <section className="fixed inset-0 overflow-y-auto bg-black/40 p-4">
                <article className="mx-auto my-8 max-w-3xl bg-white p-6 shadow-xl">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.16em] text-[#54716f]">
                        TRAZABILIDAD
                      </p>
                      <h3 className="mt-1 text-2xl font-semibold">
                        {String(guideDetail.guide.gre)}
                      </h3>
                    </div>
                    <button onClick={() => setGuideDetail(null)}>Cerrar</button>
                  </div>
                  <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-[#607876]">Planta</dt>
                      <dd>{String(guideDetail.guide.plant ?? "—")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#607876]">Transportista</dt>
                      <dd>{String(guideDetail.guide.carrier ?? "—")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#607876]">Estado</dt>
                      <dd>{String(guideDetail.guide.status)}</dd>
                    </div>
                  </dl>
                  <h4 className="mt-7 font-semibold">Lotes y proveedores</h4>
                  <div className="mt-3 border border-[#d9e2df]">
                    <OperationsTable
                      columns={[
                        { key: "code", label: "Lote" },
                        { key: "sackCount", label: "Sacos" },
                        { key: "suppliers", label: "Proveedor(es)" },
                        { key: "status", label: "Estado", format: "status" },
                        { key: "withdrawalRequested", label: "Retiro" },
                      ]}
                      items={guideDetail.lots}
                    />
                  </div>
                  <h4 className="mt-7 font-semibold">Historial</h4>
                  <div className="mt-3 border border-[#d9e2df]">
                    <OperationsTable
                      columns={[
                        { key: "occurredAt", label: "Fecha", format: "date" },
                        { key: "eventType", label: "Evento" },
                        { key: "detailJson", label: "Detalle" },
                      ]}
                      items={guideDetail.events}
                    />
                  </div>
                </article>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
