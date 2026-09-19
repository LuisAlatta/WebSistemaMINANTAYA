import { FormEvent, useEffect, useState } from 'react';

type Guide = {
  id: string;
  gre: string;
  issuedAt: string;
  status: string;
  lotCount: number;
};

type Dashboard = {
  pendingLaws: number;
  pendingProposal: number;
  openAlerts: number;
  missingTransportInvoice: number;
};

const navigation = ['Inicio', 'Guías', 'Leyes', 'Liquidaciones', 'Facturas', 'Auditoría'];

const statusClass: Record<string, string> = {
  EMITIDA: 'bg-[#e6f0c9] text-[#294238]',
  EN_PLANTA: 'bg-[#dbecea] text-[#1f5959]',
  LEYES_PENDIENTES: 'bg-[#fff0cc] text-[#785400]',
  LEYES_RECIBIDAS: 'bg-[#dce8f5] text-[#1d4f7a]',
  CONFORME: 'bg-[#d8ead5] text-[#295b2c]',
  FACTURADA: 'bg-[#e7e1f3] text-[#4d3f73]',
};

export function App() {
  const [activeSection, setActiveSection] = useState('Inicio');
  const [guides, setGuides] = useState<Guide[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>({ pendingLaws: 0, pendingProposal: 0, openAlerts: 0, missingTransportInvoice: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'setup'>('login');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  async function loadGuides() {
    setIsLoading(true);
    try {
      const response = await fetch('/api/guides');
      if (!response.ok) throw new Error('No se pudieron cargar las guías.');
      const payload = (await response.json()) as { items: Guide[] };
      setGuides(payload.items);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las guías.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDashboard() {
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) throw new Error('No se pudieron cargar los indicadores.');
      setDashboard((await response.json()) as Dashboard);
    } catch (dashboardError) {
      setError(dashboardError instanceof Error ? dashboardError.message : 'No se pudieron cargar los indicadores.');
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const payload = (await response.json()) as { username: string };
          setUsername(payload.username);
          await Promise.all([loadGuides(), loadDashboard()]);
        }
      } finally {
        setIsAuthResolved(true);
      }
    })();
  }, []);

  async function submitAuthentication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsAuthenticating(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: String(form.get('username') ?? ''),
          password: String(form.get('password') ?? ''),
          ...(authMode === 'setup' ? { activationKey: String(form.get('activationKey') ?? '') } : {}),
        }),
      });
      const payload = (await response.json()) as { username?: string; message?: string };
      if (!response.ok) {
        if (authMode === 'setup' && response.status === 409) {
          setAuthMode('login');
          throw new Error('La primera cuenta ya existe. Ingresa con tu usuario.');
        }
        throw new Error(payload.message ?? 'No se pudo iniciar sesión.');
      }
      setUsername(payload.username ?? null);
      await Promise.all([loadGuides(), loadDashboard()]);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'No se pudo iniciar sesión.');
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUsername(null);
    setGuides([]);
    setDashboard({ pendingLaws: 0, pendingProposal: 0, openAlerts: 0, missingTransportInvoice: 0 });
  }

  async function registerGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get('issuedAt') ?? '');
    const lots = String(form.get('lotCodes') ?? '')
      .split(/\n|,/)
      .map((code) => code.trim())
      .filter(Boolean)
      .map((code) => ({ code }));
    setIsSaving(true);
    try {
      const response = await fetch('/api/guides', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gre: String(form.get('gre') ?? ''),
          issuedAt: new Date(`${date}T12:00:00.000Z`).toISOString(),
          lots,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? 'No se pudo registrar la guía.');
      }
      setIsFormOpen(false);
      await loadGuides();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo registrar la guía.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!isAuthResolved) {
    return <main className="grid min-h-[100dvh] place-items-center bg-[#f4f7f6] text-[#10242b]"><p className="text-sm text-[#54716f]">Cargando sistema…</p></main>;
  }

  if (!username) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f4f7f6] px-4 text-[#10242b]">
        <section className="w-full max-w-md border border-[#cfdcd7] bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#54716f]">MINANTAYA</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{authMode === 'login' ? 'Ingresar al control minero' : 'Crear primera cuenta'}</h1>
          <p className="mt-2 text-sm leading-6 text-[#607876]">{authMode === 'login' ? 'Usa tu nombre de usuario y contraseña.' : 'Esta cuenta tendrá control administrativo total. Requiere la clave de activación entregada al responsable.'}</p>
          {error && <p className="mt-5 rounded-lg border border-[#c97965] bg-[#fff3f0] px-4 py-3 text-sm text-[#7f301f]" role="alert">{error}</p>}
          <form className="mt-6 grid gap-4" onSubmit={submitAuthentication}>
            <label className="grid gap-1.5 text-sm font-medium">Usuario<input autoComplete="username" className="rounded-md border border-[#b9cbc4] bg-white px-3 py-2" name="username" minLength={3} pattern="[A-Za-z0-9._-]+" required /></label>
            <label className="grid gap-1.5 text-sm font-medium">Contraseña<input autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} className="rounded-md border border-[#b9cbc4] bg-white px-3 py-2" name="password" minLength={12} required type="password" /></label>
            {authMode === 'setup' && <label className="grid gap-1.5 text-sm font-medium">Clave de activación<input autoComplete="off" className="rounded-md border border-[#b9cbc4] bg-white px-3 py-2" name="activationKey" minLength={24} required type="password" /></label>}
            <button className="rounded-md bg-[#2e6b61] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={isAuthenticating} type="submit">{isAuthenticating ? 'Validando…' : authMode === 'login' ? 'Ingresar' : 'Crear cuenta'}</button>
          </form>
          <button className="mt-5 text-sm font-medium text-[#2e6b61] underline underline-offset-4" onClick={() => { setAuthMode(authMode === 'login' ? 'setup' : 'login'); setError(null); }} type="button">{authMode === 'login' ? '¿Es la primera vez? Crear cuenta inicial' : 'Ya existe una cuenta, ingresar'}</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#f4f7f6] text-[#10242b]">
      <div className="grid min-h-[100dvh] lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="border-b border-[#d9e2df] bg-[#0d252d] px-5 py-6 text-[#e8f0ed] lg:border-r lg:border-b-0">
          <div className="mb-10"><p className="text-xs font-semibold tracking-[0.2em] text-[#a9c4ba]">MINANTAYA</p><h1 className="mt-2 text-xl font-semibold tracking-tight">Control minero</h1><p className="mt-2 text-sm leading-5 text-[#b8cbc4]">Operación, liquidación y transporte.</p></div>
          <nav aria-label="Secciones del sistema" className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
            {navigation.map((item) => <button aria-current={activeSection === item ? 'page' : undefined} className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${activeSection === item ? 'bg-[#e6f0c9] text-[#17333a]' : 'text-[#c8d8d2] hover:bg-[#183941] hover:text-white'}`} key={item} onClick={() => setActiveSection(item)} type="button">{item}</button>)}
          </nav>
          <div className="mt-10 border-t border-[#31515a] pt-5"><p className="text-xs text-[#a9c4ba]">Sesión: {username}</p><button className="mt-2 text-xs font-semibold text-[#e6f0c9] underline underline-offset-4" onClick={() => void logout()} type="button">Cerrar sesión</button></div>
        </aside>
        <section className="px-4 py-6 sm:px-8 lg:px-12 lg:py-10"><div className="mx-auto max-w-[1400px]">
          <header className="flex flex-col gap-5 border-b border-[#d9e2df] pb-7 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-medium text-[#54716f]">Vista operativa</p><h2 className="mt-1 text-3xl font-semibold tracking-tight">Control de operaciones</h2><p className="mt-2 max-w-[62ch] text-sm leading-6 text-[#607876]">Guías, lotes, calidad, liquidación, facturación y transporte en una sola trazabilidad.</p></div><button className="rounded-lg bg-[#2e6b61] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#24584f]" onClick={() => setIsFormOpen(true)} type="button">Registrar guía</button></header>
          {error && <p className="mt-6 rounded-lg border border-[#c97965] bg-[#fff3f0] px-4 py-3 text-sm text-[#7f301f]" role="alert">{error}</p>}
          <section aria-label="Indicadores de operación" className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Leyes pendientes', dashboard.pendingLaws, 'Reportes por recibir'],
              ['Propuestas pendientes', dashboard.pendingProposal, 'Esperando conformidad'],
              ['Alertas abiertas', dashboard.openAlerts, 'Requieren revisión'],
              ['Transporte pendiente', dashboard.missingTransportInvoice, 'Guías sin factura'],
            ].map(([label, value, detail]) => <article className="border border-[#d9e2df] bg-white p-4" key={String(label)}><p className="text-xs font-semibold tracking-[0.1em] text-[#54716f]">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-[#607876]">{detail}</p></article>)}
          </section>
          {isFormOpen && <section aria-labelledby="registro-guia" className="mt-8 border border-[#cfdcd7] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.16em] text-[#54716f]">NUEVA OPERACIÓN</p><h3 className="mt-1 text-xl font-semibold" id="registro-guia">Registrar guía GRE</h3></div><button className="text-sm text-[#54716f]" onClick={() => setIsFormOpen(false)} type="button">Cerrar</button></div><form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={registerGuide}><label className="grid gap-1.5 text-sm font-medium">Código GRE<input className="rounded-md border border-[#b9cbc4] bg-white px-3 py-2" name="gre" placeholder="EG07 - 365" required /></label><label className="grid gap-1.5 text-sm font-medium">Fecha de emisión<input className="rounded-md border border-[#b9cbc4] bg-white px-3 py-2" name="issuedAt" required type="date" /></label><label className="grid gap-1.5 text-sm font-medium md:col-span-2">Lotes<span className="font-normal text-[#607876]">Uno por línea o separados por coma.</span><textarea className="min-h-24 rounded-md border border-[#b9cbc4] bg-white px-3 py-2" name="lotCodes" placeholder={'LOTE-001\nLOTE-002'} required /></label><div className="flex gap-3 md:col-span-2"><button className="rounded-md bg-[#2e6b61] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isSaving} type="submit">{isSaving ? 'Guardando…' : 'Guardar guía'}</button><button className="rounded-md px-4 py-2 text-sm font-medium text-[#48635f]" onClick={() => setIsFormOpen(false)} type="button">Cancelar</button></div></form></section>}
          <section aria-labelledby="guias-recientes" className="mt-10"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold tracking-[0.16em] text-[#54716f]">SEGUIMIENTO</p><h3 className="mt-1 text-xl font-semibold" id="guias-recientes">Guías recientes</h3></div><span className="text-sm text-[#607876]">{guides.length} registradas</span></div><div className="mt-4 overflow-x-auto border border-[#d9e2df] bg-white"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-[#d9e2df] bg-[#eef3ef] text-xs uppercase tracking-[0.08em] text-[#54716f]"><tr><th className="px-4 py-3 font-semibold">GRE</th><th className="px-4 py-3 font-semibold">Emisión</th><th className="px-4 py-3 font-semibold">Lotes</th><th className="px-4 py-3 font-semibold">Estado</th></tr></thead><tbody>{isLoading ? <tr><td className="px-4 py-5 text-[#607876]" colSpan={4}>Cargando guías…</td></tr> : guides.length === 0 ? <tr><td className="px-4 py-5 text-[#607876]" colSpan={4}>Aún no hay guías registradas.</td></tr> : guides.map((guide) => <tr className="border-b border-[#e6ece9] last:border-0" key={guide.id}><td className="px-4 py-3 font-semibold text-[#18343a]">{guide.gre}</td><td className="px-4 py-3 text-[#607876]">{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(guide.issuedAt))}</td><td className="px-4 py-3">{guide.lotCount}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[guide.status] ?? 'bg-[#e7ece9] text-[#405550]'}`}>{guide.status.replaceAll('_', ' ')}</span></td></tr>)}</tbody></table></div></section>
        </div></section>
      </div>
    </main>
  );
}
