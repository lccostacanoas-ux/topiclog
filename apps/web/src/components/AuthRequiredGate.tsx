"use client";

import React from "react";
import Link from "next/link";

interface AuthRequiredGateProps {
  readonly title: string;
  readonly description: string;
}

/**
 * Bloqueio padrão para telas operacionais quando o usuário não está autenticado.
 */
export function AuthRequiredGate({ title, description }: AuthRequiredGateProps): React.JSX.Element {
  return (
    <main className="container" style={{ paddingTop: "40px", paddingBottom: "60px", maxWidth: "560px" }}>
      <div className="card" style={{ textAlign: "center", padding: "40px 24px", borderRadius: "16px", boxShadow: "var(--shadow-md)" }}>
        <div style={{ fontSize: "52px", marginBottom: "16px" }}>🔒</div>
        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Autenticação Necessária
        </span>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-brand-deep-navy)", margin: "8px 0 12px 0" }}>
          {title}
        </h1>
        <p style={{ color: "var(--color-muted)", fontSize: "14px", lineHeight: "1.5", marginBottom: "28px" }}>
          {description}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Link
            href="/entrar"
            className="btn btn--primary"
            style={{ padding: "12px 20px", fontSize: "14px", fontWeight: 700, textDecoration: "none", textAlign: "center" }}
          >
            Fazer Login na Conta
          </Link>
          <Link
            href="/cadastro"
            className="btn btn--outline"
            style={{ padding: "12px 20px", fontSize: "14px", fontWeight: 700, textDecoration: "none", textAlign: "center" }}
          >
            Criar Conta Gratuita
          </Link>
          <Link
            href="/"
            style={{ marginTop: "6px", fontSize: "13px", fontWeight: 600, color: "#64748B", textDecoration: "none" }}
          >
            ← Voltar para a Tela Inicial
          </Link>
        </div>
      </div>
    </main>
  );
}
