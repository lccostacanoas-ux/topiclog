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

    if (!email.trim() || !password.trim()) {
      setProblem({
        title: "Dados incompletos",
        status: 400,
        detail: "Informe seu e-mail e senha para entrar."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({ email: email.trim(), password: password.trim() });
      if (result.ok) {
        router.push("/minha-conta");
      } else {
        const prob = result.problem;
        if (prob?.ruleCode === "AUTH_INVALID_CREDENTIALS" || result.status === 400 || result.status === 401) {
          setProblem({
            title: "E-mail ou senha incorretos",
            status: result.status,
            detail: "Verifique o e-mail e a senha informados e tente novamente. Se ainda não possui cadastro, clique em 'Cadastrar gratuitamente'."
          });
        } else if (result.status === 423) {
          setProblem({
            title: "Tentativas excessivas",
            status: 423,
            detail: "Muitas tentativas com senha incorreta. Por segurança, aguarde alguns instantes para tentar novamente."
          });
        } else {
          setProblem(prob ?? {
            title: "Falha na autenticação",
            status: result.status,
            detail: "Não foi possível autenticar. Verifique sua conexão e tente novamente."
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <div className="card">
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-primary, #2563EB)" }}>
            TopicLog • Acesso Seguro
          </span>
          <h1 style={{ fontSize: "28px", lineHeight: "36px", marginTop: "8px", marginBottom: "8px", color: "var(--color-brand-deep-navy, #0F172A)" }}>
            Entrar na Conta
          </h1>
          <p style={{ color: "var(--color-muted, #64748B)", fontSize: "14px", marginBottom: "20px" }}>
            Acesse para publicar encomendas, acompanhar entregas e conversar com transportadores.
          </p>

          {isAuthenticated && (
            <div style={{ marginBottom: "20px" }}>
              <AlertBanner
                tone="info"
                title="Sessão ativa"
                message="Você já está conectado nesta sessão."
              />
              <Link href="/minha-conta" className="btn btn--secondary" style={{ width: "100%", marginTop: "8px" }}>
                Ir para Minha Conta
              </Link>
            </div>
          )}

          {problem && (
            <AlertBanner
              tone={problem.status === 423 ? "warning" : "danger"}
              title={problem.title}
              message={problem.detail}
              onClose={() => setProblem(null)}
            />
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="login-email" className="form-label">
                E-mail ou Usuário *
              </label>
              <input
                id="login-email"
                type="text"
                autoComplete="username"
                required
                className="form-input"
                placeholder="seu.email@exemplo.com.br"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password" className="form-label">
                Senha *
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="form-input"
                  style={{ paddingRight: "44px" }}
                  placeholder="Sua senha secreta"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "#64748B",
                    fontSize: "18px",
                    cursor: "pointer",
                    padding: "4px 6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  title={showPassword ? "Ocultar senha" : "Ver senha"}
                  aria-label={showPassword ? "Ocultar senha" : "Ver senha"}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
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
