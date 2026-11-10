"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { getTermsManifestApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { formatCpf, isValidCpf } from "../../lib/validation";
import type { ProblemDetailsDto } from "../../lib/types";

export default function RegisterPage(): React.JSX.Element {
  const router = useRouter();
  const { register } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [city, setCity] = useState("João Monlevade");
  const [isSender, setIsSender] = useState(true);
  const [isCarrier, setIsCarrier] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [termsVersion, setTermsVersion] = useState("2026.1-D08-DRAFT");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [problem, setProblem] = useState<ProblemDetailsDto | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  // Carrega versão vigente do manifesto de termos da API
  useEffect(() => {
    let isMounted = true;
    void getTermsManifestApi().then(res => {
      if (isMounted && res.ok && res.data) {
        setTermsVersion(res.data.termsVersion);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const passwordsMatch = !confirmPassword || password === confirmPassword;

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCpf(e.target.value);
    setCpf(formatted);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProblem(null);

    if (!displayName.trim() || !email.trim() || !password || !confirmPassword || !phone.trim() || !cpf.trim()) {
      setProblem({
        title: "Campos obrigatórios pendentes",
        status: 400,
        detail: "Preencha todos os campos obrigatórios (Nome, E-mail, Telefone, Senha, Confirmação e CPF)."
      });
      return;
    }

    if (password.length < 8) {
      setProblem({
        title: "Senha muito curta",
        status: 400,
        detail: "A senha deve conter ao menos 8 caracteres (letras e números)."
      });
      return;
    }

    if (password !== confirmPassword) {
      setProblem({
        title: "As senhas não coincidem",
        status: 400,
        detail: "A senha e a confirmação de senha devem ser exatamente iguais."
      });
      return;
    }

    if (!isValidCpf(cpf)) {
      setProblem({
        title: "CPF inválido",
        status: 400,
        detail: "Informe um CPF válido com 11 dígitos para continuar."
      });
      return;
    }

    if (!acceptTerms) {
      setProblem({
        title: "Aceite dos termos obrigatório",
        status: 400,
        detail: "É obrigatório aceitar os Termos de Uso vigentes para se cadastrar na plataforma."
      });
      return;
    }

    if (!isSender && !isCarrier) {
      setProblem({
        title: "Perfil obrigatório",
        status: 400,
        detail: "Selecione ao menos um perfil de acesso (Remetente ou Transportador) para concluir o cadastro."
      });
      return;
    }

    const initialRoles: ("SENDER" | "CARRIER")[] = [];
    if (isSender) initialRoles.push("SENDER");
    if (isCarrier) initialRoles.push("CARRIER");

    setIsSubmitting(true);
    try {
      const result = await register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        cpf: cpf.trim(),
        city: city.trim(),
        stateUf: "MG",
        initialRoles,
        acceptTerms: true,
        termsVersion
      });

      if (result.ok) {
        setSuccessModalOpen(true);
        setTimeout(() => {
          router.push("/minha-conta");
        }, 1600);
      } else {
        setProblem(result.problem ?? {
          title: "Falha no cadastro",
          status: result.status,
          detail: "Não foi possível concluir o cadastro. Verifique os dados informados e tente novamente."
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto" }}>
        <div className="card">
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary, #2563EB)" }}>
            Topic Log • Cadastro Seguro
          </span>
          <h1 style={{ fontSize: "28px", lineHeight: "36px", marginTop: "8px", marginBottom: "8px", color: "var(--color-brand-deep-navy, #0F172A)" }}>
            Criar Conta Gratuita
          </h1>
          <p style={{ color: "var(--color-muted, #64748B)", fontSize: "14px", marginBottom: "20px" }}>
            Crie sua conta para enviar ou transportar encomendas com segurança em Minas Gerais.
          </p>

          {problem && (
            <AlertBanner
              tone="danger"
              title={problem.title}
              message={problem.detail}
              problem={problem}
              onClose={() => setProblem(null)}
            />
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="reg-name" className="form-label">
                Nome completo ou comercial *
              </label>
              <input
                id="reg-name"
                type="text"
                required
                className="form-input"
                placeholder="Ex.: Maria de Oliveira"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid-two" style={{ gap: "16px", marginBottom: 0 }}>
              <div className="form-group">
                <label htmlFor="reg-email" className="form-label">
                  E-mail *
                </label>
                <input
                  id="reg-email"
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
                <label htmlFor="reg-phone" className="form-label">
                  Telefone / Celular *
                </label>
                <input
                  id="reg-phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  className="form-input"
                  placeholder="(31) 98888-0000"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  disabled={isSubmitting}
                />
                <span className="form-help">Seu número permanece confidencial.</span>
              </div>
            </div>

            {/* Senha e Confirmação de Senha */}
            <div className="grid-two" style={{ gap: "16px", marginBottom: 0 }}>
              <div className="form-group">
                <label htmlFor="reg-password" className="form-label">
                  Senha segura *
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    className="form-input"
                    style={{ paddingRight: "44px" }}
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
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
                      alignItems: "center"
                    }}
                    title={showPassword ? "Ocultar senha" : "Ver senha"}
                    aria-label={showPassword ? "Ocultar senha" : "Ver senha"}
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="reg-confirm-password" className="form-label">
                  Confirmar Senha *
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="reg-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    className="form-input"
                    style={{
                      paddingRight: "44px",
                      borderColor: !passwordsMatch ? "#DC2626" : undefined
                    }}
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(p => !p)}
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
                      alignItems: "center"
                    }}
                    title={showConfirmPassword ? "Ocultar confirmação" : "Ver confirmação"}
                    aria-label={showConfirmPassword ? "Ocultar confirmação" : "Ver confirmação"}
                  >
                    {showConfirmPassword ? "🙈" : "👁️"}
                  </button>
                </div>
                {!passwordsMatch && (
                  <span style={{ color: "#DC2626", fontSize: "12px", marginTop: "4px", display: "block", fontWeight: 600 }}>
                    As senhas não coincidem
                  </span>
                )}
              </div>
            </div>

            <div className="grid-two" style={{ gap: "16px", marginBottom: 0 }}>
              <div className="form-group">
                <label htmlFor="reg-cpf" className="form-label">
                  CPF *
                </label>
                <input
                  id="reg-cpf"
                  type="text"
                  required
                  className="form-input"
                  placeholder="000.000.000-00"
                  maxLength={14}
                  value={cpf}
                  onChange={handleCpfChange}
                  disabled={isSubmitting}
                />
                <span className="form-help">Necessário para validação de segurança e repasses.</span>
              </div>

              <div className="form-group">
                <label htmlFor="reg-city" className="form-label">
                  Município em Minas Gerais *
                </label>
                <input
                  id="reg-city"
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ex.: João Monlevade, Belo Horizonte, etc."
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  disabled={isSubmitting}
                />
                <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn--outline"
                    style={{ padding: "3px 8px", fontSize: "11px" }}
                    onClick={() => setCity("João Monlevade")}
                  >
                    João Monlevade
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline"
                    style={{ padding: "3px 8px", fontSize: "11px" }}
                    onClick={() => setCity("Belo Horizonte")}
                  >
                    Belo Horizonte
                  </button>
                </div>
              </div>
            </div>

            {/* Seleção de Perfis (Remetente e/ou Transportador ao mesmo tempo) */}
            <fieldset className="form-group" style={{ border: "none", padding: 0, margin: "18px 0 22px 0" }}>
              <legend className="form-label" style={{ marginBottom: "4px", fontWeight: 700, fontSize: "15px" }}>
                Como deseja usar a Topic Log? *
              </legend>
              <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "var(--color-muted, #64748B)" }}>
                Você pode se cadastrar como <strong>Remetente e Transportador ao mesmo tempo</strong> para enviar pacotes e também realizar entregas com a mesma conta:
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {/* Opção 1: Remetente */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "16px",
                    borderRadius: "14px",
                    border: `2px solid ${isSender ? "#2563EB" : "#CBD5E1"}`,
                    backgroundColor: isSender ? "#EFF6FF" : "#FFFFFF",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSender}
                    onChange={(e) => setIsSender(e.target.checked)}
                    disabled={isSubmitting}
                    style={{ accentColor: "#2563EB", width: "20px", height: "20px", marginTop: "2px", cursor: "pointer" }}
                  />
                  <div>
                    <strong style={{ fontSize: "15px", color: "#0F172A", display: "block" }}>
                      📦 Remetente
                    </strong>
                    <span style={{ fontSize: "12px", color: "#64748B", lineHeight: "1.4", display: "block", marginTop: "2px" }}>
                      Desejo cadastrar e enviar encomendas para qualquer cidade.
                    </span>
                  </div>
                </label>

                {/* Opção 2: Transportador */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "16px",
                    borderRadius: "14px",
                    border: `2px solid ${isCarrier ? "#059669" : "#CBD5E1"}`,
                    backgroundColor: isCarrier ? "#ECFDF5" : "#FFFFFF",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isCarrier}
                    onChange={(e) => setIsCarrier(e.target.checked)}
                    disabled={isSubmitting}
                    style={{ accentColor: "#059669", width: "20px", height: "20px", marginTop: "2px", cursor: "pointer" }}
                  />
                  <div>
                    <strong style={{ fontSize: "15px", color: "#0F172A", display: "block" }}>
                      🚗 Transportador
                    </strong>
                    <span style={{ fontSize: "12px", color: "#64748B", lineHeight: "1.4", display: "block", marginTop: "2px" }}>
                      Desejo publicar viagens, fazer entregas e monetizar trajetos.
                    </span>
                  </div>
                </label>
              </div>

              {isSender && isCarrier ? (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    backgroundColor: "#F5F3FF",
                    border: "1px solid #DDD6FE",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: "#6D28D9",
                    fontWeight: 600
                  }}
                >
                  <span>🔄</span>
                  <span><strong>Perfil Completo:</strong> Você poderá alternar livremente entre enviar encomendas e realizar entregas com a mesma conta.</span>
                </div>
              ) : !isSender && !isCarrier ? (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    backgroundColor: "#FEF2F2",
                    border: "1px solid #FECACA",
                    fontSize: "12px",
                    color: "#DC2626",
                    fontWeight: 600
                  }}
                >
                  ⚠️ Selecione ao menos um perfil (Remetente ou Transportador) para prosseguir.
                </div>
              ) : null}
            </fieldset>

            <div
              style={{
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-primary-bg, #EFF6FF)",
                border: "1px solid rgba(21, 94, 239, 0.2)",
                marginBottom: "20px"
              }}
            >
              <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  required
                  checked={acceptTerms}
                  onChange={e => setAcceptTerms(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span>
                  Li e concordo com os{" "}
                  <Link href="/termos" target="_blank" style={{ fontWeight: 600, color: "var(--color-primary, #2563EB)" }}>
                    Termos de Uso e Diretrizes de Transporte da TopicLog
                  </Link>.
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="btn btn--primary"
              style={{ width: "100%", padding: "12px" }}
              disabled={isSubmitting || (!passwordsMatch && confirmPassword.length > 0) || (!isSender && !isCarrier)}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Criando conta..." : "Criar Minha Conta Topic Log"}
            </button>
          </form>

          <div
            style={{
              marginTop: "24px",
              paddingTop: "20px",
              borderTop: "1px solid var(--color-border, #E2E8F0)",
              textAlign: "center",
              fontSize: "14px",
              color: "var(--color-muted, #64748B)"
            }}
          >
            Já possui cadastro?{" "}
            <Link
              href="/entrar"
              style={{ fontWeight: 600, color: "var(--color-primary, #2563EB)", textDecoration: "none" }}
            >
              Fazer login
            </Link>
          </div>
        </div>
      </div>

      {/* Modal Visual de Sucesso */}
      {successModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "420px",
              width: "100%",
              textAlign: "center",
              padding: "32px 24px",
              borderRadius: "20px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              border: "1px solid #10B981"
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                backgroundColor: "#DCFCE7",
                color: "#16A34A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "32px",
                margin: "0 auto 16px auto"
              }}
            >
              ✓
            </div>
            <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px 0" }}>
              Conta criada com sucesso!
            </h2>
            <p style={{ fontSize: "14px", color: "#64748B", margin: "0 0 20px 0", lineHeight: "1.5" }}>
              Seu cadastro foi concluído. Redirecionando para a plataforma...
            </p>
            <div
              style={{
                width: "36px",
                height: "36px",
                border: "3px solid #E2E8F0",
                borderTopColor: "#2563EB",
                borderRadius: "50%",
                margin: "0 auto",
                animation: "spin 1s linear infinite"
              }}
            />
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}
