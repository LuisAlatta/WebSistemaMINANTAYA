import { Hono } from 'hono';
import { z } from 'zod';

import type { AppVariables } from '../http/middleware';
import { HttpError } from '../http/errors';
import { assayReportSchema, openDispute, openResample, qualityExceptionSchema, recordAssayReport } from '../quality/service';
import {
  changeGuideStatus,
  changeGuideStatusSchema,
  createGuide,
  createGuideSchema,
  listGuides,
  confirmLotWithdrawal,
  lotSupplierSchema,
  replaceLotSuppliers,
  requestLotWithdrawal,
  withdrawalSchema,
} from './service';

export const guideRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

guideRoutes.get('/', async (context) => context.json(await listGuides(context.env.DB)));

guideRoutes.post('/', async (context) => {
  const payload = await context.req.json().catch(() => {
    throw new HttpError(400, 'El cuerpo debe ser JSON válido.', 'INVALID_JSON');
  });
  const parsed = createGuideSchema.safeParse(payload);
  if (!parsed.success) {
    return context.json(
      { error: 'VALIDATION_ERROR', issues: parsed.error.issues },
      400,
    );
  }

  const guide = await createGuide(context.env.DB, context.get('actor'), parsed.data);
  return context.json(guide, 201);
});

guideRoutes.patch('/:id/status', async (context) => {
  const payload = await context.req.json().catch(() => {
    throw new HttpError(400, 'El cuerpo debe ser JSON válido.', 'INVALID_JSON');
  });
  const parsed = changeGuideStatusSchema.safeParse(payload);
  if (!parsed.success) {
    return context.json(
      { error: 'VALIDATION_ERROR', issues: parsed.error.issues },
      400,
    );
  }

  const guide = await changeGuideStatus(
    context.env.DB,
    context.get('actor'),
    context.req.param('id'),
    parsed.data,
  );
  return context.json(guide);
});

guideRoutes.post('/:id/lots/:guideLotId/withdrawal', async (context) => {
  const parsed = withdrawalSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  return context.json(await requestLotWithdrawal(context.env.DB, context.get('actor'), context.req.param('id'), context.req.param('guideLotId'), parsed.data.reason), 201);
});

guideRoutes.patch('/:id/lots/:guideLotId/withdrawal', async (context) => {
  const parsed = withdrawalSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  return context.json(await confirmLotWithdrawal(context.env.DB, context.get('actor'), context.req.param('id'), context.req.param('guideLotId'), parsed.data.reason));
});

guideRoutes.put('/:id/lots/:guideLotId/suppliers', async (context) => {
  const parsed = z.array(lotSupplierSchema).min(1).safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  return context.json(await replaceLotSuppliers(context.env.DB, context.get('actor'), context.req.param('id'), context.req.param('guideLotId'), parsed.data));
});

guideRoutes.post('/:id/assay-reports', async (context) => {
  const payload = await context.req.json().catch(() => { throw new HttpError(400, 'El cuerpo debe ser JSON válido.', 'INVALID_JSON'); });
  const parsed = assayReportSchema.safeParse(payload);
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const report = await recordAssayReport(context.env.DB, context.get('actor'), context.req.param('id'), parsed.data);
  return context.json(report, 201);
});

guideRoutes.post('/:id/resamples', async (context) => {
  const parsed = qualityExceptionSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  return context.json(await openResample(context.env.DB, context.get('actor'), context.req.param('id'), parsed.data.reason), 201);
});

guideRoutes.post('/:id/disputes', async (context) => {
  const parsed = qualityExceptionSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  return context.json(await openDispute(context.env.DB, context.get('actor'), context.req.param('id'), parsed.data.reason), 201);
});
