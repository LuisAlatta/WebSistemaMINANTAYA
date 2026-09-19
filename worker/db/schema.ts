export const guideStatuses = [
  'EMITIDA',
  'EN_PLANTA',
  'LEYES_PENDIENTES',
  'LEYES_RECIBIDAS',
  'PROPUESTA_PENDIENTE',
  'CONFORME',
  'REMUESTREO',
  'DIRIMENCIA',
  'LIQUIDADA',
  'FACTURADA',
  'ANULADA',
  'RETIRO_PENDIENTE',
  'RETIRADA',
] as const;

export type GuideStatus = (typeof guideStatuses)[number];

export type GuideRow = {
  id: string;
  gre_original: string;
  gre_normalized: string;
  issued_at: string;
  status: GuideStatus;
};

export type AuditLogRow = {
  id: string;
  actor_username: string;
  actor_source: 'access' | 'local';
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
  created_at: string;
};
