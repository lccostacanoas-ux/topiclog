import React from "react";
import type { ProblemDetailsDto } from "../lib/types";

export type AlertBannerTone = "info" | "success" | "warning" | "danger";

export interface AlertBannerProps {
  readonly tone?: AlertBannerTone;
  readonly title?: string;
  readonly message?: string;
  readonly problem?: ProblemDetailsDto;
  readonly onClose?: () => void;
}

/**
 * Componente AlertBanner acessível (WCAG 2.2 AA / RFC 9457 ProblemDetails).
 * Anuncia dinamicamente mensagens para leitores de tela com role="alert".
 */
export function AlertBanner({
  tone = "info",
  title,
  message,
  problem,
  onClose
}: AlertBannerProps): React.JSX.Element {
  const effectiveTitle = title ?? problem?.title ?? "Atenção";
  const effectiveMessage = message ?? problem?.detail;
  const ruleCode = problem?.ruleCode;
  const correlationId = problem?.correlationId;

  const prefixIcon: Record<AlertBannerTone, string> = {
    info: "ℹ",
    success: "✓",
    warning: "⚠",
    danger: "✖"
  };

  return (
    <div
      className={`alert-banner alert-banner--${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
        <div>
          <strong style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span aria-hidden="true">{prefixIcon[tone]}</span>
            <span>{effectiveTitle}</span>
          </strong>

          {effectiveMessage && (
            <p style={{ margin: "6px 0 0 0" }}>{effectiveMessage}</p>
          )}

          {(ruleCode || correlationId) && (
            <div style={{ marginTop: "6px", fontSize: "12px", opacity: 0.9 }}>
              {ruleCode && (
                <span style={{ marginRight: "12px" }}>
                  Código: <code>{ruleCode}</code>
                </span>
              )}
              {correlationId && (
                <span>
                  ID de Correlação: <code>{correlationId}</code>
                </span>
              )}
            </div>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar aviso"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "16px",
              lineHeight: 1,
              color: "inherit",
              padding: "4px"
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
