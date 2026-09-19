# Sistema MINANTAYA

Sistema interno para la trazabilidad de transporte y comercialización de minerales. Centraliza la operación que antes se controlaba en Excel, usando la guía de remisión (GRE) como eje de cada operación.

## Capacidades del MVP

- Guías GRE, lotes, bajas, retiros y cambios de estado con historial.
- Reportes de leyes, re-muestreo y dirimencia.
- Propuestas de compra, aprobación y liquidaciones con descuentos.
- Facturas comerciales, máximo cuatro lotes por factura, facturas de transporte y pagos.
- Tipo de cambio diario de Caja Arequipa.
- Alertas de operación, tablero de pendientes y registro de auditoría inmutable.
- Documentos en R2 vinculados a guías.

## Tecnologías

- React + Vite + Tailwind CSS.
- Cloudflare Workers + Hono.
- Cloudflare D1 con migraciones Wrangler.
- Cloudflare R2 para documentos.
- Vitest para pruebas de Worker y D1.

## Desarrollo local

```powershell
pnpm install
pnpm db:migrate:local
pnpm dev
```

La aplicación queda disponible en `http://127.0.0.1:5173`. En desarrollo, las mutaciones usan el encabezado local `x-dev-actor`; en producción se resuelve la identidad con Cloudflare Access.

## Validación

```powershell
pnpm test
pnpm typecheck
pnpm build
```

## Base de datos

Las migraciones viven en `migrations/`. Para aplicarlas al almacenamiento local:

```powershell
pnpm db:migrate:local
```

No se deben editar manualmente las tablas o registros productivos. Las bajas, retiros, anulaciones y pagos se registran como eventos o estados, nunca mediante borrado físico.

## Despliegue Cloudflare

Antes del primer despliegue se debe autenticar Wrangler con la cuenta autorizada, crear D1 y R2, actualizar sus identificadores en `wrangler.jsonc`, aplicar migraciones remotas y activar Cloudflare Access. No se incluyen credenciales, documentos de empresa ni bases locales en el repositorio.
