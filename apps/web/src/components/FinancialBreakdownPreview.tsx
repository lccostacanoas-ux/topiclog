import React from "react";
import { StatusPill } from "./StatusPill";

export interface FinancialBreakdownPreviewProps {
  readonly transportAmountCents: number;
  readonly freeCommissionRate?: number;
  readonly premiumCommissionRate?: number;
  readonly premiumMonthlyPriceCents?: number;
  readonly fixedCarrierFeeCents?: number;
}

function formatBrlFromCents(cents: number): string {
  const reais = cents / 100;
  return reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

/**
 * Componente FinancialBreakdown conforme 04-Design-System.md (Seção 4, 5 e 6)
 * Modelo oficial: Repasse líquido de 85% descontada a taxa fixa operacional de R$ 1,99 por corrida (configurada no console administrativo).
 */
export function FinancialBreakdownPreview({
  transportAmountCents,
  freeCommissionRate = 0.15,
  fixedCarrierFeeCents = 199
}: FinancialBreakdownPreviewProps): React.JSX.Element {
  const commissionRatePercent = Math.round(freeCommissionRate * 100);
  const commissionCents = Math.round(transportAmountCents * freeCommissionRate);
  const grossCarrierReceivesCents = transportAmountCents - commissionCents;
  const carrierReceivesCents = Math.max(0, grossCarrierReceivesCents - fixedCarrierFeeCents);

  return (
    <section className="card" aria-labelledby="financial-preview-heading">
      <h2 id="financial-preview-heading" style={{ marginTop: 0, fontSize: "20px", lineHeight: "28px" }}>
        Transparência Financeira e Repasse Líquido (Taxa Configurável)
      </h2>
      <p style={{ color: "var(--color-muted)", marginTop: "4px" }}>
        A Topic Log opera com repasse direto ao transportador ({100 - commissionRatePercent}% do frete), deduzida a taxa fixa operacional por corrida ({formatBrlFromCents(fixedCarrierFeeCents)}), configurável no console administrativo. Todas as taxas de intermediação bancária (Pix, cartão e débito) são 100% absorvidas pela plataforma.
      </p>

      <div style={{ marginTop: "16px", maxWidth: "480px" }}>
        <div className="card" style={{ backgroundColor: "var(--color-background)" }}>
          <h3 style={{ marginTop: 0, fontSize: "16px" }}>Demonstrativo por Frete ({commissionRatePercent}% + {formatBrlFromCents(fixedCarrierFeeCents)})</h3>
          <dl style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <dt>Valor do transporte:</dt>
              <dd style={{ fontWeight: 600, margin: 0 }}>{formatBrlFromCents(transportAmountCents)}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <dt>Comissão da plataforma ({commissionRatePercent}%):</dt>
              <dd style={{ margin: 0, color: "var(--color-danger, #EF4444)" }}>- {formatBrlFromCents(commissionCents)}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <dt>Taxa fixa operacional por corrida:</dt>
              <dd style={{ margin: 0, color: "var(--color-danger, #EF4444)" }}>- {formatBrlFromCents(fixedCarrierFeeCents)}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <dt>Taxas de intermediação bancária / Pix:</dt>
              <dd style={{ margin: 0, color: "var(--color-success)" }}>R$ 0,00 (absorvidas)</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--color-border)" }}>
              <dt style={{ fontWeight: 700 }}>Você receberá (líquido):</dt>
              <dd style={{ fontWeight: 700, color: "var(--color-success)", margin: 0, fontSize: "18px" }}>
                {formatBrlFromCents(carrierReceivesCents)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div style={{ marginTop: "16px" }}>
        <p style={{ fontSize: "14px", color: "var(--color-muted)", marginBottom: "8px" }}>
          Estados padronizados do ciclo financeiro e de entrega (04-Design-System.md Seção 6 — D16/D17):
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <StatusPill label="Pagamento confirmado" tone="success" />
          <StatusPill label="Entrega aguardando confirmação" tone="warning" />
          <StatusPill label="Transferência solicitada" tone="neutral" />
          <StatusPill label="Transferência concluída" tone="success" />
          <StatusPill label="Crédito bancário pendente" tone="warning" />
        </div>
      </div>
    </section>
  );
}
