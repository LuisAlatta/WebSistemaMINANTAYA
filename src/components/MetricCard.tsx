import { ReactNode } from "react";

type MetricCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: "positive" | "negative" | "neutral";
  variant?: "default" | "primary" | "warning" | "success" | "accent";
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  variant = "default",
}: MetricCardProps) {
  let cardBg = "bg-white border-[#dce5e1]";
  let iconBg = "bg-[#f1f6f4] text-[#2e6b61]";
  let valueColor = "text-[#10242b]";

  if (variant === "primary") {
    cardBg = "bg-[#f2f8f6] border-[#b8ded4]";
    iconBg = "bg-[#2e6b61] text-white";
    valueColor = "text-[#1d4c44]";
  } else if (variant === "warning") {
    cardBg = "bg-[#fffaf0] border-[#fae2b8]";
    iconBg = "bg-[#fef3c7] text-[#92400e]";
    valueColor = "text-[#92400e]";
  } else if (variant === "success") {
    cardBg = "bg-[#f0fdf4] border-[#bbf7d0]";
    iconBg = "bg-[#dcfce7] text-[#166534]";
    valueColor = "text-[#166534]";
  } else if (variant === "accent") {
    cardBg = "bg-[#f8fafc] border-[#cbd5e1]";
    iconBg = "bg-[#e2e8f0] text-[#334155]";
    valueColor = "text-[#0f172a]";
  }

  return (
    <div
      className={`rounded-xl border p-4 shadow-xs transition-shadow hover:shadow-sm ${cardBg}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#59756f]">
          {title}
        </p>
        {icon && (
          <div
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
          >
            {icon}
          </div>
        )}
      </div>
      <p className={`mt-2 font-mono text-2xl font-bold tracking-tight ${valueColor}`}>
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs text-[#6e847f]">{subtitle}</p>
      )}
    </div>
  );
}
