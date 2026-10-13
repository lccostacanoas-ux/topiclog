"use client";

import Link from "next/link";
import React, { useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";

export default function AccountRecoveryPage(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<"forgot_password" | "account_locked">("forgot_password");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Informe o e-mail cadastrado.");
      return;
    }

    setIsSubmitting(true);
    // Simulação determinística de feedback neutro anti-enumeração (OWASP)
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 400);
  };

  return (
    <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
      <div style={{ maxWidth: "540px", margin: "0 auto" }}>
        <div className="card">
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)" }}>
            Topic Log • Suporte e Recuperação (PR-01)
          </span>
          <h1 style={{ fontSize: "28px", lineHeight: "36px", marginTop: "8px", marginBottom: "8px" }}>
            Recuperação de Acesso
          </h1>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "20px" }}>
            Orientações para recuperação de senha e desbloqueio de contas em ambiente de testes.
          </p>

          <AlertBanner
            tone="warning"
            title="Aviso de Ambiente de Testes (D14 / Pendência 12)"
            message="O provedor externo de e-mail e SMS ainda não foi homologado para produção (DOCS/07-Pendencias.md Seção 12). Nenhum e-mail externo automático é disparado nesta etapa."
          />

          {isSubmitted ? (
            <div style={{ marginTop: "16px" }}>
              <AlertBanner
                tone="success"
                title="Solicitação processada com sucesso"
                message="Se o e-mail informado estiver registrado na plataforma, a solicitação foi registrada no protocolo de auditoria de testes."
              />

              <div
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-background)",
                  border: "1px solid var(--color-border)",
                  fontSize: "14px",
                  lineHeight: "22px",
                  marginBottom: "20px"
                }}
              >
                <h2 style={{ fontSize: "16px", marginTop: 0, marginBottom: "8px" }}>
                  Instruções para o Ambiente de Testes:
                </h2>
                <ul style={{ paddingLeft: "20px", margin: 0, color: "var(--color-muted)" }}>
                  <li style={{ marginBottom: "6px" }}>
                    <strong>Bloqueio temporário (423 Locked):</strong> Se você errou a senha 5 vezes consecutivas, o bloqueio do backend expira automaticamente após <strong>15 minutos</strong>.
                  </li>
                  <li style={{ marginBottom: "6px" }}>
                    <strong>Redefinição de senha de testes:</strong> Para contas sintéticas do piloto local, a redefinição é efetuada pelo operador no perfil de suporte autorizado (RBAC).
                  </li>
                </ul>
              </div>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <Link href="/entrar" className="btn btn--primary" style={{ flex: 1 }}>
                  Voltar para o Login
                </Link>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => {
                    setIsSubmitted(false);
                    setEmail("");
                  }}
                >
                  Nova solicitação
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <AlertBanner
                  tone="danger"
                  title="Atenção"
                  message={error}
                  onClose={() => setError(null)}
                />
              )}

              <div className="form-group">
                <label htmlFor="recovery-reason" className="form-label">
                  Qual é o motivo da solicitação?
                </label>
                <select
                  id="recovery-reason"
                  className="form-select"
                  value={reason}
                  onChange={e => setReason(e.target.value as "forgot_password" | "account_locked")}
                  disabled={isSubmitting}
                >
                  <option value="forgot_password">Esqueci minha senha cadastrada</option>
                  <option value="account_locked">Minha conta foi bloqueada por tentativas inválidas (HTTP 423)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="recovery-email" className="form-label">
                  E-mail cadastrado na conta
                </label>
                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  required
                  className="form-input"
                  placeholder="seu.email@exemplo.com.br"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <button
                type="submit"
                className="btn btn--primary"
                style={{ width: "100%", padding: "12px" }}
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "Processando solicitação..." : "Enviar Solicitação de Recuperação"}
              </button>
            </form>
          )}

          <div
            style={{
              marginTop: "24px",
              paddingTop: "20px",
              borderTop: "1px solid var(--color-border)",
              textAlign: "center",
              fontSize: "14px",
              color: "var(--color-muted)"
            }}
          >
            Lembrou suas credenciais?{" "}
            <Link
              href="/entrar"
              style={{ fontWeight: 600, color: "var(--color-primary)", textDecoration: "none" }}
            >
              Fazer login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
