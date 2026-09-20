# Operación minera

## Objetivo

Convertir los cuatro libros operativos entregados en módulos web que permitan registrar, consultar, filtrar y dar seguimiento a guías, lotes, leyes, compras, liquidaciones, facturas, pagos, transporte, descuentos y auditoría.

## Flujos que deben estar disponibles

1. La guía GRE es el centro de la operación. Debe contener planta, transporte, lotes, proveedores, sacos, retiro, baja, estado y observaciones.
2. Cada lote puede tener uno o más proveedores y sigue el flujo de leyes, propuesta, aprobación, liquidación y facturación.
3. Los reportes de leyes permiten registrar resultados de planta y externos, comparar resultados, abrir remuestreo y abrir dirimencia.
4. La propuesta de compra pasa a aprobación del proveedor. Una liquidación registra bruto, descuentos, neto y sus líneas.
5. Las facturas comerciales se relacionan con lotes. Las de transporte se relacionan con una o más guías, pagos y detracciones.
6. Los descuentos y tarifas se consultan por transportista, planta/destino, tonelaje y lote sin alterar el origen histórico.
7. El tipo de cambio diario se registra en USD/PEN, con Caja Arequipa como fuente operacional predeterminada.
8. Las alertas muestran documentación, facturas y pagos pendientes. La auditoría muestra quién ejecutó cada movimiento.
9. Los datos importados desde Excel se mantienen separados como lote de prueba y se pueden revisar o retirar sin borrar usuarios ni auditoría.

## Restricciones

- Dos usuarios administradores con permisos totales y bitácora de movimientos.
- Moneda operativa USD; los pagos de detracción pueden registrarse en PEN.
- No se inventan datos en una importación: los valores ambiguos permanecen en la fuente y se señalan como observaciones.
- La interfaz debe ser en español, usable en escritorio y móvil, y las acciones sensibles requieren motivo cuando corresponde.
