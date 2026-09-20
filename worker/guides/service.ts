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

export const withdrawalSchema = z.object({
  reason: z.string().trim().min(3).max(1_000),
});

export const lotSupplierSchema = z.object({
  supplierId: z.string().uuid(),
  allocationPercent: z.number().positive().max(1).optional(),
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

export async function requestLotWithdrawal(
  db: D1Database,
  actor: Actor,
  guideId: string,
  guideLotId: string,
  reason: string,
): Promise<{ id: string; status: 'RETIRO_PENDIENTE' }> {
  const row = await db.prepare(
    `SELECT guide_lots.id, guide_lots.withdrawal_requested AS withdrawalRequested, lots.id AS lotId,
      lots.status AS lotStatus, guides.status AS guideStatus, guides.gre_original AS gre
     FROM guide_lots JOIN lots ON lots.id = guide_lots.lot_id JOIN guides ON guides.id = guide_lots.guide_id
     WHERE guide_lots.id = ? AND guide_lots.guide_id = ?`,
  ).bind(guideLotId, guideId).first<{ id: string; withdrawalRequested: number; lotId: string; lotStatus: string; guideStatus: GuideStatus; gre: string }>();
  if (!row) throw new HttpError(404, 'El lote no pertenece a la guía.', 'GUIDE_LOT_NOT_FOUND');
  if (row.withdrawalRequested || row.lotStatus === 'RETIRADO') throw new HttpError(409, 'El retiro de este lote ya fue solicitado o confirmado.', 'WITHDRAWAL_ALREADY_REQUESTED');
  if (['ANULADA', 'RETIRADA', 'FACTURADA'].includes(row.guideStatus)) throw new HttpError(409, 'La guía no permite solicitar retiros en su estado actual.', 'INVALID_WITHDRAWAL_STATUS');

  const now = new Date().toISOString();
  const before = { guideId, guideLotId, lotId: row.lotId, guideStatus: row.guideStatus, lotStatus: row.lotStatus, withdrawalRequested: false };
  const after = { ...before, guideStatus: 'RETIRO_PENDIENTE', lotStatus: 'RETIRO_PENDIENTE', withdrawalRequested: true, reason };
  await executeAtomically(db, [
    db.prepare('UPDATE guide_lots SET withdrawal_requested = 1, withdrawal_reason = ?, updated_at = ? WHERE id = ?').bind(reason, now, guideLotId),
    db.prepare("UPDATE lots SET status = 'RETIRO_PENDIENTE', updated_at = ? WHERE id = ?").bind(now, row.lotId),
    db.prepare("UPDATE guides SET status = 'RETIRO_PENDIENTE', updated_at = ? WHERE id = ?").bind(now, guideId),
    db.prepare("INSERT INTO guide_events (id, guide_id, event_type, occurred_at, detail_json, created_at) VALUES (?, ?, 'RETIRO_SOLICITADO', ?, ?, ?)").bind(crypto.randomUUID(), guideId, now, JSON.stringify(after), now),
    prepareAuditLog({ db, actor, action: 'WITHDRAWAL_REQUESTED', entityType: 'guide_lot', entityId: guideLotId, before, after, reason, occurredAt: now }),
  ]);
  return { id: guideLotId, status: 'RETIRO_PENDIENTE' };
}

export async function confirmLotWithdrawal(
  db: D1Database,
  actor: Actor,
  guideId: string,
  guideLotId: string,
  reason: string,
): Promise<{ id: string; status: 'RETIRADO' }> {
  const row = await db.prepare(
    `SELECT guide_lots.id, guide_lots.withdrawal_requested AS withdrawalRequested, lots.id AS lotId, lots.status AS lotStatus
     FROM guide_lots JOIN lots ON lots.id = guide_lots.lot_id
     WHERE guide_lots.id = ? AND guide_lots.guide_id = ?`,
  ).bind(guideLotId, guideId).first<{ id: string; withdrawalRequested: number; lotId: string; lotStatus: string }>();
  if (!row) throw new HttpError(404, 'El lote no pertenece a la guía.', 'GUIDE_LOT_NOT_FOUND');
  if (!row.withdrawalRequested || row.lotStatus === 'RETIRADO') throw new HttpError(409, 'Primero debe solicitarse el retiro del lote.', 'WITHDRAWAL_NOT_REQUESTED');
  const now = new Date().toISOString();
  const remaining = await db.prepare("SELECT COUNT(*) AS total FROM guide_lots JOIN lots ON lots.id = guide_lots.lot_id WHERE guide_lots.guide_id = ? AND lots.status <> 'RETIRADO'").bind(guideId).first<{ total: number }>();
  const completesGuide = (remaining?.total ?? 1) === 1;
  const before = { guideId, guideLotId, lotId: row.lotId, lotStatus: row.lotStatus };
  const after = { ...before, lotStatus: 'RETIRADO', guideStatus: completesGuide ? 'RETIRADA' : 'RETIRO_PENDIENTE', reason };
  await executeAtomically(db, [
    db.prepare('UPDATE guide_lots SET withdrawal_completed_at = ?, withdrawal_reason = ?, updated_at = ? WHERE id = ?').bind(now, reason, now, guideLotId),
    db.prepare("UPDATE lots SET status = 'RETIRADO', updated_at = ? WHERE id = ?").bind(now, row.lotId),
    ...(completesGuide ? [db.prepare("UPDATE guides SET status = 'RETIRADA', updated_at = ? WHERE id = ?").bind(now, guideId)] : []),
    db.prepare("INSERT INTO guide_events (id, guide_id, event_type, occurred_at, detail_json, created_at) VALUES (?, ?, 'RETIRO_CONFIRMADO', ?, ?, ?)").bind(crypto.randomUUID(), guideId, now, JSON.stringify(after), now),
    prepareAuditLog({ db, actor, action: 'WITHDRAWAL_CONFIRMED', entityType: 'guide_lot', entityId: guideLotId, before, after, reason, occurredAt: now }),
  ]);
  return { id: guideLotId, status: 'RETIRADO' };
}

export async function replaceLotSuppliers(
  db: D1Database,
  actor: Actor,
  guideId: string,
  guideLotId: string,
  suppliers: z.infer<typeof lotSupplierSchema>[],
): Promise<{ id: string; supplierCount: number }> {
  if (!suppliers.length) throw new HttpError(400, 'Debe indicar por lo menos un proveedor.', 'SUPPLIER_REQUIRED');
  if (new Set(suppliers.map((supplier) => supplier.supplierId)).size !== suppliers.length) throw new HttpError(400, 'No puede repetir proveedores.', 'DUPLICATE_SUPPLIER');
  const total = suppliers.reduce((sum, supplier) => sum + (supplier.allocationPercent ?? 0), 0);
  if (total > 1.000001) throw new HttpError(400, 'La distribución entre proveedores no puede superar 100%.', 'INVALID_SUPPLIER_ALLOCATION');
  const link = await db.prepare('SELECT id FROM guide_lots WHERE id = ? AND guide_id = ?').bind(guideLotId, guideId).first<{ id: string }>();
  if (!link) throw new HttpError(404, 'El lote no pertenece a la guía.', 'GUIDE_LOT_NOT_FOUND');
  const placeholders = suppliers.map(() => '?').join(', ');
  const valid = await db.prepare(`SELECT id FROM counterparties WHERE id IN (${placeholders}) AND type = 'PROVEEDOR' AND active = 1`).bind(...suppliers.map((supplier) => supplier.supplierId)).all<{ id: string }>();
  if (valid.results.length !== suppliers.length) throw new HttpError(400, 'Uno o más proveedores no existen o no están activos.', 'INVALID_SUPPLIER');
  const now = new Date().toISOString();
  const before = await db.prepare('SELECT supplier_id AS supplierId, allocation_percent AS allocationPercent FROM lot_suppliers WHERE guide_lot_id = ?').bind(guideLotId).all();
  const after = { guideId, guideLotId, suppliers };
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM lot_suppliers WHERE guide_lot_id = ?').bind(guideLotId),
    prepareAuditLog({ db, actor, action: 'SUPPLIERS_REPLACED', entityType: 'guide_lot', entityId: guideLotId, before: before.results, after, occurredAt: now }),
  ];
  for (const supplier of suppliers) statements.push(db.prepare('INSERT INTO lot_suppliers (id, guide_lot_id, supplier_id, allocation_percent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), guideLotId, supplier.supplierId, supplier.allocationPercent ?? null, now, now));
  await executeAtomically(db, statements);
  return { id: guideLotId, supplierCount: suppliers.length };
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
