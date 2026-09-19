import { Hono } from 'hono';

import type { AppVariables } from '../http/middleware';

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

dashboardRoutes.get('/', async (context) => {
  const db = context.env.DB;
  const [pendingLaws, pendingProposal, openAlerts, missingTransportInvoice] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS total FROM guides WHERE status = 'LEYES_PENDIENTES'").first<{ total: number }>(),
    db.prepare("SELECT COUNT(*) AS total FROM guides WHERE status = 'PROPUESTA_PENDIENTE'").first<{ total: number }>(),
    db.prepare("SELECT COUNT(*) AS total FROM alerts WHERE status = 'ABIERTA'").first<{ total: number }>(),
    db.prepare("SELECT COUNT(*) AS total FROM guides WHERE status <> 'ANULADA' AND NOT EXISTS (SELECT 1 FROM transport_invoice_guides WHERE transport_invoice_guides.guide_id = guides.id)").first<{ total: number }>(),
  ]);
  return context.json({
    pendingLaws: pendingLaws?.total ?? 0,
    pendingProposal: pendingProposal?.total ?? 0,
    openAlerts: openAlerts?.total ?? 0,
    missingTransportInvoice: missingTransportInvoice?.total ?? 0,
  });
});
