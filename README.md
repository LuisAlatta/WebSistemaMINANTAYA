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

La aplicación queda disponible en `http://127.0.0.1:5173`. Para usar el acceso local por primera vez, define `BOOTSTRAP_SECRET` en un archivo `.dev.vars` que no se versiona y usa la misma clave en la pantalla de creación inicial.

## Usuarios y auditoría

- El sistema usa nombres de usuario, no correos electrónicos.
- Solo existen dos cuentas con rol administrador total.
- Cada operación queda asociada al usuario de su sesión en la auditoría inmutable.
- Las sesiones son `HttpOnly`, `SameSite=Strict`, expiran a las 12 horas y se invalidan al cerrar sesión.
- El acceso inicial requiere una clave privada de activación (`BOOTSTRAP_SECRET`), configurada fuera del repositorio.

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

Antes de crear la primera cuenta productiva, configura una clave de activación robusta que solo conozca el responsable:

```powershell
npx wrangler secret put BOOTSTRAP_SECRET
```

Cuando Wrangler la solicite, pega una clave aleatoria de al menos 24 caracteres. Después abre la aplicación, selecciona **Crear primera cuenta** y registra el primer usuario. La clave no se incluye en el repositorio ni debe compartirse por canales públicos.

No se incluyen credenciales, documentos de empresa ni bases locales en el repositorio.
