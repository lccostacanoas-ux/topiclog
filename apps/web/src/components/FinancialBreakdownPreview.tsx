import React from "react";
import { StatusPill } from "./StatusPill";

export interface FinancialBreakdownPreviewProps {
  readonly transportAmountCents: number;
  readonly freeCommissionRate: number;
  readonly premiumCommissionRate: number;
  readonly premiumMonthlyPriceCents: number;
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
 * e Decisões Vinculantes D10, D11, D12, D16 e D17.
 */
export function FinancialBreakdownPreview({
  transportAmountCents,
  freeCommissionRate,
  premiumCommissionRate,
  premiumMonthlyPriceCents
}: FinancialBreakdownPreviewProps): React.JSX.Element {
  const freeCommissionCents = Math.round(transportAmountCents * freeCommissionRate);
  const freeCarrierReceivesCents = transportAmountCents - freeCommissionCents;

  const premiumCommissionCents = Math.round(transportAmountCents * premiumCommissionRate);
  const premiumCarrierReceivesCents = transportAmountCents - premiumCommissionCents;

  return (
    <section className="card" aria-labelledby="financial-preview-heading">
      <h2 id="financial-preview-heading" style={{ marginTop: 0, fontSize: "20px", lineHeight: "28px" }}>
        Transparência Financeira e Microtextos Oficiais (Simulação em Centavos)
      </h2>
      <p style={{ color: "var(--color-muted)", marginTop: "4px" }}>
        A Topic Log absorve as taxas ordinárias do gateway (Pix, débito, crédito, parcelamento e transferência — D12).
        O remetente paga exatamente o mesmo <strong>Valor do transporte</strong> em qualquer método habilitado.
      </p>

      <div className="grid-two" style={{ marginTop: "16px" }}>
        <div className="card" style={{ backgroundColor: "var(--color-background)" }}>
          <h3 style={{ marginTop: 0, fontSize: "16px" }}>Plano Gratuito Inicial (Comissão 13% — D10)</h3>
          <dl style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <dt>Valor do transporte:</dt>
              <dd style={{ fontWeight: 600, margin: 0 }}>{formatBrlFromCents(transportAmountCents)}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <dt>Comissão da plataforma (13%):</dt>
              <dd style={{ margin: 0 }}>- {formatBrlFromCents(freeCommissionCents)}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--color-border)" }}>
              <dt style={{ fontWeight: 700 }}>Você receberá:</dt>
              <dd style={{ fontWeight: 700, color: "var(--color-success)", margin: 0 }}>
                {formatBrlFromCents(freeCarrierReceivesCents)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="card" style={{ backgroundColor: "var(--color-background)" }}>
          <h3 style={{ marginTop: 0, fontSize: "16px" }}>
            Pacote Premium Inicial ({formatBrlFromCents(premiumMonthlyPriceCents)}/mês e 7% — D11)
          </h3>
          <dl style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <dt>Valor do transporte:</dt>
              <dd style={{ fontWeight: 600, margin: 0 }}>{formatBrlFromCents(transportAmountCents)}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <dt>Comissão da plataforma (7%):</dt>
              <dd style={{ margin: 0 }}>- {formatBrlFromCents(premiumCommissionCents)}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--color-border)" }}>
              <dt style={{ fontWeight: 700 }}>Você receberá:</dt>
              <dd style={{ fontWeight: 700, color: "var(--color-success)", margin: 0 }}>
                {formatBrlFromCents(premiumCarrierReceivesCents)}
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
