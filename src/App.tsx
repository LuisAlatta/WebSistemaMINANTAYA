const navigation = ['Inicio', 'Guías', 'Leyes', 'Liquidaciones', 'Facturas', 'Auditoría'];

export function App() {
  return (
    <main className="min-h-[100dvh] bg-[#f4f7f6] text-[#10242b]">
      <div className="grid min-h-[100dvh] lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="border-b border-[#d9e2df] bg-[#0d252d] px-5 py-6 text-[#e8f0ed] lg:border-r lg:border-b-0">
          <div className="mb-10">
            <p className="text-xs font-semibold tracking-[0.2em] text-[#a9c4ba]">MINANTAYA</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Control minero</h1>
            <p className="mt-2 text-sm leading-5 text-[#b8cbc4]">Operación, liquidación y transporte.</p>
          </div>

          <nav aria-label="Secciones del sistema" className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
            {navigation.map((item) => (
              <button
                className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium transition duration-200 ease-out active:translate-y-px ${
                  item === 'Inicio'
                    ? 'bg-[#e6f0c9] text-[#17333a]'
                    : 'text-[#c8d8d2] hover:bg-[#183941] hover:text-white'
                }`}
                key={item}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="mt-10 border-t border-[#31515a] pt-5 text-xs text-[#a9c4ba]">
            Entorno local activo
          </div>
        </aside>

        <section className="px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
          <div className="mx-auto max-w-[1400px]">
            <header className="flex flex-col gap-5 border-b border-[#d9e2df] pb-7 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-medium text-[#54716f]">Vista operativa</p>
                <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#10242b]">Control de operaciones</h2>
                <p className="mt-2 max-w-[62ch] text-sm leading-6 text-[#607876]">
                  La información de guías, leyes, liquidaciones y transporte se centralizará aquí.
                </p>
              </div>
              <button
                className="rounded-lg bg-[#2e6b61] px-4 py-2.5 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-[#24584f] active:translate-y-px"
                type="button"
              >
                Registrar guía
              </button>
            </header>

            <section aria-labelledby="estado-operacion" className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-[#54716f]">ESTADO DE OPERACIÓN</p>
                <h3 id="estado-operacion" className="mt-2 text-xl font-semibold tracking-tight">Aún no hay guías registradas</h3>
                <p className="mt-2 max-w-[58ch] text-sm leading-6 text-[#607876]">
                  El primer registro creará la trazabilidad desde el GRE hasta la factura y el pago de transporte.
                </p>

                <div className="mt-7 divide-y divide-[#d9e2df] border-y border-[#d9e2df]">
                  {[
                    ['01', 'Registrar la guía GRE', 'Código, planta, fecha, transporte y proveedores.'],
                    ['02', 'Añadir lotes y reporte de leyes', 'Se controlará el plazo de respuesta y la aprobación del proveedor.'],
                    ['03', 'Liquidar y validar facturas', 'Los pagos y detracciones quedarán auditados por cada movimiento.'],
                  ].map(([index, title, description]) => (
                    <div className="grid grid-cols-[44px_1fr] gap-3 py-5" key={index}>
                      <span className="font-mono text-xs font-semibold text-[#2e6b61]">{index}</span>
                      <div>
                        <h4 className="text-sm font-semibold text-[#18343a]">{title}</h4>
                        <p className="mt-1 text-sm leading-5 text-[#607876]">{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="border-l-0 border-[#d9e2df] bg-[#eef3ef] p-6 lg:border-l">
                <p className="text-xs font-semibold tracking-[0.16em] text-[#54716f]">PRÓXIMA ACCIÓN</p>
                <h3 className="mt-3 text-lg font-semibold tracking-tight text-[#18343a]">Preparar datos maestros</h3>
                <p className="mt-2 text-sm leading-6 text-[#607876]">
                  Antes de cargar operaciones, registra plantas, proveedores, transportistas y tarifas de ruta.
                </p>
                <p className="mt-8 border-t border-[#d3dfda] pt-4 text-xs leading-5 text-[#54716f]">
                  Cada cambio quedará asociado al administrador que lo realizó.
                </p>
              </aside>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
