"use client";

import React, { useEffect, useState } from "react";
import { useAdminRole } from "../admin-context";
import {
  listLegalTemplatesApi,
  createLegalTemplateApi,
  updateLegalTemplateApi,
  approveLegalTemplateApi,
  publishLegalTemplateApi,
  previewLegalTemplateApi,
  compareLegalVersionsApi,
  listLegalAcceptancesApi
} from "@/lib/api-client";
import type {
  LegalDocumentTemplateDto,
  LegalAcceptanceDto,
  LegalDocumentCategory,
  LegalDocumentStatus,
  LegalScopeType,
  CompareLegalVersionsResponseDto
} from "@/lib/types";

const CATEGORY_LABELS: Record<LegalDocumentCategory, string> = {
  TERMS_OF_SERVICE: "Termos de Uso Gerais (D08)",
  CARRIER_ADHESION: "Termo de Adesão do Transportador",
  SENDER_ADHESION: "Termo de Adesão do Remetente",
  PRIVACY_POLICY: "Política de Privacidade & LGPD (D05)",
  PLATFORM_MEDIATION: "Mediação de Conflitos & Despesas",
  MUNICIPAL_REGULATION: "Regulamentação Municipal Específica"
};

const STATUS_COLORS: Record<LegalDocumentStatus, { bg: string; color: string; border: string }> = {
  DRAFT: { bg: "rgba(148, 163, 184, 0.15)", color: "#94A3B8", border: "rgba(148, 163, 184, 0.3)" },
  APPROVED: { bg: "rgba(59, 130, 246, 0.15)", color: "#60A5FA", border: "rgba(59, 130, 246, 0.3)" },
  PUBLISHED: { bg: "rgba(16, 185, 129, 0.15)", color: "#34D399", border: "rgba(16, 185, 129, 0.3)" },
  ARCHIVED: { bg: "rgba(107, 114, 128, 0.15)", color: "#9CA3AF", border: "rgba(107, 114, 128, 0.3)" }
};

const HOMOLOGATED_PLACEHOLDERS = [
  { code: "{{PLATFORM_NAME}}", label: "Nome da Plataforma" },
  { code: "{{USER_NAME}}", label: "Nome do Usuário" },
  { code: "{{USER_CPF}}", label: "CPF Mascarado" },
  { code: "{{EFFECTIVE_DATE}}", label: "Data de Vigência" },
  { code: "{{COMMISSION_RATE}}", label: "Alíquota de Comissão" },
  { code: "{{CARRIER_PLAN}}", label: "Plano do Transportador" },
  { code: "{{MUNICIPALITY_NAME}}", label: "Nome do Município" },
  { code: "{{STATE_UF}}", label: "UF do Estado" },
  { code: "{{VERSION}}", label: "Versão do Documento" }
];

export default function AdminJuridicoPage(): React.JSX.Element {
  const { role, token } = useAdminRole();

  const [activeTab, setActiveTab] = useState<"modelos" | "editor" | "comparador" | "aceites">("modelos");
  const [templates, setTemplates] = useState<LegalDocumentTemplateDto[]>([]);
  const [acceptances, setAcceptances] = useState<LegalAcceptanceDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  // Filtros de listagem
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Estado do formulário de editor / nova minuta
  const [editorId, setEditorId] = useState<string | null>(null);
  const [formCategory, setFormCategory] = useState<LegalDocumentCategory>("TERMS_OF_SERVICE");
  const [formTitle, setFormTitle] = useState<string>("");
  const [formScopeType, setFormScopeType] = useState<LegalScopeType>("NATIONAL");
  const [formStateUf, setFormStateUf] = useState<string>("MG");
  const [formIbgeCode, setFormIbgeCode] = useState<string>("");
  const [formCityName, setFormCityName] = useState<string>("");
  const [formContent, setFormContent] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");

  // Preview dinâmico
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // Modais de Ação
  const [selectedTemplateForAction, setSelectedTemplateForAction] = useState<LegalDocumentTemplateDto | null>(null);
  const [actionModalType, setActionModalType] = useState<"APPROVE" | "PUBLISH" | null>(null);
  const [actionNotes, setActionNotes] = useState<string>("");

  // Comparador de Versões
  const [diffTemplateId, setDiffTemplateId] = useState<string>("");
  const [diffTargetVersion, setDiffTargetVersion] = useState<string>("1.0.0");
  const [diffResult, setDiffResult] = useState<CompareLegalVersionsResponseDto | null>(null);
  const [diffLoading, setDiffLoading] = useState<boolean>(false);

  const canApprove = role === "LEGAL_OPERATOR" || role === "GENERAL_ADMIN";

  useEffect(() => {
    loadData();
  }, [token, filterCategory, filterStatus]);

  async function loadData() {
    if (!token) return;
    setLoading(true);
    setFeedback(null);

    const catParam = filterCategory === "ALL" ? undefined : filterCategory;
    const statParam = filterStatus === "ALL" ? undefined : filterStatus;

    const [tplRes, accRes] = await Promise.all([
      listLegalTemplatesApi({ category: catParam, status: statParam }, token),
      listLegalAcceptancesApi({}, token)
    ]);

    if (tplRes.ok && tplRes.data) {
      setTemplates(tplRes.data);
      const first = tplRes.data[0];
      if (!diffTemplateId && first) {
        setDiffTemplateId(first.id);
      }
    } else {
      setFeedback({ message: tplRes.problem?.detail ?? "Falha ao carregar modelos contratuais.", isError: true });
    }

    if (accRes.ok && accRes.data) {
      setAcceptances(accRes.data);
    }

    setLoading(false);
  }

  function handleOpenCreate() {
    setEditorId(null);
    setFormCategory("CARRIER_ADHESION");
    setFormTitle("Termo de Adesão do Transportador Autônomo");
    setFormScopeType("STATE");
    setFormStateUf("MG");
    setFormIbgeCode("");
    setFormCityName("");
    setFormContent(
      "## Termo de Adesão do Transportador\n\n" +
      "Pelo presente instrumento, o transportador **{{USER_NAME}}**, CPF nº **{{USER_CPF}}**, " +
      "adere formalmente à plataforma **{{PLATFORM_NAME}}** no estado de **{{STATE_UF}}**.\n\n" +
      "### Condições Operacionais\n" +
      "- Alíquota de comissão vinculada: **{{COMMISSION_RATE}}**\n" +
      "- Plano ativo: **{{CARRIER_PLAN}}**\n" +
      "- Vigência a partir de: **{{EFFECTIVE_DATE}}**\n\n" +
      "O transportador declara estar ciente de que a aceitação eletrônica possui fé pública e eficácia jurídica plena."
    );
    setFormNotes("Minuta inicial elaborada pelo operador");
    setPreviewContent(null);
    setActiveTab("editor");
  }

  function handleOpenEdit(t: LegalDocumentTemplateDto) {
    if (t.status === "PUBLISHED") {
      setFeedback({
        message: "Modelos publicados são imutáveis (Art. 10 MP 2.200-2). Para alterações, utilize a duplicação ou nova versão.",
        isError: true
      });
      return;
    }
    setEditorId(t.id);
    setFormCategory(t.category);
    setFormTitle(t.title);
    setFormScopeType(t.scopeType);
    setFormStateUf(t.stateUf ?? "MG");
    setFormIbgeCode(t.ibgeCityCode ?? "");
    setFormCityName(t.cityName ?? "");
    setFormContent(t.content);
    setFormNotes(t.changeNotes ?? "");
    setPreviewContent(null);
    setActiveTab("editor");
  }

  function handleInsertPlaceholder(chip: string) {
    setFormContent((prev) => prev + " " + chip + " ");
  }

  async function handleSimulatePreview() {
    if (!formContent.trim()) {
      setFeedback({ message: "Insira conteúdo Markdown antes de solicitar o preview.", isError: true });
      return;
    }
    setPreviewLoading(true);
    const res = await previewLegalTemplateApi(
      {
        content: formContent,
        sampleData: {
          USER_NAME: "Carlos Eduardo da Silva",
          USER_CPF: "123.***.***-00",
          MUNICIPALITY_NAME: formCityName || "João Monlevade",
          STATE_UF: formStateUf || "MG",
          CARRIER_PLAN: "Standard"
        }
      },
      token
    );
    setPreviewLoading(false);

    if (res.ok && res.data) {
      setPreviewContent(res.data.resolvedContent);
    } else {
      setFeedback({ message: res.problem?.detail ?? "Falha ao simular pré-visualização.", isError: true });
    }
  }

  async function handleSaveTemplate() {
    if (!formTitle.trim() || !formContent.trim()) {
      setFeedback({ message: "Título e Conteúdo Markdown são obrigatórios.", isError: true });
      return;
    }

    setLoading(true);
    setFeedback(null);

    if (editorId) {
      // Atualizar rascunho
      const res = await updateLegalTemplateApi(
        editorId,
        {
          title: formTitle,
          content: formContent,
          changeNotes: formNotes || "Atualização de rascunho"
        },
        token
      );
      if (res.ok) {
        setFeedback({ message: "Minuta contratual atualizada com sucesso!" });
        setActiveTab("modelos");
        await loadData();
      } else {
        setFeedback({ message: res.problem?.detail ?? "Falha ao atualizar minuta.", isError: true });
      }
    } else {
      // Criar nova minuta
      const res = await createLegalTemplateApi(
        {
          category: formCategory,
          title: formTitle,
          content: formContent,
          scopeType: formScopeType,
          stateUf: formStateUf || undefined,
          ibgeCityCode: formIbgeCode || undefined,
          cityName: formCityName || undefined,
          changeNotes: formNotes || "Versão inicial"
        },
        token
      );
      if (res.ok) {
        setFeedback({ message: "Nova minuta em rascunho (DRAFT) criada com sucesso!" });
        setActiveTab("modelos");
        await loadData();
      } else {
        setFeedback({ message: res.problem?.detail ?? "Falha ao criar minuta.", isError: true });
      }
    }
    setLoading(false);
  }

  async function handleExecuteAction() {
    if (!selectedTemplateForAction || !actionModalType) return;
    setLoading(true);

    if (actionModalType === "APPROVE") {
      const res = await approveLegalTemplateApi(
        selectedTemplateForAction.id,
        { legalNotes: actionNotes || "Aprovado em conformidade com o Código Civil e Marco Civil da Internet." },
        token
      );
      if (res.ok) {
        setFeedback({ message: `Modelo "${selectedTemplateForAction.title}" aprovado formalmente por ${role}!` });
        setActionModalType(null);
        await loadData();
      } else {
        setFeedback({ message: res.problem?.detail ?? "Falha ao aprovar modelo.", isError: true });
      }
    } else if (actionModalType === "PUBLISH") {
      const res = await publishLegalTemplateApi(
        selectedTemplateForAction.id,
        { effectiveDateUtc: new Date().toISOString() },
        token
      );
      if (res.ok) {
        setFeedback({
          message: `Modelo "${selectedTemplateForAction.title}" publicado oficialmente! Versões anteriores foram arquivadas.`
        });
        setActionModalType(null);
        await loadData();
      } else {
        setFeedback({ message: res.problem?.detail ?? "Falha ao publicar modelo.", isError: true });
      }
    }
    setLoading(false);
  }

  async function handleRunDiff() {
    if (!diffTemplateId) return;
    setDiffLoading(true);
    setDiffResult(null);

    const res = await compareLegalVersionsApi(diffTemplateId, diffTargetVersion || "1.0.0", token);
    setDiffLoading(false);

    if (res.ok && res.data) {
      setDiffResult(res.data);
    } else {
      setFeedback({ message: res.problem?.detail ?? "Falha ao processar comparação de versões.", isError: true });
    }
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "48px" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#FFFFFF", margin: 0 }}>
                Gestão Jurídica & Modelos Contratuais
              </h1>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 800,
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "#34D399",
                  border: "1px solid rgba(16, 185, 129, 0.3)"
                }}
              >
                PR-LEG-01 ATIVO
              </span>
            </div>
            <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
              Minutas dinâmicas, controle de placeholders homologados, segregação de funções (SoD) e histórico imutável de aceites (SHA-256).
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            style={{
              padding: "10px 18px",
              backgroundColor: "#2563EB",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
            }}
          >
            <span>➕</span> Nova Minuta Contratual
          </button>
        </div>
      </div>

      {/* Alerta de Segregação de Funções */}
      <div
        style={{
          padding: "12px 18px",
          borderRadius: "8px",
          backgroundColor: canApprove ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
          border: `1px solid ${canApprove ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
          color: canApprove ? "#A7F3D0" : "#FDE68A",
          fontSize: "13px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div>
          <strong>Segregação de Funções (SoD):</strong> Operando como <code>{role}</code>.
          {canApprove
            ? " Você possui permissão para aprovar minutas jurídicas formalmente antes da publicação."
            : " Seu perfil possui acesso de consulta/edição técnica. Aprovação formal restrita a LEGAL_OPERATOR ou GENERAL_ADMIN."}
        </div>
        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", backgroundColor: "#1E293B", borderRadius: "4px" }}>
          LGPD & Marco Civil
        </span>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "8px",
            backgroundColor: feedback.isError ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
            border: `1px solid ${feedback.isError ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
            color: feedback.isError ? "#FCA5A5" : "#6EE7B7",
            fontSize: "13px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Navegação por Abas */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", marginBottom: "24px" }}>
        {[
          { key: "modelos", label: "Modelos & Minutas", icon: "📑", count: templates.length },
          { key: "editor", label: editorId ? "Editar Minuta" : "Criar Nova Minuta", icon: "✏️" },
          { key: "comparador", label: "Comparador de Versões (Diff)", icon: "⚖️" },
          { key: "aceites", label: "Trilha de Aceites (SHA-256)", icon: "🛡️", count: acceptances.length }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: "12px 18px",
              backgroundColor: activeTab === tab.key ? "#1E293B" : "transparent",
              color: activeTab === tab.key ? "#38BDF8" : "#94A3B8",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid #38BDF8" : "2px solid transparent",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                style={{
                  fontSize: "11px",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(255,255,255,0.1)",
                  color: "#FFFFFF"
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ABA 1: MODELOS & MINUTAS */}
      {activeTab === "modelos" && (
        <div>
          {/* Barra de Filtros */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "20px",
              flexWrap: "wrap",
              backgroundColor: "#1E293B",
              padding: "14px 18px",
              borderRadius: "8px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 700 }}>Categoria:</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{
                  backgroundColor: "#0F172A",
                  color: "#FFFFFF",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  fontSize: "12px"
                }}
              >
                <option value="ALL">Todas as Categorias</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 700 }}>Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  backgroundColor: "#0F172A",
                  color: "#FFFFFF",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  fontSize: "12px"
                }}
              >
                <option value="ALL">Todos os Status</option>
                <option value="DRAFT">Minuta (DRAFT)</option>
                <option value="APPROVED">Aprovado (APPROVED)</option>
                <option value="PUBLISHED">Publicado (PUBLISHED)</option>
                <option value="ARCHIVED">Arquivado (ARCHIVED)</option>
              </select>
            </div>
          </div>

          {/* Grid de Modelos */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "16px" }}>
            {templates.map((t) => {
              const statusCfg = STATUS_COLORS[t.status];
              return (
                <div
                  key={t.id}
                  style={{
                    backgroundColor: "#1E293B",
                    borderRadius: "10px",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 800,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: "rgba(56, 189, 248, 0.15)",
                          color: "#38BDF8"
                        }}
                      >
                        {t.category}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          padding: "3px 8px",
                          borderRadius: "4px",
                          backgroundColor: statusCfg.bg,
                          color: statusCfg.color,
                          border: `1px solid ${statusCfg.border}`
                        }}
                      >
                        {t.status} • v{t.version}
                      </span>
                    </div>

                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#FFFFFF", margin: "0 0 6px 0" }}>
                      {t.title}
                    </h3>

                    <div style={{ fontSize: "12px", color: "#94A3B8", marginBottom: "12px" }}>
                      <strong>Abrangência:</strong> {t.scopeType}
                      {t.stateUf && ` (${t.stateUf})`}
                      {t.cityName && ` - ${t.cityName}`}
                      {t.ibgeCityCode && ` [IBGE: ${t.ibgeCityCode}]`}
                    </div>

                    <div style={{ fontSize: "11px", color: "#64748B", marginBottom: "16px", wordBreak: "break-all" }}>
                      <strong>Hash SHA-256:</strong> <code>{t.contentSha256 ? `${t.contentSha256.substring(0, 16)}...` : "Pendente"}</code>
                    </div>
                  </div>

                  {/* Ações por Status */}
                  <div style={{ display: "flex", gap: "8px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "14px" }}>
                    {t.status === "DRAFT" && (
                      <>
                        <button
                          onClick={() => handleOpenEdit(t)}
                          style={{
                            flex: 1,
                            padding: "8px",
                            backgroundColor: "#334155",
                            color: "#FFFFFF",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          ✏️ Editar
                        </button>

                        <button
                          onClick={() => {
                            setSelectedTemplateForAction(t);
                            setActionModalType("APPROVE");
                            setActionNotes("Minuta revisada pelo Jurídico Topic Log em conformidade com o Marco Civil e LGPD.");
                          }}
                          disabled={!canApprove}
                          title={!canApprove ? "Aprovação restrita a LEGAL_OPERATOR ou GENERAL_ADMIN" : ""}
                          style={{
                            flex: 1,
                            padding: "8px",
                            backgroundColor: canApprove ? "#2563EB" : "#475569",
                            color: "#FFFFFF",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: canApprove ? "pointer" : "not-allowed",
                            opacity: canApprove ? 1 : 0.6
                          }}
                        >
                          ⚖️ Aprovar
                        </button>
                      </>
                    )}

                    {t.status === "APPROVED" && (
                      <button
                        onClick={() => {
                          setSelectedTemplateForAction(t);
                          setActionModalType("PUBLISH");
                        }}
                        style={{
                          width: "100%",
                          padding: "8px",
                          backgroundColor: "#059669",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer"
                        }}
                      >
                        🚀 Publicar Oficialmente
                      </button>
                    )}

                    {t.status === "PUBLISHED" && (
                      <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                        <span style={{ fontSize: "11px", color: "#34D399", fontWeight: 700, alignSelf: "center", flex: 1 }}>
                          ✓ Vigente & Imutável
                        </span>
                        <button
                          onClick={() => {
                            setDiffTemplateId(t.id);
                            setDiffTargetVersion("1.0.0");
                            setActiveTab("comparador");
                          }}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#334155",
                            color: "#FFFFFF",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          Diff
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {templates.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "64px 0", color: "#64748B" }}>
              Nenhum modelo contratual encontrado para os filtros selecionados.
            </div>
          )}
        </div>
      )}

      {/* ABA 2: EDITOR DE MINUTAS & PREVIEW */}
      {activeTab === "editor" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* Coluna da Esquerda: Formulário de Edição */}
          <div style={{ backgroundColor: "#1E293B", padding: "24px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF", margin: "0 0 16px 0" }}>
              {editorId ? "Editar Minuta Contratual (Rascunho)" : "Cadastrar Nova Minuta Contratual"}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: "4px" }}>
                  Título do Documento *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    backgroundColor: "#0F172A",
                    color: "#FFFFFF",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px",
                    fontSize: "13px"
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: "4px" }}>
                    Categoria Legal
                  </label>
                  <select
                    value={formCategory}
                    disabled={!!editorId}
                    onChange={(e) => setFormCategory(e.target.value as LegalDocumentCategory)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      backgroundColor: "#0F172A",
                      color: "#FFFFFF",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "6px",
                      fontSize: "12px"
                    }}
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: "4px" }}>
                    Abrangência Territorial
                  </label>
                  <select
                    value={formScopeType}
                    disabled={!!editorId}
                    onChange={(e) => setFormScopeType(e.target.value as LegalScopeType)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      backgroundColor: "#0F172A",
                      color: "#FFFFFF",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "6px",
                      fontSize: "12px"
                    }}
                  >
                    <option value="NATIONAL">Nacional (Brasil)</option>
                    <option value="STATE">Estadual (MG)</option>
                    <option value="MUNICIPAL">Municipal (IBGE)</option>
                  </select>
                </div>
              </div>

              {formScopeType === "MUNICIPAL" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: "4px" }}>
                      Código IBGE do Município
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 3136207"
                      value={formIbgeCode}
                      onChange={(e) => setFormIbgeCode(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        backgroundColor: "#0F172A",
                        color: "#FFFFFF",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: "6px",
                        fontSize: "12px"
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: "4px" }}>
                      Nome do Município
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: João Monlevade"
                      value={formCityName}
                      onChange={(e) => setFormCityName(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        backgroundColor: "#0F172A",
                        color: "#FFFFFF",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: "6px",
                        fontSize: "12px"
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Barra de Placeholders Dinâmicos */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: "6px" }}>
                  Placeholders Dinâmicos Homologados (Clique para Inserir):
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {HOMOLOGATED_PLACEHOLDERS.map((chip) => (
                    <button
                      key={chip.code}
                      type="button"
                      onClick={() => handleInsertPlaceholder(chip.code)}
                      style={{
                        padding: "4px 8px",
                        fontSize: "11px",
                        backgroundColor: "#0F172A",
                        color: "#38BDF8",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontWeight: 600
                      }}
                      title={chip.label}
                    >
                      {chip.code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor de Conteúdo Markdown */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: "4px" }}>
                  Conteúdo da Minuta (Markdown) *
                </label>
                <textarea
                  rows={14}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "#0F172A",
                    color: "#FFFFFF",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    lineHeight: "1.5",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px",
                    resize: "vertical"
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={handleSimulatePreview}
                  disabled={previewLoading}
                  style={{
                    flex: 1,
                    padding: "10px",
                    backgroundColor: "#334155",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  {previewLoading ? "Simulando..." : "👁️ Simular Pré-visualização"}
                </button>

                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "10px",
                    backgroundColor: "#2563EB",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  {loading ? "Salvando..." : "💾 Salvar Rascunho (DRAFT)"}
                </button>
              </div>
            </div>
          </div>

          {/* Coluna da Direita: Preview Dinâmico */}
          <div style={{ backgroundColor: "#1E293B", padding: "24px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF", margin: 0 }}>
                Pré-visualização Dinâmica
              </h2>
              <span style={{ fontSize: "11px", color: "#94A3B8", backgroundColor: "#0F172A", padding: "2px 8px", borderRadius: "4px" }}>
                Sandbox Monlevade MG
              </span>
            </div>

            {previewContent ? (
              <div
                style={{
                  backgroundColor: "#0F172A",
                  padding: "18px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: "13px",
                  lineHeight: "1.6",
                  color: "#E2E8F0",
                  whiteSpace: "pre-wrap",
                  maxHeight: "560px",
                  overflowY: "auto"
                }}
              >
                {previewContent}
              </div>
            ) : (
              <div
                style={{
                  height: "360px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748B",
                  border: "2px dashed rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  textAlign: "center",
                  padding: "24px"
                }}
              >
                Clique em "Simular Pré-visualização" para validar a injeção dos dados dinâmicos e a segurança contra scripts.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 3: COMPARADOR DE VERSÕES (DIFF) */}
      {activeTab === "comparador" && (
        <div style={{ backgroundColor: "#1E293B", padding: "24px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF", margin: "0 0 16px 0" }}>
            Comparador Estruturado de Versões Contratuais (Diff)
          </h2>

          <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", marginBottom: "24px", flexWrap: "wrap" }}>
            <div style={{ minWidth: "300px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: "4px" }}>
                Modelo a Comparar
              </label>
              <select
                value={diffTemplateId}
                onChange={(e) => setDiffTemplateId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  backgroundColor: "#0F172A",
                  color: "#FFFFFF",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "6px",
                  fontSize: "13px"
                }}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} (v{t.version} - {t.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: "4px" }}>
                Versão Alvo
              </label>
              <input
                type="text"
                value={diffTargetVersion}
                onChange={(e) => setDiffTargetVersion(e.target.value)}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#0F172A",
                  color: "#FFFFFF",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "6px",
                  fontSize: "13px",
                  width: "120px"
                }}
              />
            </div>

            <button
              onClick={handleRunDiff}
              disabled={diffLoading || !diffTemplateId}
              style={{
                padding: "8px 18px",
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer"
              }}
            >
              {diffLoading ? "Comparando..." : "⚖️ Executar Comparação"}
            </button>
          </div>

          {diffResult && (
            <div>
              <div style={{ display: "flex", gap: "16px", marginBottom: "16px", fontSize: "13px" }}>
                <span style={{ color: "#34D399" }}>
                  <strong>Adições (+):</strong> {diffResult.totalAdditions} linhas
                </span>
                <span style={{ color: "#F87171" }}>
                  <strong>Exclusões (-):</strong> {diffResult.totalDeletions} linhas
                </span>
                <span style={{ color: "#94A3B8" }}>
                  Comparando versão <code>{diffResult.sourceVersion}</code> com <code>{diffResult.targetVersion}</code>
                </span>
              </div>

              <div
                style={{
                  backgroundColor: "#0F172A",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  padding: "16px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  maxHeight: "480px",
                  overflowY: "auto"
                }}
              >
                {diffResult.diffChunks.map((chunk, idx) => {
                  let lineBg = "transparent";
                  let lineText = "#94A3B8";
                  let sign = "  ";

                  if (chunk.changeType === "ADDED") {
                    lineBg = "rgba(16, 185, 129, 0.15)";
                    lineText = "#34D399";
                    sign = "+ ";
                  } else if (chunk.changeType === "REMOVED") {
                    lineBg = "rgba(239, 68, 68, 0.15)";
                    lineText = "#F87171";
                    sign = "- ";
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        padding: "2px 6px",
                        backgroundColor: lineBg,
                        color: lineText,
                        whiteSpace: "pre-wrap"
                      }}
                    >
                      {sign}
                      {chunk.text}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 4: HISTÓRICO DE ACEITES ELETRÔNICOS */}
      {activeTab === "aceites" && (
        <div style={{ backgroundColor: "#1E293B", padding: "24px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF", margin: 0 }}>
              Trilha de Auditoria Imutável de Aceites Bilaterais (SHA-256)
            </h2>
            <span style={{ fontSize: "12px", color: "#34D399", fontWeight: 700 }}>
              ✓ Em conformidade com MP 2.200-2/2001
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "left", color: "#94A3B8" }}>
                  <th style={{ padding: "10px" }}>Data / Hora UTC</th>
                  <th style={{ padding: "10px" }}>Documento</th>
                  <th style={{ padding: "10px" }}>Versão</th>
                  <th style={{ padding: "10px" }}>Papel</th>
                  <th style={{ padding: "10px" }}>Hash do Aceite (SHA-256)</th>
                  <th style={{ padding: "10px" }}>IP Origem</th>
                </tr>
              </thead>
              <tbody>
                {acceptances.map((acc) => (
                  <tr key={acc.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", color: "#E2E8F0" }}>
                    <td style={{ padding: "10px" }}>{new Date(acc.acceptedAtUtc).toLocaleString("pt-BR")}</td>
                    <td style={{ padding: "10px", fontWeight: 600 }}>{acc.documentTitle}</td>
                    <td style={{ padding: "10px" }}>v{acc.documentVersion}</td>
                    <td style={{ padding: "10px" }}>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: 700,
                          backgroundColor: "#334155",
                          color: "#38BDF8"
                        }}
                      >
                        {acc.userRole}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <code style={{ fontSize: "11px", color: "#A7F3D0" }}>
                        {acc.contentSha256 ? acc.contentSha256.substring(0, 24) + "..." : "c0ffee..."}
                      </code>
                    </td>
                    <td style={{ padding: "10px", color: "#94A3B8" }}>{acc.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {acceptances.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#64748B" }}>
                Nenhum registro de aceite formal registrado ainda no sandbox.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE APROVAÇÃO OU PUBLICAÇÃO */}
      {actionModalType && selectedTemplateForAction && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
        >
          <div
            style={{
              backgroundColor: "#1E293B",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "540px",
              border: "1px solid rgba(255,255,255,0.1)"
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 12px 0" }}>
              {actionModalType === "APPROVE" ? "Aprovação Jurídica Formal" : "Publicação Oficial da Minuta"}
            </h3>

            <p style={{ fontSize: "13px", color: "#94A3B8", lineHeight: "1.5", margin: "0 0 16px 0" }}>
              {actionModalType === "APPROVE"
                ? `Você está aprovando o modelo "${selectedTemplateForAction.title}" (v${selectedTemplateForAction.version}). Esta ação atesta conformidade jurídica e libera a minuta para publicação.`
                : `Você está publicando oficialmente o modelo "${selectedTemplateForAction.title}" (v${selectedTemplateForAction.version}). Documentos publicados tornam-se imutáveis e versões anteriores são arquivadas automaticamente.`}
            </p>

            {actionModalType === "APPROVE" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: "4px" }}>
                  Parecer / Notas Jurídicas *
                </label>
                <textarea
                  rows={3}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    backgroundColor: "#0F172A",
                    color: "#FFFFFF",
                    fontSize: "12px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px"
                  }}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setActionModalType(null)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#334155",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer"
                }}
              >
                Cancelar
              </button>

              <button
                onClick={handleExecuteAction}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  backgroundColor: actionModalType === "APPROVE" ? "#2563EB" : "#059669",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer"
                }}
              >
                {loading ? "Processando..." : actionModalType === "APPROVE" ? "Confirmar Aprovação" : "Confirmar Publicação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
