type StatusBadgeProps = {
  status: unknown;
  className?: string;
};

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  if (status === null || status === undefined || status === "") {
    return <span className="text-[#879b95]">—</span>;
  }

  const raw = String(status).trim();
  const normalized = raw.toUpperCase().replace(/\s+/g, "_");

  // Semantic styles
  let badgeStyle = "bg-[#f1f5f3] text-[#476059] border-[#d2ded9]";

  if (
    [
      "PAGADO",
      "PAGADA",
      "CONFIRMADO",
      "CONFORME",
      "RECIBIDO",
      "APROBADA",
      "APROBADO",
      "ACTIVO",
      "REGISTRADO",
      "CERRADO",
      "CERRADA",
    ].includes(normalized)
  ) {
    badgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-200";
  } else if (
    [
      "PENDIENTE",
      "EMITIDA",
      "REGISTRADA",
      "FALTA",
      "BORRADOR",
      "EN_PLANTA",
      "LEYES_PENDIENTES",
      "LEYES_RECIBIDAS",
      "PROPUESTA_PENDIENTE",
      "RETIRO_PENDIENTE",
      "ENVIADA",
      "ENVIADO_PROVEEDOR",
      "SOLICITADO",
      "COORDINADO",
    ].includes(normalized)
  ) {
    badgeStyle = "bg-amber-50 text-amber-800 border-amber-200";
  } else if (
    [
      "ANULADA",
      "ANULADO",
      "DADA_DE_BAJA",
      "RECHAZADA",
      "OBSERVADO",
      "OBSERVADA",
      "RETIRADA",
      "RETIRADO",
    ].includes(normalized)
  ) {
    badgeStyle = "bg-rose-50 text-rose-800 border-rose-200";
  } else if (
    [
      "FACTURADA",
      "LIQUIDADA",
      "REMUESTREO",
      "DIRIMENCIA",
      "ENVIADO_LABORATORIO",
      "RESULTADO_RECIBIDO",
      "MUESTRAS_ENVIADAS",
      "ANALISIS_LIMA",
    ].includes(normalized)
  ) {
    badgeStyle = "bg-sky-50 text-sky-800 border-sky-200";
  }

  const displayText = raw.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-none ${badgeStyle} ${className}`}
    >
      {displayText}
    </span>
  );
}
