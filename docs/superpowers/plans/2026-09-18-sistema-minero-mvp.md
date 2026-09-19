# Sistema minero MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el MVP interno para trazabilidad de guías, lotes, leyes, liquidaciones, facturas, transporte y auditoría.

**Architecture:** React sirve la interfaz como SPA mediante Vite y Workers Static Assets. Un Worker TypeScript expone `/api/*`, aplica las reglas de negocio y es el único acceso a D1 y R2. D1 contiene el modelo relacional y sus migraciones SQL; R2 conserva los documentos y D1 sus metadatos.

**Tech Stack:** TypeScript, React, Vite, Cloudflare Workers, Wrangler, D1, R2, Hono, Zod, Vitest, `@cloudflare/vitest-pool-workers`, Playwright y Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-18-sistema-minero-design.md`

## Global Constraints

- Usar React SPA, Worker API y D1 local durante el desarrollo; no crear ni modificar recursos remotos antes de verificar la cuenta de Cloudflare indicada por el usuario.
- Guardar toda evolución de esquema en `migrations/` y aplicarla con Wrangler antes de probar las rutas que dependen de ella.
- Usar el GRE normalizado como identificador técnico único y conservar el código original para pantalla y documentos.
- Ejecutar una prueba que falle antes de agregar cada comportamiento de producción.
- Toda mutación debe crear un evento de auditoría inmutable con actor, fecha, tipo de acción, datos previos y posteriores.
- Tratar bajas y retiros como estados/eventos; nunca eliminar físicamente una guía, lote, factura o pago desde la API.
- Limitar la facturación comercial a cuatro lotes y alertar, sin bloquear, al superar seis lotes por guía.
- No registrar credenciales, tokens, RUCs de pruebas ni documentos de empresa en Git.

---

### Task 1: Crear el proyecto Cloudflare local y la base de calidad

**Files:**
- Create: `package.json`
- Create: `wrangler.jsonc`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.worker.json`
- Create: `worker/index.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `test/vitest.config.ts`
- Create: `test/setup.ts`
- Create: `playwright.config.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Env` con binding `DB: D1Database`, binding `DOCUMENTS: R2Bucket` y variable `APP_ENV`.
- Produces: scripts `dev`, `test`, `test:unit`, `test:integration`, `test:e2e`, `typecheck`, `lint`, `build`, `db:migrate:local` y `deploy`.

- [ ] **Step 1: Escribir una prueba de humo que espere una API inexistente**

```ts
import { describe, expect, it } from 'vitest';
import worker from '../worker';

describe('worker', () => {
  it('returns a health payload from /api/health', async () => {
    const response = await worker.fetch(new Request('http://example.test/api/health'), {} as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Ejecutar la prueba para verificar el fallo esperado**

Run: `pnpm test:unit worker/index.test.ts`

Expected: FAIL porque `worker/index.ts` y la ruta de salud no existen.

- [ ] **Step 3: Crear el scaffold oficial React + Workers y configurar los comandos locales**

Crear el scaffold con `pnpm create cloudflare@latest . --framework=react`, preservando `Recursos/` y la documentación. Configurar `wrangler.jsonc` con nombre `minantaya-sistema`, `compatibility_date` `2026-09-18`, binding D1 local con nombre `MINANTAYA_DB` y binding R2 `DOCUMENTS`. Añadir Hono, Zod, Tailwind, Vitest, el pool de Workers y Playwright como dependencias de proyecto. Añadir `.dev.vars` y artefactos de prueba a `.gitignore`.

- [ ] **Step 4: Implementar el Worker mínimo**

```ts
import { Hono } from 'hono';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (context) => context.json({ status: 'ok' }));

export default app;
```

- [ ] **Step 5: Verificar pruebas, tipos y build**

Run: `pnpm test:unit && pnpm typecheck && pnpm build`

Expected: PASS sin advertencias de tipos ni dependencias faltantes.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml wrangler.jsonc vite.config.ts tsconfig.json tsconfig.worker.json worker src test playwright.config.ts .gitignore
git commit -m "crea base cloudflare"
```

### Task 2: Definir el esquema D1 y aplicar la migración local

**Files:**
- Create: `migrations/0001_initial_schema.sql`
- Create: `migrations/0002_audit_guards.sql`
- Create: `worker/db/schema.ts`
- Create: `worker/db/client.ts`
- Create: `test/db/schema.test.ts`

**Interfaces:**
- Produces: tablas `plants`, `counterparties`, `routes`, `transport_rates`, `exchange_rates`, `guides`, `lots`, `guide_lots`, `lot_suppliers`, `guide_events`, `assay_reports`, `assay_results`, `resamples`, `disputes`, `purchase_proposals`, `settlements`, `settlement_lines`, `discounts`, `commercial_invoices`, `commercial_invoice_lots`, `transport_invoices`, `transport_invoice_guides`, `payments`, `documents`, `alerts` y `audit_logs`.
- Produces: `executeAtomically(db, statements): Promise<D1Result<unknown>[]>` para escribir mutación y auditoría en un único lote D1.

- [ ] **Step 1: Escribir la prueba de esquema que espere GRE único y auditoría protegida**

```ts
it('rejects a second guide with the same normalized GRE', async () => {
  await db.prepare('INSERT INTO guides (id, gre_original, gre_normalized, status, issued_at) VALUES (?, ?, ?, ?, ?)')
    .bind('g1', 'EG07 - 365', 'EG07-365', 'EMITIDA', '2026-09-18T00:00:00.000Z').run();
  await expect(db.prepare('INSERT INTO guides (id, gre_original, gre_normalized, status, issued_at) VALUES (?, ?, ?, ?, ?)')
    .bind('g2', 'EG07 365', 'EG07-365', 'EMITIDA', '2026-09-18T00:00:00.000Z').run()).rejects.toThrow();
});
```

- [ ] **Step 2: Ejecutar la prueba para verificar el fallo esperado**

Run: `pnpm test:integration test/db/schema.test.ts`

Expected: FAIL porque no existen las tablas ni las migraciones.

- [ ] **Step 3: Escribir las migraciones SQL**

Usar claves TEXT UUID, fechas ISO UTC, `created_at`, `updated_at` y eliminación lógica cuando aplique. Incluir restricciones `CHECK` para estados, montos no negativos, porcentaje de detracción entre 0 y 1 y tipos de tarifa. Añadir índices para `guides.gre_normalized`, `lots.code`, fechas, estados, claves foráneas y `audit_logs.entity_id`. En `0002_audit_guards.sql`, bloquear `UPDATE` y `DELETE` en `audit_logs` con triggers `BEFORE UPDATE` y `BEFORE DELETE` que ejecuten `RAISE(ABORT, 'audit_logs are immutable')`.

- [ ] **Step 4: Aplicar la migración únicamente sobre D1 local**

Run: `pnpm db:migrate:local`

Expected: `0001_initial_schema.sql` y `0002_audit_guards.sql` aplicadas a `.wrangler/state`.

- [ ] **Step 5: Implementar el cliente de repositorio y ejecutar la prueba verde**

```ts
export function executeAtomically(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<D1Result<unknown>[]> {
  return db.batch(statements);
}
```

Generar identificadores antes de escribir. Cada alta, actualización o cambio de estado debe preparar su sentencia de entidad y su sentencia de auditoría antes de llamar a `executeAtomically`, para que ambas operaciones se confirmen o fallen juntas.

- [ ] **Step 6: Ejecutar integración y scan SQL**

Run: `pnpm test:integration test/db/schema.test.ts && pnpm exec wrangler d1 migrations list MINANTAYA_DB --local`

Expected: PASS y ninguna migración local pendiente.

- [ ] **Step 7: Commit**

```bash
git add migrations worker/db test/db package.json
git commit -m "crea esquema d1"
```

### Task 3: Implementar identidad de administrador y auditoría de mutaciones

**Files:**
- Create: `worker/auth/actor.ts`
- Create: `worker/audit/audit-log.ts`
- Create: `worker/http/errors.ts`
- Create: `worker/http/middleware.ts`
- Create: `test/auth/actor.test.ts`
- Create: `test/audit/audit-log.test.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Produces: `type Actor = { email: string; source: 'access' | 'local' }`.
- Produces: `resolveActor(request, accessIdentity, appEnv): Promise<Actor>`.
- Produces: `writeAuditLog(input: AuditInput): Promise<void>`.

- [ ] **Step 1: Escribir pruebas fallidas de identidad**

```ts
it('accepts the local actor header only in development', async () => {
  await expect(resolveActor(new Request('https://app.test', { headers: { 'x-dev-actor': 'admin@test.pe' } }), undefined, 'development'))
    .resolves.toEqual({ email: 'admin@test.pe', source: 'local' });
  await expect(resolveActor(new Request('https://app.test', { headers: { 'x-dev-actor': 'admin@test.pe' } }), undefined, 'production'))
    .rejects.toMatchObject({ status: 403 });
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:unit test/auth/actor.test.ts`

Expected: FAIL porque no existe `resolveActor`.

- [ ] **Step 3: Implementar autenticación y middleware de auditoría**

Resolver el correo desde `ctx.access.getIdentity()` en producción. Aceptar `x-dev-actor` solo si `APP_ENV === 'development'`. Rechazar mutaciones sin actor con respuesta JSON `403`. Cada handler mutante deberá recibir `Actor` desde el contexto, preparar el cambio y `writeAuditLog` con el mismo identificador generado, y enviarlos juntos mediante `executeAtomically`.

- [ ] **Step 4: Implementar la prueba de auditoría**

```ts
it('records before and after JSON for a guide status change', async () => {
  await writeAuditLog({ db, actor: { email: 'admin@test.pe', source: 'local' }, entityType: 'guide', entityId: 'g1', action: 'STATUS_CHANGED', before: { status: 'EMITIDA' }, after: { status: 'EN_PLANTA' } });
  const row = await db.prepare('SELECT actor_email, action, before_json, after_json FROM audit_logs WHERE entity_id = ?').bind('g1').first();
  expect(row).toMatchObject({ actor_email: 'admin@test.pe', action: 'STATUS_CHANGED' });
});
```

- [ ] **Step 5: Ejecutar las pruebas y verificar que el trigger conserva la inmutabilidad**

Run: `pnpm test:unit test/auth/actor.test.ts && pnpm test:integration test/audit/audit-log.test.ts`

Expected: PASS y una actualización directa a `audit_logs` rechazada por D1.

- [ ] **Step 6: Commit**

```bash
git add worker/auth worker/audit worker/http worker/index.ts test/auth test/audit
git commit -m "agrega auditoria"
```

### Task 4: Crear el dominio de guías, lotes y eventos operativos

**Files:**
- Create: `worker/guides/normalize-gre.ts`
- Create: `worker/guides/guide.schema.ts`
- Create: `worker/guides/guide.repository.ts`
- Create: `worker/guides/guide.service.ts`
- Create: `worker/guides/guide.routes.ts`
- Create: `test/guides/normalize-gre.test.ts`
- Create: `test/guides/guide.service.test.ts`
- Create: `test/guides/guide.routes.test.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Produces: `normalizeGre(value: string): string`.
- Produces: `createGuide(input: CreateGuideInput, actor: Actor): Promise<Guide>`.
- Produces: `addLot(guideId: string, input: AddLotInput, actor: Actor): Promise<{ lot: Lot; warnings: string[] }>`.
- Produces: rutas `/api/guides`, `/api/guides/:id`, `/api/guides/:id/lots` y `/api/guides/:id/events`.

- [ ] **Step 1: Escribir pruebas fallidas de normalización y límite de lotes**

```ts
it.each([[' EG07 - 365 ', 'EG07-365'], ['eg07 365', 'EG07-365']])('normalizes %s', (raw, expected) => {
  expect(normalizeGre(raw)).toBe(expected);
});

it('returns a warning instead of rejecting the seventh lot', async () => {
  const result = await addLot(existingGuideId, validLotInput, actor);
  expect(result.warnings).toContain('La guía supera el máximo configurado de 6 lotes');
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:unit test/guides/normalize-gre.test.ts test/guides/guide.service.test.ts`

Expected: FAIL porque no existe el dominio de guías.

- [ ] **Step 3: Implementar esquemas, repositorio y servicio**

Validar con Zod que GRE, planta, fecha y tipo de guía existen. Modelar tipos `NORMAL`, `RETIRO`, `REINGRESO` y `COMPRA`. Modelar eventos `BAJA`, `RETIRO`, `REINGRESO`, `CAMBIO_RUTA` y `LOTE_VOLADO`; exigir motivo en todos salvo alta normal. Evitar lotes duplicados activos y crear auditoría para cada escritura.

- [ ] **Step 4: Escribir la prueba de ruta de alta auditada**

```ts
it('creates a guide and writes its audit event', async () => {
  const response = await app.request('/api/guides', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ gre: 'EG07 - 365', plantId, issuedAt: '2026-09-18T00:00:00.000Z', type: 'NORMAL' }) }, env);
  expect(response.status).toBe(201);
  expect(await countAuditEntries(env.DB, 'guide', 'CREATED')).toBe(1);
});
```

- [ ] **Step 5: Ejecutar unitarias e integración**

Run: `pnpm test:unit test/guides && pnpm test:integration test/guides/guide.routes.test.ts`

Expected: PASS; el séptimo lote conserva la operación y registra alerta/auditoría.

- [ ] **Step 6: Commit**

```bash
git add worker/guides test/guides worker/index.ts
git commit -m "agrega control de guias"
```

### Task 5: Implementar reportes de leyes, remuestreo y dirimencia

**Files:**
- Create: `worker/quality/assay.schema.ts`
- Create: `worker/quality/assay.service.ts`
- Create: `worker/quality/assay.routes.ts`
- Create: `worker/quality/dispute.service.ts`
- Create: `test/quality/assay.service.test.ts`
- Create: `test/quality/assay.routes.test.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Produces: `createAssayReport`, `sendAssayToSupplier`, `recordSupplierDecision`, `startResample` y `advanceDisputeStep`.
- Produces: rutas `/api/assay-reports`, `/api/assay-reports/:id/send`, `/api/resamples` y `/api/disputes/:id/steps`.

- [ ] **Step 1: Escribir prueba fallida de SLA y bloqueo de liquidación**

```ts
it('marks a report overdue after two business days', () => {
  expect(computeAssayDueAt('2026-09-18T10:00:00.000Z', 2)).toBe('2026-09-22T10:00:00.000Z');
});

it('rejects final settlement while a resample is open', async () => {
  await expect(assertLotsCanSettle([lotWithOpenResample])).rejects.toThrow('El lote tiene un remuestreo pendiente');
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:unit test/quality/assay.service.test.ts`

Expected: FAIL porque no existen las reglas de calidad.

- [ ] **Step 3: Implementar las reglas de calidad**

Usar calendario de lunes a viernes para el SLA configurable. Un reporte transita por `PENDIENTE`, `RECIBIDO`, `ENVIADO_PROVEEDOR`, `APROBADO`, `OBSERVADO` y `VENCIDO`. Un remuestreo abre un caso vinculado a lotes y bloquea su liquidación final. La dirimencia tendrá exactamente cinco registros ordenados y configurables en `dispute_steps`, sin nombres codificados.

- [ ] **Step 4: Escribir prueba de decisión del proveedor y auditoría**

```ts
it('allows a purchase proposal only after provider approval', async () => {
  await sendAssayToSupplier(reportId, actor);
  await recordSupplierDecision(reportId, { decision: 'APROBADO' }, actor);
  await expect(createPurchaseProposal({ reportId, lotIds }, actor)).resolves.toMatchObject({ status: 'BORRADOR' });
});
```

- [ ] **Step 5: Ejecutar pruebas completas del módulo**

Run: `pnpm test:unit test/quality && pnpm test:integration test/quality/assay.routes.test.ts`

Expected: PASS y todas las acciones emiten auditoría.

- [ ] **Step 6: Commit**

```bash
git add worker/quality test/quality worker/index.ts migrations
git commit -m "agrega control de leyes"
```

### Task 6: Implementar liquidaciones, descuentos y tipo de cambio

**Files:**
- Create: `worker/finance/money.ts`
- Create: `worker/finance/settlement.schema.ts`
- Create: `worker/finance/settlement.service.ts`
- Create: `worker/finance/settlement.routes.ts`
- Create: `test/finance/settlement.service.test.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Produces: `calculateTransportDiscount`, `createSettlement` y `recordExchangeRate`.
- Produces: rutas `/api/exchange-rates`, `/api/settlements` y `/api/settlements/:id`.

- [ ] **Step 1: Escribir pruebas fallidas de descuento y snapshot de cambio**

```ts
it('calculates a per-ton discount in USD', () => {
  expect(calculateTransportDiscount({ mode: 'PER_TON', tonnes: 5.86, rateUsd: 60 })).toBe(351.6);
});

it('keeps the applied exchange rate after the daily source changes', async () => {
  const settlement = await createSettlement(validInputWithRate('3.411'), actor);
  await recordExchangeRate({ date: '2026-09-18', value: '3.500', source: 'CAJA_AREQUIPA' }, actor);
  expect((await findSettlement(settlement.id)).exchangeRateApplied).toBe('3.411');
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:unit test/finance/settlement.service.test.ts`

Expected: FAIL porque aún no existe cálculo financiero.

- [ ] **Step 3: Implementar dinero con decimales exactos y reglas de descuento**

Representar montos monetarios como enteros de centavos en D1 y operar con una librería decimal en TypeScript. Permitir descuentos por TMH y viaje. Congelar tarifa y tipo de cambio aplicado al crear la liquidación. Rechazar liquidaciones para lotes anulados, retirados o con remuestreo abierto.

- [ ] **Step 4: Ejecutar pruebas de negocio e integración de ruta**

Run: `pnpm test:unit test/finance/settlement.service.test.ts && pnpm test:integration test/finance`

Expected: PASS, montos reproducibles y auditoría en cada alta o ajuste.

- [ ] **Step 5: Commit**

```bash
git add worker/finance test/finance worker/index.ts migrations
git commit -m "agrega liquidaciones"
```

### Task 7: Implementar facturación comercial, transporte y pagos

**Files:**
- Create: `worker/invoices/invoice.schema.ts`
- Create: `worker/invoices/commercial-invoice.service.ts`
- Create: `worker/invoices/transport-invoice.service.ts`
- Create: `worker/invoices/payment.service.ts`
- Create: `worker/invoices/invoice.routes.ts`
- Create: `test/invoices/commercial-invoice.service.test.ts`
- Create: `test/invoices/transport-invoice.service.test.ts`
- Create: `test/invoices/payment.service.test.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Produces: `createCommercialInvoice`, `createTransportInvoice`, `recordPayment` y `getGuideFinancialCoverage`.
- Produces: rutas `/api/commercial-invoices`, `/api/transport-invoices`, `/api/payments` y `/api/guides/:id/financial-coverage`.

- [ ] **Step 1: Escribir las pruebas fallidas de reglas de facturación**

```ts
it('rejects a commercial invoice with five lots', async () => {
  await expect(createCommercialInvoice({ ...validInvoice, lotIds: ['1', '2', '3', '4', '5'] }, actor))
    .rejects.toThrow('Una factura comercial solo puede incluir hasta 4 lotes');
});

it('marks an active guide uncovered when it has no transport invoice', async () => {
  await expect(getGuideFinancialCoverage(activeGuideId)).resolves.toMatchObject({ transportCovered: false });
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:unit test/invoices/commercial-invoice.service.test.ts test/invoices/transport-invoice.service.test.ts`

Expected: FAIL porque no hay servicios de facturación.

- [ ] **Step 3: Implementar facturas y pagos parciales**

Registrar detracción comercial de 10 % y detracción de transporte de 4 % como snapshots configurables. Asociar factura comercial a uno hasta cuatro lotes y factura de transporte a una o más guías. Permitir pagos parciales por componente `FACTURA`, `DETRACCION_COMERCIAL` y `DETRACCION_TRANSPORTE`; derivar estado de pago desde la suma confirmada, nunca desde texto manual.

- [ ] **Step 4: Escribir prueba de pago parcial auditado**

```ts
it('keeps the transport invoice pending until invoice and detraction components are paid', async () => {
  await recordPayment({ invoiceId, component: 'FACTURA', amountCents: 960000 }, actor);
  expect((await findTransportInvoice(invoiceId)).paymentStatus).toBe('PENDIENTE');
  await recordPayment({ invoiceId, component: 'DETRACCION_TRANSPORTE', amountCents: 40000 }, actor);
  expect((await findTransportInvoice(invoiceId)).paymentStatus).toBe('PAGADO');
});
```

- [ ] **Step 5: Ejecutar pruebas unitarias e integración**

Run: `pnpm test:unit test/invoices && pnpm test:integration test/invoices`

Expected: PASS, límite de cuatro lotes aplicado y pagos incompletos visibles.

- [ ] **Step 6: Commit**

```bash
git add worker/invoices test/invoices worker/index.ts migrations
git commit -m "agrega facturacion"
```

### Task 8: Crear alertas, dashboard y tareas programadas

**Files:**
- Create: `worker/alerts/alert.service.ts`
- Create: `worker/alerts/alert.routes.ts`
- Create: `worker/dashboard/dashboard.service.ts`
- Create: `worker/dashboard/dashboard.routes.ts`
- Create: `worker/scheduled.ts`
- Create: `test/alerts/alert.service.test.ts`
- Create: `test/dashboard/dashboard.service.test.ts`
- Modify: `worker/index.ts`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Produces: `evaluateAlerts(now: Date): Promise<Alert[]>` y `getDashboard(): Promise<DashboardSummary>`.
- Produces: rutas `/api/alerts`, `/api/dashboard` y cron diario.

- [ ] **Step 1: Escribir pruebas fallidas de alertas**

```ts
it('creates one alert for an assay report that passed its due date', async () => {
  await seedAssayReport({ status: 'PENDIENTE', dueAt: '2026-09-17T10:00:00.000Z' });
  const alerts = await evaluateAlerts(new Date('2026-09-18T10:00:00.000Z'));
  expect(alerts).toContainEqual(expect.objectContaining({ kind: 'REPORTE_LEYES_VENCIDO' }));
});

it('does not duplicate an unresolved alert on a second scheduled run', async () => {
  await evaluateAlerts(now);
  await evaluateAlerts(now);
  expect(await countOpenAlerts('REPORTE_LEYES_VENCIDO')).toBe(1);
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:unit test/alerts/alert.service.test.ts`

Expected: FAIL porque no existe la evaluación de alertas.

- [ ] **Step 3: Implementar evaluación idempotente**

Detectar reportes de leyes vencidos, guías sin factura comercial cuando corresponda, guías sin cobertura de transporte, pagos pendientes y guías con estado bloqueante. Usar clave compuesta de entidad, tipo y estado para no duplicar alertas abiertas. El cron llama a `evaluateAlerts` sin exponer una ruta pública.

- [ ] **Step 4: Ejecutar pruebas y validar configuración local**

Run: `pnpm test:unit test/alerts test/dashboard && pnpm typecheck`

Expected: PASS y el cron configurado sin acceder a recursos remotos.

- [ ] **Step 5: Commit**

```bash
git add worker/alerts worker/dashboard worker/scheduled.ts test/alerts test/dashboard worker/index.ts wrangler.jsonc
git commit -m "agrega alertas"
```

### Task 9: Construir la interfaz base y panel de alertas

**Files:**
- Create: `src/lib/api.ts`
- Create: `src/lib/format.ts`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/AlertList.tsx`
- Create: `src/features/dashboard/DashboardPage.tsx`
- Create: `src/features/dashboard/dashboard.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `api.getDashboard(): Promise<DashboardSummary>` y `api.getAlerts(): Promise<Alert[]>`.
- Produces: navegación a Inicio, Guías, Leyes, Liquidaciones, Facturas y Auditoría.

- [ ] **Step 1: Escribir prueba fallida de panel**

```tsx
it('shows open alerts and their linked GRE', async () => {
  render(<DashboardPage api={{ getDashboard: async () => summary, getAlerts: async () => [{ id: 'a1', kind: 'TRANSPORTE_FALTANTE', guideGre: 'EG07-365', status: 'ABIERTA' }] }} />);
  expect(await screen.findByText('EG07-365')).toBeInTheDocument();
  expect(screen.getByText('Transporte faltante')).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:unit src/features/dashboard/dashboard.test.tsx`

Expected: FAIL porque no existe `DashboardPage`.

- [ ] **Step 3: Implementar interfaz accesible**

Crear una barra lateral de navegación, cabecera con correo del actor y panel de contadores. Usar etiquetas visibles, foco discernible, tablas responsivas y estados de carga/error. No usar color como único indicador de estado.

- [ ] **Step 4: Ejecutar pruebas de componente y build**

Run: `pnpm test:unit src/features/dashboard/dashboard.test.tsx && pnpm build`

Expected: PASS y assets generados correctamente.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "crea panel inicial"
```

### Task 10: Construir gestión de guías y trazabilidad de lote

**Files:**
- Create: `src/features/guides/GuideListPage.tsx`
- Create: `src/features/guides/GuideForm.tsx`
- Create: `src/features/guides/GuideDetailPage.tsx`
- Create: `src/features/guides/LotForm.tsx`
- Create: `src/features/guides/guides.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `/api/guides` y `/api/guides/:id`.
- Produces: búsqueda por GRE, lote, proveedor, planta, transportista, estado y fechas; alta y detalle de guía.

- [ ] **Step 1: Escribir prueba fallida de advertencia de séptimo lote**

```tsx
it('shows the sixth-lot policy warning returned by the API', async () => {
  render(<LotForm guideId="g1" api={apiReturningSeventhLotWarning} />);
  await userEvent.click(screen.getByRole('button', { name: 'Agregar lote' }));
  expect(await screen.findByText('La guía supera el máximo configurado de 6 lotes')).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:unit src/features/guides/guides.test.tsx`

Expected: FAIL porque no existe el formulario de lote.

- [ ] **Step 3: Implementar listas, formulario y detalle**

El detalle presenta línea de tiempo de eventos, proveedores asociados, lotes, estado de leyes, cobertura financiera y documentos. El formulario normaliza el GRE antes de enviar pero muestra siempre el valor original. Para baja, retiro, reingreso y lote volado se exige motivo.

- [ ] **Step 4: Ejecutar pruebas de interfaz**

Run: `pnpm test:unit src/features/guides/guides.test.tsx && pnpm typecheck`

Expected: PASS y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add src/features/guides src/App.tsx
git commit -m "crea interfaz de guias"
```

### Task 11: Construir pantallas de leyes y finanzas

**Files:**
- Create: `src/features/quality/AssayReportPage.tsx`
- Create: `src/features/quality/ResampleDialog.tsx`
- Create: `src/features/finance/SettlementPage.tsx`
- Create: `src/features/finance/InvoicePage.tsx`
- Create: `src/features/finance/PaymentForm.tsx`
- Create: `src/features/quality/quality.test.tsx`
- Create: `src/features/finance/finance.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: rutas de calidad, liquidaciones, facturas y pagos de Tasks 5 a 7.
- Produces: aprobación de leyes, inicio de remuestreo, liquidación, facturación y registro de pagos desde la interfaz.

- [ ] **Step 1: Escribir prueba fallida de bloqueo por remuestreo**

```tsx
it('disables settlement confirmation for a lot with an open resample', async () => {
  render(<SettlementPage api={apiWithOpenResample} />);
  expect(await screen.findByText('Remuestreo pendiente')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirmar liquidación' })).toBeDisabled();
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:unit src/features/quality/quality.test.tsx src/features/finance/finance.test.tsx`

Expected: FAIL porque aún no existen estas pantallas.

- [ ] **Step 3: Implementar formularios financieros y de calidad**

Mostrar TMH, tarifa aplicada, tipo de cambio congelado, descuento, detracciones y estado de cada componente de pago. El formulario de factura comercial impide seleccionar más de cuatro lotes. La pantalla de remuestreo explica el bloqueo y permite adjuntar evidencia posteriormente.

- [ ] **Step 4: Ejecutar pruebas de interfaz**

Run: `pnpm test:unit src/features/quality src/features/finance && pnpm build`

Expected: PASS y todos los estados de bloqueo visibles para el administrador.

- [ ] **Step 5: Commit**

```bash
git add src/features/quality src/features/finance src/App.tsx
git commit -m "crea gestion financiera"
```

### Task 12: Implementar carga de documentos y consulta de auditoría

**Files:**
- Create: `worker/documents/document.service.ts`
- Create: `worker/documents/document.routes.ts`
- Create: `worker/audit/audit.routes.ts`
- Create: `src/features/audit/AuditPage.tsx`
- Create: `src/features/documents/DocumentUpload.tsx`
- Create: `test/documents/document.service.test.ts`
- Create: `src/features/audit/audit.test.tsx`
- Modify: `worker/index.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `uploadDocument`, `listDocumentsForEntity` y `listAuditLogs`.
- Produces: rutas `/api/documents`, `/api/entities/:type/:id/documents` y `/api/audit-logs`.

- [ ] **Step 1: Escribir prueba fallida de clave R2 y auditoría**

```ts
it('stores a document under the guide prefix and audits the attachment', async () => {
  const document = await uploadDocument({ entityType: 'guide', entityId: 'g1', filename: 'acta.pdf', contentType: 'application/pdf', body: new Uint8Array([1, 2]) }, actor);
  expect(document.objectKey).toMatch(/^guides\/g1\//);
  expect(await countAuditEntries(env.DB, 'document', 'ATTACHED')).toBe(1);
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:integration test/documents/document.service.test.ts`

Expected: FAIL porque no existe servicio R2.

- [ ] **Step 3: Implementar uploads con validación**

Permitir PDF, XLSX, PNG y JPG hasta el límite configurado. Generar claves sin usar el nombre original como ruta. Guardar hash, tamaño, tipo MIME, actor y fecha en D1. Rechazar archivos sin entidad válida o sin actor autenticado.

- [ ] **Step 4: Implementar auditoría paginada en la interfaz**

Permitir filtros por entidad, acción, actor y fecha. Mostrar antes/después JSON en un panel legible y de solo lectura.

- [ ] **Step 5: Ejecutar pruebas**

Run: `pnpm test:integration test/documents/document.service.test.ts && pnpm test:unit src/features/audit/audit.test.tsx`

Expected: PASS, sin posibilidad de editar o borrar registros de auditoría desde la UI.

- [ ] **Step 6: Commit**

```bash
git add worker/documents worker/audit src/features/audit src/features/documents test/documents src/App.tsx
git commit -m "agrega documentos y logs"
```

### Task 13: Validar el recorrido crítico y preparar el despliegue

**Files:**
- Create: `e2e/guide-to-payment.spec.ts`
- Create: `README.md`
- Create: `.env.example`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Produces: guía de desarrollo local, migraciones locales, pruebas y procedimiento seguro de despliegue.
- Produces: prueba E2E de guía a pago y pruebas de autorización.

- [ ] **Step 1: Escribir la prueba E2E fallida del recorrido principal**

```ts
test('tracks a guide from issue through transport payment', async ({ page }) => {
  await page.goto('/guides');
  await page.getByRole('button', { name: 'Nueva guía' }).click();
  await page.getByLabel('Código GRE').fill('EG07 - 900');
  await page.getByRole('button', { name: 'Guardar guía' }).click();
  await expect(page.getByText('EG07 - 900')).toBeVisible();
  await expect(page.getByText('Factura de transporte pendiente')).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar para confirmar el fallo esperado**

Run: `pnpm test:e2e e2e/guide-to-payment.spec.ts`

Expected: FAIL hasta que el flujo local y la interfaz estén conectados.

- [ ] **Step 3: Conectar fixture local, completar el recorrido y documentar operaciones**

Configurar Playwright para iniciar `pnpm dev` con D1 local aislada. Documentar `pnpm db:migrate:local`, `pnpm test`, `pnpm dev`, `pnpm build` y el procedimiento de producción: confirmar usuario de Wrangler, ejecutar `wrangler whoami`, crear D1/R2, reemplazar IDs de bindings, regenerar tipos y aplicar migraciones remotas. No incluir tokens ni ejecutar comandos remotos durante este task.

- [ ] **Step 4: Ejecutar la suite de QA**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm test:e2e`

Expected: PASS completo; documentar cualquier limitación de Access que solo pueda verificarse tras configurar la cuenta remota.

- [ ] **Step 5: Revisar cambios y commit**

```bash
git diff --check
git status --short
git add e2e README.md .env.example wrangler.jsonc
git commit -m "prepara validacion final"
```

## Verificación del plan

- El esquema, autenticación, auditoría, guías, calidad, liquidaciones, facturación, alertas, interfaz, documentos y pruebas E2E están cubiertos por Tasks 1 a 13.
- La única información pendiente para producción es la configuración externa de Cloudflare Access y la cuenta correcta de Wrangler. No bloquea el desarrollo ni las pruebas locales.
- No hay tareas diferidas, pasos con marcadores ambiguos ni referencias a interfaces sin una tarea productora.
