# Diseño del sistema minero

## Objetivo

Construir una aplicación web interna para controlar el transporte y la venta de minerales. El código de guía GRE es la referencia principal para seguir sus lotes, reporte de leyes, propuesta de compra, liquidación, facturación comercial, transporte y pagos.

## Alcance de la primera versión

La primera versión permitirá registrar y consultar guías, lotes, proveedores, resultados de leyes, liquidaciones, facturas comerciales y facturas de transporte. El sistema mostrará alertas de documentos o pagos faltantes y preservará una auditoría completa de los cambios.

Quedan fuera de esta primera entrega la conexión automática a Caja Arequipa, integración con SUNAT, envío de WhatsApp y carga automática de los cuatro Excel históricos. Se mantendrán puntos de extensión para incorporarlos después sin cambiar el modelo transaccional.

## Arquitectura

La aplicación será una React SPA compilada por Vite y entregada como Static Assets de Cloudflare Workers. Un Worker TypeScript atenderá las rutas `/api/*` y será el único componente con acceso a los bindings de Cloudflare.

Cloudflare D1 almacenará los datos relacionales. Cloudflare R2 almacenará archivos de soporte y D1 guardará solo sus metadatos. Un Cron Trigger ejecutará la evaluación diaria de alertas. Las migraciones SQL se guardarán en `migrations/` y se aplicarán con Wrangler localmente antes de aplicarse en producción.

Cloudflare Access será la barrera de acceso de producción para los dos administradores. El Worker tomará la identidad autenticada por Access y la asociará a todos los cambios auditables. En desarrollo local, un encabezado controlado solo por el entorno de desarrollo proveerá el actor de prueba y nunca se desplegará.

## Usuarios y auditoría

Los dos usuarios son administradores completos. Ambos pueden realizar cualquier operación funcional.

Toda mutación crea un registro en `audit_logs` con:

- Identificador de la entidad y tipo de entidad.
- Acción: creación, actualización, anulación, cambio de estado, adjunto, pago o eliminación lógica.
- Correo del actor autenticado.
- Marca de tiempo UTC.
- Valores anteriores y posteriores como JSON.
- Motivo cuando la operación requiere justificación.

Las entradas de auditoría no se exponen a modificaciones ni eliminación mediante la API. Los cambios financieros, anulaciones, retiros, remuestreos y dirimencias requieren motivo.

## Modelo de datos

### Catálogos

- `plants`: planta receptora o compradora.
- `counterparties`: proveedor, transportista o ambos, con RUC y datos de contacto.
- `routes`: origen, destino, modalidad de cobro por tonelada o viaje.
- `transport_rates`: tarifa real y tarifa descontable por ruta, vigencia y moneda.
- `exchange_rates`: tipo de cambio de Caja Arequipa por fecha, con fuente y hora de registro.

### Operación

- `guides`: GRE original, GRE normalizado único, tipo, planta, fecha de emisión, transportista, estado y observaciones.
- `lots`: código de lote, sacos, TMH y estado de custodia.
- `guide_lots`: relación entre guía y lote, con posición, proveedor principal, fecha de recepción y estado.
- `lot_suppliers`: distribución de cada lote entre uno o varios proveedores.
- `guide_events`: baja, retiro, reingreso, cambio de ruta o lote volado.

El GRE normalizado elimina espacios y diferencias de guiones pero conserva el valor original. Una guía admite varios proveedores. El máximo de seis lotes será una regla configurable que alerta y solicita motivo al superarse, porque el Excel histórico contiene excepciones.

### Calidad y negociación

- `assay_reports`: reporte de leyes, planta, fecha de recepción, fecha de envío al proveedor, vencimiento, estado y documento.
- `assay_results`: resultados por lote, metal, laboratorio, valor y unidad.
- `resamples`: remuestreo, laboratorio externo, motivo, coordinación con planta y resolución.
- `disputes`: dirimencia enviada a Lima, con estado y cinco pasos configurables.
- `purchase_proposals`: propuesta de compra asociada a guía o lotes, valor y estado de aprobación del proveedor.

El reporte de leyes vence a los dos días hábiles configurables desde la recepción. Un remuestreo impide la liquidación final hasta obtener una resolución. Los nombres de los cinco pasos de dirimencia se mantendrán configurables.

### Finanzas

- `settlements` y `settlement_lines`: liquidación por lote y proveedor.
- `discounts`: descuentos de transporte por TMH o viaje, con tarifa aplicada y tipo de cambio usado.
- `commercial_invoices` y `commercial_invoice_lots`: factura comercial, detracción del 10 %, estado, liquidación asociada y lotes facturados.
- `transport_invoices` y `transport_invoice_guides`: factura de transporte, RUC, monto en USD, tipo de cambio, detracción del 4 % en soles y guías cubiertas.
- `payments`: pagos parciales, con componente comercial, transporte o detracción, importe, fecha, comprobante y estado.

Una factura comercial no puede incluir más de cuatro lotes. Una factura de transporte puede cubrir una o más guías, pero cada guía activa debe estar cubierta por al menos una factura de transporte antes de cerrar.

## Estados y reglas

Una guía transita por `BORRADOR`, `EMITIDA`, `EN_PLANTA`, `LEYES_PENDIENTES`, `LEYES_ENVIADAS`, `ESPERANDO_APROBACION`, `PROPUESTA`, `LIQUIDADA`, `FACTURADA`, `PAGO_PENDIENTE` y `CERRADA`.

Las ramas `ANULADA`, `RETIRO`, `REINGRESO`, `REMUESTREO`, `DIRIMENCIA` y `LOTE_VOLADO` conservan la guía y sus eventos. Nunca se borra una guía para representar una baja.

El cierre exige liquidación aprobada, factura comercial válida si corresponde, cobertura de transporte y pagos requeridos. Las reglas generan alertas, pero los administradores pueden resolverlas con motivo auditado cuando exista una excepción real.

## API inicial

- `GET /api/dashboard`: contadores y alertas abiertas.
- `GET|POST /api/guides`: búsqueda y registro de guías.
- `GET|PATCH /api/guides/:id`: detalle y actualización auditada.
- `POST /api/guides/:id/lots`: asignación de lote.
- `POST /api/guides/:id/events`: baja, retiro, reingreso o incidencia.
- `GET|POST /api/assay-reports`: reportes de leyes y resultados.
- `GET|POST /api/settlements`: liquidaciones y descuentos.
- `GET|POST /api/commercial-invoices`: facturación comercial.
- `GET|POST /api/transport-invoices`: facturación de transporte.
- `GET /api/audit-logs`: consulta paginada de auditoría.

Las rutas que modifican datos validan el actor, el formato, las transiciones de estado y las reglas financieras antes de escribir en D1.

## Interfaz inicial

La aplicación empieza con una pantalla de inicio con alertas y cinco vistas: Guías, Leyes, Liquidaciones, Facturas y Auditoría. El detalle de guía reúne toda la cadena de trazabilidad y enlaces a los documentos asociados.

Los formularios guardan borradores, muestran errores junto al campo y no cierran una operación si el dato obligatorio está ausente. Las tablas permiten búsqueda por GRE, lote, proveedor, planta, transportista, estado y rango de fecha.

## Calidad y pruebas

- Pruebas unitarias para normalización de GRE, transiciones de estado, cálculo de descuentos, límite de lotes y límites de facturación.
- Pruebas de integración contra D1 local para cada ruta de mutación y su evento de auditoría.
- Pruebas de navegador para alta de guía, aprobación de leyes, factura de transporte y visualización de alerta.
- Validación de esquema y tipos en cada cambio.
- Revisión de seguridad: no exponer bindings, credenciales ni identidad falsificable desde el cliente.

## Despliegue

El desarrollo utiliza D1 local. La producción requiere confirmar la sesión de Wrangler de `newluisalattago@gmail.com`, verificar `wrangler whoami`, registrar el `account_id` y crear D1/R2 exclusivamente en esa cuenta. Solo entonces se configurarán los bindings, Cloudflare Access y las migraciones remotas.
