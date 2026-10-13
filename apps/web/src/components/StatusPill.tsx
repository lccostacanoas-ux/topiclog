import React from "react";

export type StatusPillTone = "success" | "warning" | "danger" | "neutral";

export interface StatusPillProps {
  readonly label: string;
  readonly tone?: StatusPillTone;
}

/**
 * Componente StatusPill conforme 04-Design-System.md (Seção 4 e Seção 7 — Acessibilidade WCAG 2.2 AA).
 * Não depende apenas de cor: exibe indicador textual/simbólico junto ao rótulo.
 */
export function StatusPill({ label, tone = "neutral" }: StatusPillProps): React.JSX.Element {
  const prefixSymbol: Record<StatusPillTone, string> = {
    success: "●",
    warning: "▲",
    danger: "■",
    neutral: "◆"
  };

  return (
    <span className={`status-pill status-pill--${tone}`} role="status">
      <span aria-hidden="true">{prefixSymbol[tone]}</span>
      <span>{label}</span>
    </span>
  );
}
