import React from "react";
import { FinancialBreakdownPreview } from "../components/FinancialBreakdownPreview";
import { StatusPill } from "../components/StatusPill";
import { DEFAULT_TOPICLOG_SYSTEM_STATE } from "../lib/api-client";

/**
 * Home Pública e Painel de Fundação Técnica (PR-00.3)
 * Segue estritamente 01-PRD-Produto.md, 02-TRD-Tecnico.md, 03-Fluxos.md e 04-Design-System.md.
 */
export default function HomePage(): React.JSX.Element {
  const state = DEFAULT_TOPICLOG_SYSTEM_STATE;
  const bikeKg = state.defaultVehicleLimitsGrams.BICYCLE / 1000;
  const motoKg = state.defaultVehicleLimitsGrams.MOTORCYCLE / 1000;
  const carKg = state.defaultVehicleLimitsGrams.CAR / 1000;

  return (
    <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
      <header className="card" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)" }}>
            Fundação Técnica PR-00 • Monólito Modular (.NET 10 LTS + Next.js)
          </span>
          <StatusPill label={`Modo: ${state.featureFlags.environmentMode} (Pagamentos Reais Desativados)`} tone="warning" />
        </div>

        <h1 style={{ fontSize: "30px", lineHeight: "38px", marginTop: "12px", marginBottom: "12px" }}>
          {state.productName} — Conexão de Pequenas Encomendas e Rotas em Minas Gerais
        </h1>

        <p style={{ color: "var(--color-muted)", margin: "0 0 16px 0", maxWidth: "820px" }}>
          Cadastro e pesquisa abertos para todos os municípios de <strong>Minas Gerais ({state.targetStateUf})</strong>, com
          prioridade de implantação piloto em <strong>João Monlevade (1ª prioridade)</strong> e{" "}
          <strong>Belo Horizonte (2ª prioridade)</strong>. A presença de um município na busca não garante disponibilidade
          imediata de transportadores ativos (D02).
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          <a href="/cadastro" className="btn btn--primary">
            Criar Conta Gratuita (Sem KYC Inicial)
          </a>
          <a href="/entrar" className="btn btn--outline">
            Fazer Login
          </a>
          <a href="/verificacao-kyc" className="btn btn--secondary">
            Verificação KYC e Elegibilidade (D05)
          </a>
          <a href="/termos" className="btn btn--outline">
            Termos e Responsabilidades (D08)
          </a>
        </div>
      </header>

      <section aria-labelledby="modais-heading" style={{ marginBottom: "24px" }}>
        <h2 id="modais-heading" style={{ fontSize: "24px", lineHeight: "32px", marginBottom: "16px" }}>
          Modais Habilitados e Limites Iniciais Configuráveis (D03 / D04)
        </h2>

        <div className="grid-cards">
          <article className="card">
            <h3 style={{ marginTop: 0, fontSize: "20px" }}>Bicicleta (BICYCLE)</h3>
            <p style={{ color: "var(--color-muted)" }}>
              Ideal para pequenos objetos urbanos de curtíssima distância.
            </p>
            <StatusPill label={`Peso máximo padrão: ${bikeKg} kg (${state.defaultVehicleLimitsGrams.BICYCLE} g)`} tone="neutral" />
          </article>

          <article className="card">
            <h3 style={{ marginTop: 0, fontSize: "20px" }}>Motocicleta (MOTORCYCLE)</h3>
            <p style={{ color: "var(--color-muted)" }}>
              Encomendas pequenas urbanas e intermunicipais, sujeito à capacidade real e normas legais.
            </p>
            <StatusPill label={`Peso máximo padrão: ${motoKg} kg (${state.defaultVehicleLimitsGrams.MOTORCYCLE} g)`} tone="neutral" />
          </article>

          <article className="card">
            <h3 style={{ marginTop: 0, fontSize: "20px" }}>Carro (CAR)</h3>
            <p style={{ color: "var(--color-muted)" }}>
              Aproveitamento de capacidade ociosa em rotas entre municípios mineiros.
            </p>
            <StatusPill label={`Peso máximo padrão: ${carKg} kg (${state.defaultVehicleLimitsGrams.CAR} g)`} tone="neutral" />
          </article>
        </div>
      </section>

      <section className="grid-two" aria-label="Regras de segurança, KYC e seguro" style={{ marginBottom: "24px" }}>
        <article className="card">
          <h2 style={{ marginTop: 0, fontSize: "20px", lineHeight: "28px" }}>
            KYC Progressivo e Dupla Prova de Entrega (D05 / D16)
          </h2>
          <ul style={{ paddingLeft: "20px", color: "var(--color-muted)", margin: 0 }}>
            <li style={{ marginBottom: "8px" }}>
              <strong>Navegação livre:</strong> Você pode criar conta e pesquisar rotas/encomendas sem concluir o KYC.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Bloqueio bilateral na contratação:</strong> O aceite final exige verificação válida (CPF, documento,
              endereço e biometria facial por parceiro homologado) tanto do remetente quanto do transportador.
            </li>
            <li>
              <strong>Confirmação de entrega:</strong> Exige <strong>código de segurança único + foto privada</strong> (ou
              fluxo de exceção auditado com revisão humana autorizada). Ato unilateral do transportador nunca libera repasse.
            </li>
          </ul>
        </article>

        <article className="card">
          <h2 style={{ marginTop: 0, fontSize: "20px", lineHeight: "28px" }}>
            Manifestação de Interesse em Seguro (D06)
          </h2>
          <p style={{ color: "var(--color-muted)" }}>
            No MVP, o seguro não é comercializado. Durante a publicação da encomenda, o remetente poderá apenas registrar
            interesse estatístico para futura integração:
          </p>
          <div
            style={{
              padding: "12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-warning)",
              backgroundColor: "var(--color-warning-bg)"
            }}
          >
            <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontWeight: 600 }}>
              <input type="checkbox" disabled aria-describedby="insurance-disclaimer-text" />
              <span>Tenho interesse em seguro (Demonstração PR-00)</span>
            </label>
            <p id="insurance-disclaimer-text" style={{ margin: "8px 0 0 0", fontSize: "14px", color: "var(--color-warning)" }}>
              Aviso obrigatório: &ldquo;{state.insurance.mandatoryDisclaimer}&rdquo;.
            </p>
          </div>
        </article>
      </section>

      <FinancialBreakdownPreview
        transportAmountCents={10000}
        freeCommissionRate={state.commercialPolicies.freePlanCommissionRate}
        premiumCommissionRate={state.commercialPolicies.premiumPlanCommissionRate}
        premiumMonthlyPriceCents={state.commercialPolicies.premiumPlanMonthlyPriceCents}
      />
    </main>
  );
}
