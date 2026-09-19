import { z } from 'zod';

import type { Actor } from '../auth/actor';
import { prepareAuditLog } from '../audit/audit-log';
import { executeAtomically } from '../db/client';
import { guideStatuses, type GuideStatus } from '../db/schema';
import { HttpError } from '../http/errors';

const lotInputSchema = z.object({
  code: z.string().trim().min(1).max(80),
  mineralType: z.string().trim().min(1).max(80).optional(),
  sackCount: z.int().nonnegative().optional(),
  grossWeightKg: z.number().nonnegative().optional(),
  netWeightKg: z.number().nonnegative().optional(),
});

export const createGuideSchema = z
  .object({
    gre: z.string().trim().min(1).max(80),
    issuedAt: z.iso.datetime({ offset: true }),
    plantId: z.string().uuid().optional(),
    routeId: z.string().uuid().optional(),
    carrierId: z.string().uuid().optional(),
    transportReference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(2_000).optional(),
    lots: z.array(lotInputSchema).min(1).max(50),
  })
  .superRefine((value, context) => {
    const uniqueCodes = new Set<string>();
    for (const [index, lot] of value.lots.entries()) {
      const normalizedCode = normalizeLotCode(lot.code);
      if (uniqueCodes.has(normalizedCode)) {
        context.addIssue({
          code: 'custom',
          path: ['lots', index, 'code'],
          message: 'Cada lote debe tener un código único dentro de la guía.',
        });
      }
      uniqueCodes.add(normalizedCode);
    }
  });

export type CreateGuideInput = z.infer<typeof createGuideSchema>;

export function normalizeGre(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeLotCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '-');
}

export type CreatedGuide = {
  id: string;
  gre: string;
  greNormalized: string;
  status: 'EMITIDA';
  lotCount: number;
};

const allowedTransitions: Record<GuideStatus, readonly GuideStatus[]> = {
  EMITIDA: ['EN_PLANTA', 'ANULADA'],
  EN_PLANTA: ['LEYES_PENDIENTES', 'RETIRO_PENDIENTE', 'ANULADA'],
  LEYES_PENDIENTES: ['LEYES_RECIBIDAS', 'RETIRO_PENDIENTE'],
  LEYES_RECIBIDAS: ['PROPUESTA_PENDIENTE', 'REMUESTREO', 'DIRIMENCIA', 'RETIRO_PENDIENTE'],
  PROPUESTA_PENDIENTE: ['CONFORME', 'REMUESTREO', 'DIRIMENCIA'],
  CONFORME: ['LIQUIDADA', 'DIRIMENCIA'],
  REMUESTREO: ['LEYES_RECIBIDAS', 'DIRIMENCIA', 'RETIRO_PENDIENTE'],
  DIRIMENCIA: ['LEYES_RECIBIDAS', 'CONFORME', 'RETIRO_PENDIENTE'],
  LIQUIDADA: ['FACTURADA', 'ANULADA'],
  FACTURADA: [],
  ANULADA: [],
  RETIRO_PENDIENTE: ['RETIRADA'],
  RETIRADA: [],
};

export const changeGuideStatusSchema = z
  .object({
    status: z.enum(guideStatuses),
    reason: z.string().trim().min(3).max(1_000).optional(),
  })
  .superRefine((value, context) => {
    if (['ANULADA', 'RETIRO_PENDIENTE'].includes(value.status) && !value.reason) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Debe indicar el motivo para esta operación.',
      });
    }
  });

export async function createGuide(
  db: D1Database,
  actor: Actor,
  input: CreateGuideInput,
): Promise<CreatedGuide> {
  const greNormalized = normalizeGre(input.gre);
  if (!greNormalized) {
    throw new HttpError(400, 'El código GRE no es válido.', 'INVALID_GRE');
  }

  const now = new Date().toISOString();
  const guideId = crypto.randomUUID();
  const output: CreatedGuide = {
    id: guideId,
    gre: input.gre,
    greNormalized,
    status: 'EMITIDA',
    lotCount: input.lots.length,
  };
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO guides (
          id, gre_original, gre_normalized, plant_id, route_id, carrier_id, issued_at,
          status, transport_reference, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        guideId,
        input.gre,
        greNormalized,
        input.plantId ?? null,
        input.routeId ?? null,
        input.carrierId ?? null,
        input.issuedAt,
        'EMITIDA',
        input.transportReference ?? null,
        input.notes ?? null,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO guide_events (id, guide_id, event_type, occurred_at, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), guideId, 'CREADA', now, JSON.stringify(output), now),
    prepareAuditLog({
      db,
      actor,
      action: 'CREATED',
      entityType: 'guide',
      entityId: guideId,
      after: output,
      occurredAt: now,
    }),
  ];

  for (const [index, lot] of input.lots.entries()) {
    const lotId = crypto.randomUUID();
    const code = normalizeLotCode(lot.code);
    const lotSnapshot = { id: lotId, code, guideId, sequence: index + 1 };
    statements.push(
      db
        .prepare(
          `INSERT INTO lots (
            id, code, mineral_type, sack_count, gross_weight_kg, net_weight_kg,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          lotId,
          code,
          lot.mineralType ?? null,
          lot.sackCount ?? null,
          lot.grossWeightKg ?? null,
          lot.netWeightKg ?? null,
          'ACTIVO',
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO guide_lots (id, guide_id, lot_id, sequence, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), guideId, lotId, index + 1, now, now),
      prepareAuditLog({
        db,
        actor,
        action: 'CREATED',
        entityType: 'lot',
        entityId: lotId,
        after: lotSnapshot,
        occurredAt: now,
      }),
    );
  }

  if (input.lots.length > 6) {
    const alertId = crypto.randomUUID();
    const alertSnapshot = {
      id: alertId,
      type: 'LOTES_SUPERADOS',
      lotCount: input.lots.length,
    };
    statements.push(
      db
        .prepare(
          `INSERT INTO alerts (
            id, guide_id, alert_type, severity, status, detail_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          alertId,
          guideId,
          'LOTES_SUPERADOS',
          'ADVERTENCIA',
          'ABIERTA',
          JSON.stringify(alertSnapshot),
          now,
          now,
        ),
      prepareAuditLog({
        db,
        actor,
        action: 'CREATED',
        entityType: 'alert',
        entityId: alertId,
        after: alertSnapshot,
        occurredAt: now,
      }),
    );
  }

  try {
    await executeAtomically(db, statements);
  } catch (error) {
    if (error instanceof Error && error.message.includes('guides.gre_normalized')) {
      throw new HttpError(409, 'Ya existe una guía con ese código GRE.', 'GUIDE_ALREADY_EXISTS');
    }
    if (error instanceof Error && error.message.includes('lots.code')) {
      throw new HttpError(409, 'Ya existe uno de los lotes indicados.', 'LOT_ALREADY_EXISTS');
    }
    throw error;
  }

  return output;
}

export async function changeGuideStatus(
  db: D1Database,
  actor: Actor,
  guideId: string,
  input: z.infer<typeof changeGuideStatusSchema>,
): Promise<{ id: string; status: GuideStatus }> {
  const guide = await db
    .prepare('SELECT id, gre_original, gre_normalized, status FROM guides WHERE id = ?')
    .bind(guideId)
    .first<{ id: string; gre_original: string; gre_normalized: string; status: GuideStatus }>();
  if (!guide) {
    throw new HttpError(404, 'La guía no existe.', 'GUIDE_NOT_FOUND');
  }
  if (!allowedTransitions[guide.status].includes(input.status)) {
    throw new HttpError(
      409,
      `No se puede cambiar una guía de ${guide.status} a ${input.status}.`,
      'INVALID_STATUS_TRANSITION',
    );
  }

  const now = new Date().toISOString();
  const before = { id: guide.id, gre: guide.gre_original, status: guide.status };
  const after = { ...before, status: input.status };
  const eventType = input.status === 'ANULADA' ? 'BAJA' : input.status === 'RETIRO_PENDIENTE' ? 'RETIRO_SOLICITADO' : 'ESTADO_CAMBIADO';
  const update = input.status === 'ANULADA'
    ? db
        .prepare('UPDATE guides SET status = ?, voided_at = ?, void_reason = ?, updated_at = ? WHERE id = ?')
        .bind(input.status, now, input.reason, now, guideId)
    : db
        .prepare('UPDATE guides SET status = ?, updated_at = ? WHERE id = ?')
        .bind(input.status, now, guideId);

  await executeAtomically(db, [
    update,
    db
      .prepare(
        `INSERT INTO guide_events (id, guide_id, event_type, occurred_at, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        guideId,
        eventType,
        now,
        JSON.stringify({ before, after, reason: input.reason ?? null }),
        now,
      ),
    prepareAuditLog({
      db,
      actor,
      action: 'STATUS_CHANGED',
      entityType: 'guide',
      entityId: guideId,
      before,
      after,
      reason: input.reason,
      occurredAt: now,
    }),
  ]);

  return { id: guideId, status: input.status };
}

export async function listGuides(db: D1Database): Promise<{
  items: Array<{
    id: string;
    gre: string;
    greNormalized: string;
    issuedAt: string;
    status: GuideStatus;
    lotCount: number;
  }>;
}> {
  const result = await db
    .prepare(
      `SELECT
        guides.id,
        guides.gre_original AS gre,
        guides.gre_normalized AS greNormalized,
        guides.issued_at AS issuedAt,
        guides.status,
        COUNT(guide_lots.id) AS lotCount
      FROM guides
      LEFT JOIN guide_lots ON guide_lots.guide_id = guides.id
      GROUP BY guides.id
      ORDER BY guides.issued_at DESC, guides.created_at DESC`,
    )
    .all<{
      id: string;
      gre: string;
      greNormalized: string;
      issuedAt: string;
      status: GuideStatus;
      lotCount: number;
    }>();

  return { items: result.results };
}
