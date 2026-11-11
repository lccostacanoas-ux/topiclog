"use client";

import Link from "next/link";
import React, { useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { confirmPasswordResetApi, requestPasswordResetApi } from "../../lib/api-client";

type RecoveryStep = "REQUEST" | "RESET" | "DONE";

export default function AccountRecoveryPage(): React.JSX.Element {
  const [step, setStep] = useState<RecoveryStep>("REQUEST");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleRequestCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Informe o e-mail válido cadastrado na sua conta.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await requestPasswordResetApi(trimmedEmail);
      if (!res.ok) {
        setError(res.problem?.detail || "Não foi possível enviar o código agora. Tente novamente em instantes.");
        return;
      }

      setInfoMsg(
        res.data?.message ||
          "Se o e-mail informado estiver cadastrado, enviamos um código de 6 dígitos válido por 15 minutos."
      );
      setStep("RESET");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    const digitsCode = code.replace(/\D/g, "");

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Informe o e-mail da conta.");
      return;
    }
    if (digitsCode.length !== 6) {
      setError("Informe o código de 6 dígitos enviado para o seu e-mail.");
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError("A nova senha deve ter no mínimo 8 caracteres, combinando letras e números.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await confirmPasswordResetApi({
        email: trimmedEmail,
        code: digitsCode,
        newPassword
      });

      if (!res.ok) {
        setError(res.problem?.detail || "Código inválido ou expirado. Verifique os dados ou solicite um novo código.");
        return;
      }

      setStep("DONE");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
      <div style={{ maxWidth: "540px", margin: "0 auto" }}>
        <div className="card">
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)" }}>
            Topic Log • Segurança e Acesso
          </span>
          <h1 style={{ fontSize: "26px", lineHeight: "34px", marginTop: "8px", marginBottom: "8px" }}>
            Recuperar Senha por E-mail
          </h1>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "20px" }}>
            Enviaremos um código temporário de 6 dígitos para o e-mail cadastrado na sua conta (válido por 15 minutos). Se sua conta estiver bloqueada por tentativas erradas, a redefinição também desbloqueia o acesso.
          </p>

          {error && (
            <AlertBanner
              tone="danger"
              title="Atenção"
              message={error}
              onClose={() => setError(null)}
            />
          )}

          {infoMsg && step !== "DONE" && (
            <AlertBanner
              tone="info"
              title="Verifique sua caixa de entrada (e Spam)"
              message={infoMsg}
            />
          )}

          {step === "REQUEST" && (
            <form onSubmit={handleRequestCode} noValidate>
              <div className="form-group">
                <label htmlFor="recovery-email" className="form-label">
                  E-mail cadastrado na conta *
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
                style={{ width: "100%", padding: "12px", fontWeight: 700 }}
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "Enviando código por e-mail..." : "📧 Enviar Código de Recuperação"}
              </button>

              <button
                type="button"
                className="btn btn--outline"
                style={{ width: "100%", marginTop: "10px", padding: "10px" }}
                onClick={() => {
                  setError(null);
                  setStep("RESET");
                }}
              >
                Já tenho o código de 6 dígitos no meu e-mail
              </button>
            </form>
          )}

          {step === "RESET" && (
            <form onSubmit={handleResetPassword} noValidate>
              <div className="form-group">
                <label htmlFor="reset-email" className="form-label">
                  E-mail da conta *
                </label>
                <input
                  id="reset-email"
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
                <label htmlFor="reset-code" className="form-label">
                  Código de 6 dígitos enviado no e-mail *
                </label>
                <input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  className="form-input"
                  style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "6px", textAlign: "center" }}
                  placeholder="000000"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="reset-new-pw" className="form-label">
                  Nova senha forte *
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="reset-new-pw"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    className="form-input"
                    style={{ paddingRight: "44px" }}
                    placeholder="Mínimo 8 caracteres (letras e números)"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
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
                      padding: "4px 6px"
                    }}
                    aria-label={showPassword ? "Ocultar senha" : "Ver senha"}
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="reset-confirm-pw" className="form-label">
                  Confirmar nova senha *
                </label>
                <input
                  id="reset-confirm-pw"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="form-input"
                  placeholder="Repita a nova senha"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <button
                type="submit"
                className="btn btn--primary"
                style={{ width: "100%", padding: "12px", fontWeight: 700 }}
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "Salvando nova senha..." : "🔐 Gravar Nova Senha"}
              </button>

              <button
                type="button"
                className="btn btn--outline"
                style={{ width: "100%", marginTop: "10px", padding: "10px" }}
                disabled={isSubmitting}
                onClick={() => {
                  setError(null);
                  setStep("REQUEST");
                }}
              >
                ← Solicitar novo código
              </button>
            </form>
          )}

          {step === "DONE" && (
            <div>
              <AlertBanner
                tone="success"
                title="Senha redefinida com sucesso!"
                message="Sua nova senha já foi gravada com segurança. Agora você pode entrar na plataforma usando a nova senha."
              />

              <Link href="/entrar" className="btn btn--primary" style={{ width: "100%", padding: "12px", fontWeight: 700 }}>
                Ir para o Login
              </Link>
            </div>
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
            Lembrou sua senha atual?{" "}
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
