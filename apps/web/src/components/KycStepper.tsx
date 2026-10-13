import React from "react";
import type { KycStatus } from "../lib/types";
import { StatusPill } from "./StatusPill";

export interface KycStepperProps {
  readonly currentStatus: KycStatus;
}

export function KycStepper({ currentStatus }: KycStepperProps): React.JSX.Element {
  const steps = [
    {
      id: "NOT_STARTED",
      label: "1. Cadastro Inicial",
      description: "Navegação livre na plataforma (D05)"
    },
    {
      id: "IN_REVIEW",
      label: "2. Em Análise",
      description: "4 checks obrigatórios enviados por referência segura"
    },
    {
      id: "VERIFIED",
      label: "3. Verificado",
      description: "Apto para contratação bilateral (D05)"
    }
  ];

  const getStepClass = (stepId: string): string => {
    if (currentStatus === "VERIFIED") {
      return "stepper-item stepper-item--completed";
    }
    if (currentStatus === "IN_REVIEW" && stepId !== "VERIFIED") {
      return stepId === "IN_REVIEW"
        ? "stepper-item stepper-item--active"
        : "stepper-item stepper-item--completed";
    }
    if (stepId === "NOT_STARTED" && currentStatus === "NOT_STARTED") {
      return "stepper-item stepper-item--active";
    }
    if (currentStatus === "REJECTED" && stepId === "VERIFIED") {
      return "stepper-item";
    }
    return "stepper-item";
  };

  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-muted)" }}>
          Ciclo de Verificação de Identidade (KYC Progressivo — D05)
        </span>
        <StatusPill
          label={`Estado Atual: ${currentStatus}`}
          tone={
            currentStatus === "VERIFIED"
              ? "success"
              : currentStatus === "REJECTED"
              ? "danger"
              : currentStatus === "IN_REVIEW"
              ? "warning"
              : "neutral"
          }
        />
      </div>

      <ol className="stepper-list" aria-label="Progresso da verificação de identidade">
        {steps.map(step => (
          <li key={step.id} className={getStepClass(step.id)}>
            <div>
              <span style={{ display: "block" }}>{step.label}</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "normal" }}>
                {step.description}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
