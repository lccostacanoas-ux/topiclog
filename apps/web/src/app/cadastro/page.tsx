"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { getTermsManifestApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import type { ProblemDetailsDto, UserRole } from "../../lib/types";

export default function RegisterPage(): React.JSX.Element {
  const router = useRouter();
  const { register } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [city, setCity] = useState("João Monlevade");
  const [roles, setRoles] = useState<UserRole[]>(["SENDER"]);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [termsVersion, setTermsVersion] = useState("2026.1-D08-DRAFT");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [problem, setProblem] = useState<ProblemDetailsDto | null>(null);

  // Carrega versão vigente do manifesto de termos D08 da API
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

  const handleRoleToggle = (role: UserRole) => {
    setRoles(prev => {
      if (prev.includes(role)) {
        if (prev.length === 1) return prev; // Mantém ao menos 1 papel
        return prev.filter(r => r !== role);
      }
      return [...prev, role];
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProblem(null);

    if (!displayName.trim() || !email.trim() || !password || !phone.trim()) {
      setProblem({
        title: "Campos obrigatórios pendentes",
        status: 400,
        detail: "Preencha nome, e-mail, senha e telefone para criar a conta."
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

    if (!acceptTerms) {
      setProblem({
        title: "Aceite dos termos obrigatório (D08)",
        status: 400,
        detail: "É obrigatório aceitar os Termos de Uso vigentes para se cadastrar na plataforma."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        cpf: cpf.trim() || undefined,
        city: city.trim(),
        stateUf: "MG",
        initialRoles: roles,
        acceptTerms: true,
        termsVersion
      });

      if (result.ok) {
        router.push("/minha-conta");
      } else {
        setProblem(result.problem ?? {
          title: "Falha no cadastro",
          status: result.status,
          detail: "Não foi possível concluir o cadastro. Verifique os dados informados."
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
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)" }}>
            Topic Log • Cadastro Aberto (D02 / D05)
          </span>
          <h1 style={{ fontSize: "28px", lineHeight: "36px", marginTop: "8px", marginBottom: "8px" }}>
            Criar Conta Gratuita
          </h1>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "20px" }}>
            Crie sua conta multipapel para navegar livremente por encomendas e viagens em Minas Gerais.
            A verificação de identidade (KYC) só será exigida no momento da contratação (D05).
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
                <span className="form-help">Criptografado com AES-256-GCM (DEC-02).</span>
              </div>
            </div>

            <div className="grid-two" style={{ gap: "16px", marginBottom: 0 }}>
              <div className="form-group">
                <label htmlFor="reg-password" className="form-label">
                  Senha segura *
                </label>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="form-input"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="reg-cpf" className="form-label">
                  CPF (Opcional agora — D05)
                </label>
                <input
                  id="reg-cpf"
                  type="text"
                  className="form-input"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={e => setCpf(e.target.value)}
                  disabled={isSubmitting}
                />
                <span className="form-help">Pode ser preenchido depois na etapa de KYC.</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="reg-city" className="form-label">
                Município em Minas Gerais (MG — D02) *
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
              <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn--outline"
                  style={{ padding: "4px 8px", fontSize: "12px" }}
                  onClick={() => setCity("João Monlevade")}
                >
                  Piloto 1: João Monlevade
                </button>
                <button
                  type="button"
                  className="btn btn--outline"
                  style={{ padding: "4px 8px", fontSize: "12px" }}
                  onClick={() => setCity("Belo Horizonte")}
                >
                  Piloto 2: Belo Horizonte
                </button>
              </div>
              <span className="form-help">
                A presença de um município no cadastro não garante disponibilidade imediata de transportadores ativos (D02).
              </span>
            </div>

            <fieldset className="form-group" style={{ border: "none", padding: 0, margin: "0 0 16px 0" }}>
              <legend className="form-label" style={{ marginBottom: "8px" }}>
                Como deseja utilizar a Topic Log? (Multipapel permitido)
              </legend>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={roles.includes("SENDER")}
                    onChange={() => handleRoleToggle("SENDER")}
                    disabled={isSubmitting}
                  />
                  <span>
                    <strong>Remetente / Cliente (SENDER):</strong> Enviar pequenas encomendas entre cidades de MG
                  </span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={roles.includes("CARRIER")}
                    onChange={() => handleRoleToggle("CARRIER")}
                    disabled={isSubmitting}
                  />
                  <span>
                    <strong>Transportador (CARRIER):</strong> Aproveitar rotas com bicicleta (5 kg), moto (20 kg) ou carro (20 kg — D03/D04)
                  </span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={roles.includes("RECIPIENT")}
                    onChange={() => handleRoleToggle("RECIPIENT")}
                    disabled={isSubmitting}
                  />
                  <span>
                    <strong>Destinatário (RECIPIENT):</strong> Acompanhar recebimento com código seguro e foto (D16)
                  </span>
                </label>
              </div>
            </fieldset>

            <div
              style={{
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-primary-bg)",
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
                  <Link href="/termos" target="_blank" style={{ fontWeight: 600, color: "var(--color-primary)" }}>
                    Termos de Responsabilidade Distribuída ({termsVersion} — D08)
                  </Link>
                  , ciente de que a plataforma não possui cláusula abusiva de isenção absoluta e que a contratação
                  exigirá verificação de identidade bilateral prévia (D05).
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="btn btn--primary"
              style={{ width: "100%", padding: "12px" }}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Criando conta..." : "Criar Minha Conta Topic Log"}
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
            Já possui cadastro?{" "}
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
