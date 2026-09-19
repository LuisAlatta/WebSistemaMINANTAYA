import { Hono } from 'hono';

import type { AppVariables } from '../http/middleware';
import { HttpError } from '../http/errors';
import { assayReportSchema, recordAssayReport } from '../quality/service';
import {
  changeGuideStatus,
  changeGuideStatusSchema,
  createGuide,
  createGuideSchema,
  listGuides,
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

guideRoutes.post('/:id/assay-reports', async (context) => {
  const payload = await context.req.json().catch(() => { throw new HttpError(400, 'El cuerpo debe ser JSON válido.', 'INVALID_JSON'); });
  const parsed = assayReportSchema.safeParse(payload);
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const report = await recordAssayReport(context.env.DB, context.get('actor'), context.req.param('id'), parsed.data);
  return context.json(report, 201);
});
