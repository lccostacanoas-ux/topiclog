"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { KycStepper } from "../../components/KycStepper";
import { StatusPill } from "../../components/StatusPill";
import {
  evaluateBilateralKycApi,
  getKycDossierApi,
  reanalyzeKycCaseApi,
  reviewKycDecisionApi,
  submitKycCaseApi
} from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import type {
  BilateralKycEvaluationResponse,
  KycCheckType,
  KycDossierResponse,
  ProblemDetailsDto
} from "../../lib/types";

export default function KycVerificationPage(): React.JSX.Element {
  const { user, token, isAuthenticated, isLoading: isAuthLoading, reloadProfile } = useAuth();

  const [dossier, setDossier] = useState<KycDossierResponse | null>(null);
  const [isLoadingDossier, setIsLoadingDossier] = useState(false);

  // Formulário de submissão inicial
  const [cpf, setCpf] = useState("");
  const [identityDocRef, setIdentityDocRef] = useState("private/kyc/doc_sintetico_01");
  const [addressProofRef, setAddressProofRef] = useState("private/kyc/addr_sintetico_01");
  const [facialSessionRef, setFacialSessionRef] = useState("fac_sandbox_session_01");
  const [consentGiven, setConsentGiven] = useState(false);

  // Formulário de reanálise
  const [reanalysisDocRef, setReanalysisDocRef] = useState("private/kyc/doc_sintetico_rev_02");
  const [reanalysisAddrRef, setReanalysisAddrRef] = useState("private/kyc/addr_sintetico_rev_02");
  const [reanalysisFacialRef, setReanalysisFacialRef] = useState("fac_sandbox_session_rev_02");
  const [appealJustification, setAppealJustification] = useState("Envio de novo documento com melhor legibilidade");

  // Simulador de elegibilidade bilateral (D05)
  const [evalSenderId, setEvalSenderId] = useState("");
  const [evalCarrierId, setEvalCarrierId] = useState("");
  const [bilateralResult, setBilateralResult] = useState<BilateralKycEvaluationResponse | null>(null);
  const [isEvaluatingBilateral, setIsEvaluatingBilateral] = useState(false);

  // Estados de execução
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [problem, setProblem] = useState<ProblemDetailsDto | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadDossier = async () => {
    if (!token) return;
    setIsLoadingDossier(true);
    try {
      const res = await getKycDossierApi(token);
      if (res.ok && res.data) {
        setDossier(res.data);
      } else if (res.problem) {
        setProblem(res.problem);
      }
    } finally {
      setIsLoadingDossier(false);
    }
  };

  useEffect(() => {
    if (token) {
      void loadDossier();
    }
  }, [token]);

  useEffect(() => {
    if (user?.userId) {
      setEvalSenderId(user.userId);
      setEvalCarrierId(user.userId); // Por padrão preenche mesmo ID para demonstrar bloqueio de autocontratação
    }
  }, [user?.userId]);

  // Submissão dos 4 checks
  const handleSubmitKyc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    setProblem(null);
    setSuccessMessage(null);

    // Validação preventiva no frontend (LGPD / D05)
    if (
      identityDocRef.includes("data:image") ||
      addressProofRef.includes("data:image") ||
      facialSessionRef.includes("data:image") ||
      facialSessionRef.includes("base64,")
    ) {
      setProblem({
        title: "Violação de Privacidade LGPD (D05)",
        status: 400,
        detail: "Proibido enviar biometria facial bruta ou imagens codificadas em base64. Envie apenas a referência opaca da sessão.",
        ruleCode: "RAW_BIOMETRY_PAYLOAD_FORBIDDEN"
      });
      return;
    }

    if (!consentGiven) {
      setProblem({
        title: "Consentimento obrigatório",
        status: 400,
        detail: "É obrigatório fornecer consentimento explícito para tratamento de metadados de verificação (LGPD / D05).",
        ruleCode: "KYC_CONSENT_REQUIRED"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitKycCaseApi(token, {
        cpf: cpf.trim(),
        identityDocumentRef: identityDocRef.trim(),
        addressProofRef: addressProofRef.trim(),
        partnerFacialSessionRef: facialSessionRef.trim(),
        consentGiven: true
      });

      if (res.ok && res.data) {
        setDossier(res.data);
        setSuccessMessage("Dossiê de KYC submetido com sucesso! Status atualizado para IN_REVIEW.");
        await reloadProfile();
      } else {
        setProblem(res.problem ?? {
          title: "Falha na submissão de KYC",
          status: res.status,
          detail: "Não foi possível registrar o caso de verificação."
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Pedido de reanálise
  const handleReanalysis = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token || !dossier?.activeCaseId) return;
    setProblem(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const res = await reanalyzeKycCaseApi(token, dossier.activeCaseId, {
        identityDocumentRef: reanalysisDocRef.trim(),
        addressProofRef: reanalysisAddrRef.trim(),
        partnerFacialSessionRef: reanalysisFacialRef.trim(),
        appealJustification: appealJustification.trim()
      });

      if (res.ok && res.data) {
        setDossier(res.data);
        setSuccessMessage("Pedido de reanálise submetido com sucesso! O caso retornou para IN_REVIEW.");
        await reloadProfile();
      } else {
        setProblem(res.problem ?? {
          title: "Falha no pedido de reanálise",
          status: res.status,
          detail: "Não foi possível solicitar reanálise."
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Teste de decisão de revisão (demonstra RBAC / SoD)
  const handleTestReviewDecision = async (targetStatus: "VERIFIED" | "REJECTED") => {
    if (!token || !dossier?.activeCaseId) return;
    setProblem(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const res = await reviewKycDecisionApi(token, dossier.activeCaseId, {
        targetStatus,
        checkResults: [
          { checkType: "CPF_STATUS", status: "PASSED" },
          { checkType: "IDENTITY_DOCUMENT", status: "PASSED" },
          { checkType: "ADDRESS_PROOF", status: "PASSED" },
          { checkType: "FACIAL_BIOMETRY_PARTNER", status: "PASSED" }
        ],
        justificationOrRejectionReason: `Tentativa de revisão via interface (${targetStatus})`,
        validityDays: 365
      });

      if (res.ok && res.data) {
        setDossier(res.data);
        setSuccessMessage(`Decisão ${targetStatus} aplicada com sucesso!`);
        await reloadProfile();
      } else {
        setProblem(res.problem ?? {
          title: "Ação negada pelo backend",
          status: res.status,
          detail: "Operação não autorizada."
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Avaliação de elegibilidade bilateral (D05)
  const handleEvaluateBilateral = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    setProblem(null);
    setIsEvaluatingBilateral(true);

    try {
      const res = await evaluateBilateralKycApi(token, {
        senderUserId: evalSenderId.trim(),
        carrierUserId: evalCarrierId.trim()
      });

      if (res.ok && res.data) {
        setBilateralResult(res.data);
      } else {
        setProblem(res.problem ?? {
          title: "Falha na avaliação bilateral",
          status: res.status,
          detail: "Não foi possível avaliar a elegibilidade bilateral."
        });
      }
    } finally {
      setIsEvaluatingBilateral(false);
    }
  };

  if (isAuthLoading) {
    return (
      <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
        <div className="card" aria-busy="true">
          <p style={{ margin: 0, color: "var(--color-muted)" }}>Carregando...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
        <div className="card" style={{ maxWidth: "540px", margin: "0 auto", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", marginTop: 0 }}>Acesso Restrito</h1>
          <p style={{ color: "var(--color-muted)", marginBottom: "20px" }}>
            Você precisa estar autenticado para acessar a verificação de identidade (KYC).
          </p>
          <Link href="/entrar" className="btn btn--primary">
            Fazer Login
          </Link>
        </div>
      </main>
    );
  }

  const currentStatus = dossier?.currentKycStatus ?? user.kycStatus;

  return (
    <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
      <header className="card" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)" }}>
              Topic Log • Verificação Progressiva de Identidade (D05 / LGPD)
            </span>
            <h1 style={{ fontSize: "28px", lineHeight: "36px", margin: "6px 0 0 0" }}>
              Dossiê de KYC e Elegibilidade Bilateral
            </h1>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => void loadDossier()}
              disabled={isLoadingDossier}
            >
              {isLoadingDossier ? "Atualizando..." : "Recarregar Dossiê"}
            </button>
          </div>
        </div>
      </header>

      {successMessage && (
        <AlertBanner tone="success" title="Sucesso" message={successMessage} onClose={() => setSuccessMessage(null)} />
      )}

      {problem && (
        <AlertBanner
          tone="danger"
          title={problem.title}
          message={problem.detail}
          problem={problem}
          onClose={() => setProblem(null)}
        />
      )}

      {/* Stepper Visual de KYC Progressivo */}
      <section className="card" style={{ marginBottom: "24px" }}>
        <KycStepper currentStatus={currentStatus} />

        {/* Tabela dos 4 Checks Obrigatórios */}
        <h2 style={{ fontSize: "18px", marginTop: "16px", marginBottom: "8px" }}>
          Os 4 Checks Obrigatórios (D05)
        </h2>
        <div className="table-responsive">
          <table className="data-table" aria-label="Status dos 4 checks obrigatórios">
            <thead>
              <tr>
                <th>Check Obrigatório</th>
                <th>Status Atual</th>
                <th>Referência Segura (Opaca)</th>
                <th>Data de Validação</th>
              </tr>
            </thead>
            <tbody>
              {(dossier?.checks && dossier.checks.length > 0) ? (
                dossier.checks.map(c => (
                  <tr key={c.checkId}>
                    <td><strong>{c.checkType}</strong></td>
                    <td>
                      <StatusPill
                        label={c.status}
                        tone={c.status === "PASSED" ? "success" : c.status === "FAILED" ? "danger" : "warning"}
                      />
                    </td>
                    <td><code>{c.evidenceReference}</code></td>
                    <td>{c.verifiedAtUtc ? new Date(c.verifiedAtUtc).toLocaleString("pt-BR") : "Pendente"}</td>
                  </tr>
                ))
              ) : (
                <>
                  <tr>
                    <td><strong>CPF_STATUS</strong></td>
                    <td><StatusPill label="PENDENTE" tone="neutral" /></td>
                    <td><em>Aguardando submissão</em></td>
                    <td>—</td>
                  </tr>
                  <tr>
                    <td><strong>IDENTITY_DOCUMENT</strong></td>
                    <td><StatusPill label="PENDENTE" tone="neutral" /></td>
                    <td><em>Aguardando submissão</em></td>
                    <td>—</td>
                  </tr>
                  <tr>
                    <td><strong>ADDRESS_PROOF</strong></td>
                    <td><StatusPill label="PENDENTE" tone="neutral" /></td>
                    <td><em>Aguardando submissão</em></td>
                    <td>—</td>
                  </tr>
                  <tr>
                    <td><strong>FACIAL_BIOMETRY_PARTNER</strong></td>
                    <td><StatusPill label="PENDENTE" tone="neutral" /></td>
                    <td><em>Aguardando submissão</em></td>
                    <td>—</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Formulário de Submissão Inicial (Quando NOT_STARTED ou PENDING) */}
      {currentStatus === "NOT_STARTED" && (
        <section className="card" style={{ marginBottom: "24px" }} aria-labelledby="submit-kyc-heading">
          <h2 id="submit-kyc-heading" style={{ fontSize: "20px", marginTop: 0, marginBottom: "8px" }}>
            Submissão dos 4 Checks Obrigatórios (D05)
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "16px" }}>
            Envie seu CPF e as referências seguras dos documentos. Em conformidade com a LGPD e a decisão D05,
            <strong> imagens e biometria facial bruta não são armazenadas</strong> na Topic Log: informe exclusivamente
            identificadores opacos emitidos pelo parceiro homologado.
          </p>

          <form onSubmit={handleSubmitKyc}>
            <div className="form-group">
              <label htmlFor="kyc-cpf" className="form-label">
                CPF (11 dígitos numéricos) *
              </label>
              <input
                id="kyc-cpf"
                type="text"
                required
                className="form-input"
                placeholder="000.000.000-00 ou 11 dígitos"
                value={cpf}
                onChange={e => setCpf(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid-two" style={{ gap: "16px" }}>
              <div className="form-group">
                <label htmlFor="kyc-doc-ref" className="form-label">
                  Referência do Documento de Identidade (RG/CNH) *
                </label>
                <input
                  id="kyc-doc-ref"
                  type="text"
                  required
                  className="form-input"
                  value={identityDocRef}
                  onChange={e => setIdentityDocRef(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="kyc-addr-ref" className="form-label">
                  Referência do Comprovante de Endereço *
                </label>
                <input
                  id="kyc-addr-ref"
                  type="text"
                  required
                  className="form-input"
                  value={addressProofRef}
                  onChange={e => setAddressProofRef(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="kyc-facial-ref" className="form-label">
                Referência de Sessão de Biometria Facial no Parceiro *
              </label>
              <input
                id="kyc-facial-ref"
                type="text"
                required
                className="form-input"
                value={facialSessionRef}
                onChange={e => setFacialSessionRef(e.target.value)}
                disabled={isSubmitting}
              />
              <span className="form-help">
                Proibido colar payloads <code>data:image</code> ou vetores binários brutos (D05).
              </span>
            </div>

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
                  checked={consentGiven}
                  onChange={e => setConsentGiven(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span>
                  Forneço consentimento explícito para verificação de identidade e tratamento de metadados
                  nos termos da LGPD e da arquitetura Topic Log (D05).
                </span>
              </label>
            </div>

            <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
              {isSubmitting ? "Enviando para Análise..." : "Submeter Documentos para Análise"}
            </button>
          </form>
        </section>
      )}

      {/* Formulário de Reanálise (Quando REJECTED ou EXPIRED) */}
      {(currentStatus === "REJECTED" || currentStatus === "EXPIRED") && (
        <section className="card" style={{ marginBottom: "24px", borderLeft: "4px solid var(--color-danger)" }} aria-labelledby="reanalysis-heading">
          <h2 id="reanalysis-heading" style={{ fontSize: "20px", marginTop: 0, marginBottom: "8px" }}>
            Solicitação de Reanálise de Documentos
          </h2>

          {dossier?.rejectionReason && (
            <AlertBanner
              tone="warning"
              title="Motivo da Reprovação Registrado pelo Revisor"
              message={dossier.rejectionReason}
            />
          )}

          <form onSubmit={handleReanalysis}>
            <div className="form-group">
              <label htmlFor="rean-just" className="form-label">Justificativa da Reanálise *</label>
              <input
                id="rean-just"
                type="text"
                required
                className="form-input"
                value={appealJustification}
                onChange={e => setAppealJustification(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid-two" style={{ gap: "16px" }}>
              <div className="form-group">
                <label htmlFor="rean-doc" className="form-label">Nova Referência de Documento *</label>
                <input
                  id="rean-doc"
                  type="text"
                  required
                  className="form-input"
                  value={reanalysisDocRef}
                  onChange={e => setReanalysisDocRef(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="rean-addr" className="form-label">Nova Referência de Endereço *</label>
                <input
                  id="rean-addr"
                  type="text"
                  required
                  className="form-input"
                  value={reanalysisAddrRef}
                  onChange={e => setReanalysisAddrRef(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="rean-face" className="form-label">Nova Referência de Sessão Facial *</label>
              <input
                id="rean-face"
                type="text"
                required
                className="form-input"
                value={reanalysisFacialRef}
                onChange={e => setReanalysisFacialRef(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
              {isSubmitting ? "Enviando..." : "Submeter Pedido de Reanálise"}
            </button>
          </form>
        </section>
      )}

      {/* Verificador de Elegibilidade Bilateral (D05) */}
      <section className="card" style={{ marginBottom: "24px" }} aria-labelledby="bilateral-heading">
        <h2 id="bilateral-heading" style={{ fontSize: "20px", marginTop: 0, marginBottom: "8px" }}>
          Simulador de Elegibilidade Bilateral (D05)
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "16px" }}>
          Antes de qualquer contratação, o backend avalia de forma independente se o Remetente e o Transportador
          possuem KYC VERIFIED, os 4 checks aprovados e termos aceitos.
        </p>

        <form onSubmit={handleEvaluateBilateral}>
          <div className="grid-two" style={{ gap: "16px" }}>
            <div className="form-group">
              <label htmlFor="eval-sender" className="form-label">ID do Usuário Remetente (GUID)</label>
              <input
                id="eval-sender"
                type="text"
                required
                className="form-input"
                value={evalSenderId}
                onChange={e => setEvalSenderId(e.target.value)}
                disabled={isEvaluatingBilateral}
              />
            </div>

            <div className="form-group">
              <label htmlFor="eval-carrier" className="form-label">ID do Usuário Transportador (GUID)</label>
              <input
                id="eval-carrier"
                type="text"
                required
                className="form-input"
                value={evalCarrierId}
                onChange={e => setEvalCarrierId(e.target.value)}
                disabled={isEvaluatingBilateral}
              />
            </div>
          </div>

          <button type="submit" className="btn btn--secondary" disabled={isEvaluatingBilateral}>
            {isEvaluatingBilateral ? "Consultando backend..." : "Avaliar Elegibilidade Bilateral (POST /evaluate-bilateral)"}
          </button>
        </form>

        {bilateralResult && (
          <div style={{ marginTop: "20px", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", backgroundColor: "var(--color-background)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <strong>Resultado da Avaliação Bilateral:</strong>
              <StatusPill
                label={bilateralResult.isEligible ? "Apto para Contratação" : "Contratação Bloqueada"}
                tone={bilateralResult.isEligible ? "success" : "danger"}
              />
            </div>
            <p style={{ margin: "4px 0", fontSize: "14px" }}>{bilateralResult.summaryMessage}</p>

            {bilateralResult.blockingCodes.length > 0 && (
              <div style={{ marginTop: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-danger)" }}>Pendências Impeditivas:</span>
                <ul style={{ margin: "4px 0 0 0", paddingLeft: "20px", color: "var(--color-danger)", fontSize: "13px" }}>
                  {bilateralResult.blockingCodes.map(code => (
                    <li key={code}><code>{code}</code></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Painel de Demonstração de Governança RBAC / SoD */}
      <section className="card" aria-labelledby="rbac-demo-heading">
        <h2 id="rbac-demo-heading" style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px" }}>
          Demonstração de Controles de Segurança Backend (RBAC / ABAC / SoD)
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "16px" }}>
          O backend valida rigorosamente as permissões. Use os botões abaixo para testar a resposta do servidor:
          se você for um usuário comum, receberá <code>403 AUTH_FORBIDDEN_INSUFFICIENT_ROLE</code>; se for o próprio titular do caso,
          a tentativa de autoaprovação será bloqueada com <code>403 KYC_SELF_APPROVAL_FORBIDDEN</code> (Segregação de Funções).
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => void handleTestReviewDecision("VERIFIED")}
            disabled={isSubmitting || !dossier?.activeCaseId}
          >
            Testar Decisão de Aprovação (POST /review-decision)
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => void handleTestReviewDecision("REJECTED")}
            disabled={isSubmitting || !dossier?.activeCaseId}
          >
            Testar Decisão de Reprovação (POST /review-decision)
          </button>
        </div>
      </section>
    </main>
  );
}
