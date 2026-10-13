"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { StatusPill } from "../../components/StatusPill";
import { getTermsManifestApi } from "../../lib/api-client";
import type { TermsResponsibilityManifestResponse } from "../../lib/types";

const FALLBACK_TERMS_MANIFEST: TermsResponsibilityManifestResponse = {
  termsVersion: "2026.1-D08-DRAFT",
  decisionCode: "D08",
  hasAbsolutePlatformExemptionClause: false,
  legalPrinciple:
    "Os termos e contratos distribuem responsabilidades entre remetente, transportador e Topic Log dentro da lei; nenhuma cláusula assegura isenção absoluta da plataforma (D08).",
  responsibilities: [
    {
      actor: "SENDER",
      legalSummary:
        "Responsabilidade pela licitude, embalagem adequada e veracidade da declaração do objeto.",
      obligations: [
        "Não enviar itens ilícitos, perigosos ou proibidos pela legislação brasileira.",
        "Declarar peso real em gramas compatível com o modal contratado (5 kg bicicleta, 20 kg moto/carro — D04).",
        "Fornecer código de segurança válido na entrega (D16)."
      ]
    },
    {
      actor: "CARRIER",
      legalSummary:
        "Responsabilidade pela guarda zelosa, condução regular do veículo e comprovação idônea de entrega.",
      obligations: [
        "Respeitar limites legais de trânsito, habilitação e capacidade real declarada do veículo (D04).",
        "Coletar o código de segurança do destinatário e registrar foto privada na entrega normal (D16).",
        "Não declarar entrega por ato unilateral para liberação de repasse."
      ]
    },
    {
      actor: "TOPIC_LOG_PLATFORM",
      legalSummary:
        "Responsabilidade pela segurança da intermediação tecnológica, custódia de regras, suporte e mediação de disputas nos termos do CDC e Marco Civil.",
      obligations: [
        "Verificar identidade bilateral (KYC) antes de permitir qualquer contratação (D05).",
        "Bloquear repasse financeiro em caso de disputa aberta ou ausência de prova dupla (D16, D17).",
        "Manter trilha imutável de auditoria e canais de revisão humana sem cláusula abusiva de isenção total (D08)."
      ]
    }
  ]
};

export default function TermsPage(): React.JSX.Element {
  const [manifest, setManifest] = useState<TermsResponsibilityManifestResponse>(FALLBACK_TERMS_MANIFEST);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    void getTermsManifestApi().then(res => {
      if (isMounted) {
        if (res.ok && res.data) {
          setManifest(res.data);
        }
        setIsLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
      <header className="card" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)" }}>
            Topic Log • Governança Contratual e Jurídica (D08)
          </span>
          <StatusPill
            label={manifest.hasAbsolutePlatformExemptionClause ? "Cláusula Inválida" : "Sem Isenção Absoluta (D08)"}
            tone={manifest.hasAbsolutePlatformExemptionClause ? "danger" : "success"}
          />
        </div>

        <h1 style={{ fontSize: "30px", lineHeight: "38px", marginTop: "12px", marginBottom: "8px" }}>
          Manifesto de Responsabilidade Distribuída
        </h1>
        <p style={{ color: "var(--color-muted)", margin: 0, fontSize: "15px" }}>
          Versão vigente: <strong>{manifest.termsVersion}</strong> • Código vinculante: <strong>{manifest.decisionCode}</strong>
        </p>
      </header>

      <div className="card" style={{ marginBottom: "24px", borderLeft: "4px solid var(--color-primary)" }}>
        <h2 style={{ fontSize: "20px", marginTop: 0, marginBottom: "8px" }}>
          Princípio Jurídico Fundamental (D08 / CDC)
        </h2>
        <p style={{ margin: 0, fontSize: "15px", lineHeight: "24px", color: "var(--color-text)" }}>
          &ldquo;{manifest.legalPrinciple}&rdquo;
        </p>
      </div>

      <section aria-labelledby="responsabilidades-heading" style={{ marginBottom: "24px" }}>
        <h2 id="responsabilidades-heading" style={{ fontSize: "24px", lineHeight: "32px", marginBottom: "16px" }}>
          Distribuição Tripartite de Responsabilidades
        </h2>

        <div className="grid-cards" style={{ gridTemplateColumns: "1fr" }}>
          {manifest.responsibilities.map(resp => {
            const roleName =
              resp.actor === "SENDER"
                ? "Remetente / Cliente (SENDER)"
                : resp.actor === "CARRIER"
                ? "Transportador (CARRIER)"
                : "Plataforma Topic Log (TOPIC_LOG_PLATFORM)";

            const badgeTone =
              resp.actor === "TOPIC_LOG_PLATFORM" ? "primary" : resp.actor === "CARRIER" ? "success" : "neutral";

            return (
              <article key={resp.actor} className="card" style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <h3 style={{ margin: 0, fontSize: "20px" }}>{roleName}</h3>
                  <span
                    style={{
                      fontSize: "12px",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: badgeTone === "primary" ? "var(--color-primary-bg)" : "var(--color-background)",
                      color: badgeTone === "primary" ? "var(--color-primary)" : "var(--color-text)",
                      fontWeight: 600
                    }}
                  >
                    Papel: {resp.actor}
                  </span>
                </div>

                <p style={{ color: "var(--color-text)", fontWeight: 500, marginBottom: "12px", fontSize: "15px" }}>
                  {resp.legalSummary}
                </p>

                <h4 style={{ fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-muted)", margin: "0 0 8px 0" }}>
                  Obrigações Expressas:
                </h4>
                <ul style={{ paddingLeft: "20px", margin: 0, color: "var(--color-muted)" }}>
                  {resp.obligations.map((ob, idx) => (
                    <li key={idx} style={{ marginBottom: "6px", lineHeight: "22px" }}>
                      {ob}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h3 style={{ margin: "0 0 4px 0", fontSize: "18px" }}>Pronto para participar?</h3>
          <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "14px" }}>
            Você pode criar conta gratuitamente e navegar sem KYC inicial (D05).
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link href="/cadastro" className="btn btn--primary">
            Criar Conta Gratuita
          </Link>
          <Link href="/entrar" className="btn btn--outline">
            Fazer Login
          </Link>
        </div>
      </div>
    </main>
  );
}
