"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { useAuth } from "../../lib/auth-context";
import type { ProblemDetailsDto } from "../../lib/types";

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [problem, setProblem] = useState<ProblemDetailsDto | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProblem(null);

    if (!email.trim() || !password) {
      setProblem({
        title: "Dados incompletos",
        status: 400,
        detail: "Informe o e-mail e a senha cadastrados."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({ email: email.trim(), password });
      if (result.ok) {
        router.push("/minha-conta");
      } else {
        setProblem(result.problem ?? {
          title: "Falha na autenticação",
          status: result.status,
          detail: "Verifique suas credenciais e tente novamente."
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <div className="card">
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)" }}>
            Topic Log • Autenticação Segura
          </span>
          <h1 style={{ fontSize: "28px", lineHeight: "36px", marginTop: "8px", marginBottom: "8px" }}>
            Entrar na Conta
          </h1>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "20px" }}>
            Acesso ao marketplace com proteção contra força bruta (PBKDF2-HMAC-SHA256 — DEC-02).
          </p>

          {isAuthenticated && (
            <div style={{ marginBottom: "20px" }}>
              <AlertBanner
                tone="info"
                title="Sessão ativa detectada"
                message="Você já possui uma sessão ativa nesta aba."
              />
              <Link href="/minha-conta" className="btn btn--secondary" style={{ width: "100%" }}>
                Ir para Minha Conta
              </Link>
            </div>
          )}

          {problem && (
            <AlertBanner
              tone={problem.status === 423 ? "warning" : "danger"}
              title={problem.status === 423 ? "Conta Temporariamente Bloqueada (DEC-02.4)" : problem.title}
              message={problem.detail}
              problem={problem}
              onClose={() => setProblem(null)}
            />
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="login-email" className="form-label">
                E-mail cadastrado
              </label>
              <input
                id="login-email"
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

            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label htmlFor="login-password" className="form-label">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-primary)",
                    fontSize: "13px",
                    cursor: "pointer",
                    padding: 0
                  }}
                >
                  {showPassword ? "Ocultar senha" : "Ver senha"}
                </button>
              </div>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="form-input"
                placeholder="Sua senha secreta"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
              <Link
                href="/recuperar-acesso"
                style={{ fontSize: "14px", color: "var(--color-primary)", textDecoration: "none" }}
              >
                Esqueceu a senha ou conta bloqueada?
              </Link>
            </div>

            <button
              type="submit"
              className="btn btn--primary"
              style={{ width: "100%", padding: "12px" }}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Autenticando..." : "Entrar na Topic Log"}
            </button>
          </form>

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
            Ainda não tem conta?{" "}
            <Link
              href="/cadastro"
              style={{ fontWeight: 600, color: "var(--color-primary)", textDecoration: "none" }}
            >
              Criar conta gratuita
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
