# Operación minera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar un sistema operativo completo para reemplazar las hojas de guías, transporte, descuentos y facturas.

**Architecture:** Mantener Hono y D1 como fuente de verdad, ampliando rutas de lectura/escritura auditadas para cada módulo. Sustituir la pantalla única de React por vistas operativas reutilizables que consulten dichas rutas, manteniendo los datos importados como un lote trazable.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Hono, Zod, Cloudflare D1, R2, Vitest y Wrangler.

**Spec:** `docs/superpowers/specs/2026-09-19-operacion-minera.md`

## Global Constraints

- Todos los movimientos de negocio crean un registro inmutable en `audit_logs` con el usuario de sesión.
- Las reglas de estado de guía existentes se preservan y no se actualizan por una acción de lectura.
- USD es la moneda principal; las detracciones pueden conservarse en PEN.
- La carga `excel-demo-2026-09-19` sigue separada y puede eliminarse sin afectar usuarios ni auditoría.
- Cada entrega termina con pruebas, `npm run typecheck`, commit y push a `main`.

---

### Task 1: API de consulta operativa

**Files:**
- Create: `worker/operations/routes.ts`
- Modify: `worker/index.ts`
- Modify: `worker/dashboard/routes.ts`
- Test: `test/operations/operations.test.ts`

**Interfaces:**
- Produces `GET /api/operations/guides`, `/lots`, `/commercial-invoices`, `/transport-invoices`, `/quality`, `/settlements`, `/discounts`, `/test-data`.
- Consumes las tablas existentes de D1 y `AppVariables` para exigir sesión en todas las consultas.

- [ ] **Step 1: Write the failing test**

```ts
it('returns guide rows with plant, carrier, providers and lots', async () => {
  const response = await worker.fetch(new Request('https://app.test/api/operations/guides', { headers: { 'x-dev-actor': 'admin@test.pe' } }), env, createExecutionContext());
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ items: expect.any(Array) });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/operations/operations.test.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
operationsRoutes.get('/guides', async (context) => {
  const result = await context.env.DB.prepare(`SELECT guides.id, guides.gre_original AS gre FROM guides ORDER BY guides.issued_at DESC`).all();
  return context.json({ items: result.results });
});
```

- [ ] **Step 4: Extend the same pattern**

Implement the remaining seven read views with SQL joins that expose the exact operational fields needed by their tables, including source-batch counts and observations.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run test/operations/operations.test.ts && npm run typecheck`

Commit: `git commit -m "agrega consultas operativas"`

### Task 2: Guías, lotes y acciones de operación

**Files:**
- Modify: `worker/guides/routes.ts`
- Modify: `worker/guides/service.ts`
- Modify: `worker/operations/routes.ts`
- Test: `test/guides/guides.test.ts`

**Interfaces:**
- Produces guía detallada, actualización de observación, asignación de proveedor, retiro y baja auditados.
- Consumes `guide_lots`, `lot_suppliers`, `guide_events` y `alerts`.

- [ ] **Step 1: Write failing tests for detail and withdrawal**

```ts
expect((await worker.fetch(new Request(`https://app.test/api/guides/${guideId}`), env, createExecutionContext())).status).toBe(200);
expect((await worker.fetch(new Request(`https://app.test/api/guides/${guideId}/lots/${lotId}/withdrawal`, { method: 'POST', body: JSON.stringify({ reason: 'Retiro solicitado' }) }), env, createExecutionContext())).status).toBe(201);
```

- [ ] **Step 2: Implement transactions**

Use `executeAtomically` to update `guide_lots`, lot status, guide event, alert and audit row in one write.

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run test/guides/guides.test.ts && npm run typecheck`

Commit: `git commit -m "completa operaciones de guias"`

### Task 3: Calidad, remuestreo y dirimencia

**Files:**
- Modify: `worker/quality/service.ts`
- Modify: `worker/guides/routes.ts`
- Test: `test/quality/assay-reports.test.ts`
- Test: `test/quality/exceptions.test.ts`

**Interfaces:**
- Produces cierre/avance de reportes, remuestreos y dirimencias con estado y resolución.
- Consumes guías, reportes, resultados, resamples y disputes.

- [ ] **Step 1: Write failing transition tests**

```ts
expect((await worker.fetch(new Request(`https://app.test/api/guides/${guideId}/resamples/${resampleId}`, { method: 'PATCH', body: JSON.stringify({ status: 'ENVIADO_LABORATORIO' }) }), env, createExecutionContext())).status).toBe(200);
```

- [ ] **Step 2: Implement validated status transitions**

Validate allowed quality stages in Zod and write the state change and `audit_logs` row atomically.

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run test/quality && npm run typecheck`

Commit: `git commit -m "completa seguimiento de leyes"`

### Task 4: Compras, liquidaciones y descuentos

**Files:**
- Modify: `worker/settlements/routes.ts`
- Modify: `worker/operations/routes.ts`
- Test: `test/settlements/purchase-proposals.test.ts`
- Test: `test/settlements/settlements.test.ts`

**Interfaces:**
- Produces consulta de propuestas/liquidaciones, rechazo de propuesta y descuento por lote o guía.
- Consumes `purchase_proposals`, `settlements`, `settlement_lines`, `discounts` y guías.

- [ ] **Step 1: Write failing tests**

```ts
expect((await worker.fetch(new Request(`https://app.test/api/purchase-proposals/${proposalId}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'Sin conformidad de proveedor' }) }), env, createExecutionContext())).status).toBe(200);
```

- [ ] **Step 2: Implement rejection and discount creation**

Use an atomic write to change proposal state, restore the corresponding guide state when required, create the discount and audit each action.

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run test/settlements && npm run typecheck`

Commit: `git commit -m "completa liquidaciones y descuentos"`

### Task 5: Facturas, pagos, transporte y tipo de cambio

**Files:**
- Modify: `worker/finance/routes.ts`
- Modify: `worker/operations/routes.ts`
- Test: `test/finance/commercial-invoices.test.ts`
- Test: `test/finance/transport-invoices.test.ts`
- Test: `test/finance/exchange-rates.test.ts`

**Interfaces:**
- Produces listados, detalle de factura, estado pagado/anulado, pagos y lista de tipos de cambio.
- Consumes facturas comerciales, facturas de transporte, pagos, guías y `exchange_rates`.

- [ ] **Step 1: Write failing list and payment tests**

```ts
expect((await worker.fetch(new Request('https://app.test/api/operations/transport-invoices', { headers: { 'x-dev-actor': 'admin@test.pe' } }), env, createExecutionContext())).status).toBe(200);
```

- [ ] **Step 2: Implement remaining actions**

Add read endpoints and guarded cancellation routes. Reject cancellation after confirmed payments unless the payment is first annulled.

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run test/finance && npm run typecheck`

Commit: `git commit -m "completa facturas y transporte"`

### Task 6: Interfaz de operación completa

**Files:**
- Create: `src/lib/api.ts`
- Create: `src/components/OperationsTable.tsx`
- Create: `src/components/OperationDetail.tsx`
- Create: `src/components/StatusBadge.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `test/dashboard/dashboard.test.ts`

**Interfaces:**
- Consumes los endpoints de Tasks 1-5.
- Produces navegación y tablas para Inicio, Guías, Leyes, Liquidaciones, Facturas, Transporte, Descuentos, Auditoría, Datos de prueba y Usuarios.

- [ ] **Step 1: Write a failing view test**

```ts
expect(document.body.textContent).toContain('Guías');
expect(document.body.textContent).toContain('Transporte');
```

- [ ] **Step 2: Build shared primitives**

Create `api.ts` with `getJson` and `postJson`, a reusable table with loading/empty/error states, and status badges for business stages.

- [ ] **Step 3: Replace the single dashboard**

Load only the selected module, show filters and details, and connect creation/action forms to the audited routes.

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm test && npm run build`

Commit: `git commit -m "crea interfaz operativa"`

### Task 7: Validación de producción y retiro de prueba

**Files:**
- Modify: `scripts/prepare_excel_test_data.py`
- Modify: `README.md`
- Test: `test/operations/operations.test.ts`

**Interfaces:**
- Documents batch `excel-demo-2026-09-19` and the exact non-destructive removal operation.

- [ ] **Step 1: Verify source and structured counts**

Run the generator and assert `sourceRows === 1002`, `guides === 197`, `lots === 264`, and `orphan_links === 0` against D1.

- [ ] **Step 2: Document the reversible operation**

Document that cleanup preserves users, sessions, audit logs, plants and counterparties.

- [ ] **Step 3: Deploy and verify**

Run: `npx wrangler whoami && npm run deploy`, then authenticate with an administrator and verify every navigation view loads.

- [ ] **Step 4: Commit**

Commit: `git commit -m "documenta operacion completa"`

## Self-Review

- Spec coverage: Tasks 1-6 cover every operational flow, the imported data, all Excel sections, audit and administration. Task 7 covers deployment and reversible demonstration data.
- Placeholder scan: each task identifies files, interfaces, test command and a concrete implementation action.
- Type consistency: the API is grouped under `/api/operations` for reads; existing write endpoints remain their domain routes and all interfaces use D1 IDs.
