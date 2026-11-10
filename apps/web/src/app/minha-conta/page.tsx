"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { StatusPill } from "../../components/StatusPill";
import { getPublicUserCardApi, updatePrivateProfileApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import type { ProblemDetailsDto, PublicUserCardResponse, UserRole } from "../../lib/types";

export default function MyAccountPage(): React.JSX.Element {
  const { user, token, isAuthenticated, isLoading, reloadProfile, refresh, logout } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editRoles, setEditRoles] = useState<UserRole[]>(["SENDER"]);

  const [publicCard, setPublicCard] = useState<PublicUserCardResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [problem, setProblem] = useState<ProblemDetailsDto | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Carrega valores do perfil para edição
  useEffect(() => {
    if (user) {
      setEditDisplayName(user.displayName);
      setEditPhone("");
      setEditCpf("");
      setEditCity(user.city);
      setEditRoles([...user.roles]);
    }
  }, [user]);

  // Carrega cartão público mínimo para demonstrar minimização de dados LGPD
  useEffect(() => {
    let isMounted = true;
    if (token && user?.userId) {
      void getPublicUserCardApi(token, user.userId).then(res => {
        if (isMounted && res.ok && res.data) {
          setPublicCard(res.data);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [token, user?.userId]);

  const handleRoleToggle = (role: UserRole) => {
    setEditRoles(prev => {
      if (prev.includes(role)) {
        if (prev.length === 1) return prev; // Ao menos 1 papel obrigatório
        return prev.filter(r => r !== role);
      }
      return [...prev, role];
    });
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    setProblem(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const result = await updatePrivateProfileApi(token, {
        displayName: editDisplayName.trim() || undefined,
        phone: editPhone.trim() || undefined,
        cpf: editCpf.trim() || undefined,
        city: editCity.trim() || undefined,
        stateUf: "MG",
        roles: editRoles
      });

      if (result.ok && result.data) {
        setSuccessMessage("Perfil privado atualizado com sucesso no backend!");
        setIsEditing(false);
        await reloadProfile();
      } else {
        setProblem(result.problem ?? {
          title: "Falha na atualização do perfil",
          status: result.status,
          detail: "Não foi possível atualizar o perfil."
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
        <div className="card" aria-busy="true">
          <p style={{ margin: 0, color: "var(--color-muted)" }}>Carregando dados da conta...</p>
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
            Você precisa estar autenticado para acessar a página Minha Conta.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <Link href="/entrar" className="btn btn--primary">
              Fazer Login
            </Link>
            <Link href="/cadastro" className="btn btn--outline">
              Criar Conta Gratuita
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="container" style={{ paddingTop: "32px", paddingBottom: "48px" }}>
      <header className="card" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)" }}>
              TopicLog • Minha Conta
            </span>
            <h1 style={{ fontSize: "28px", lineHeight: "36px", margin: "6px 0 0 0" }}>
              Olá, {user.displayName}
            </h1>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <StatusPill
              label={user.kycStatus === "VERIFIED" ? "Identidade Confirmada" : "Cadastro Ativo"}
              tone={user.kycStatus === "VERIFIED" ? "success" : "neutral"}
            />
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

      {/* Painéis de Status e Verificação da Conta */}
      <section className="grid-two" style={{ marginBottom: "24px" }} aria-label="Status da conta e segurança">
        <div className="card" style={{ borderLeft: "4px solid var(--color-success)" }}>
          <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px" }}>
            Envio de Encomendas
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", margin: "0 0 12px 0" }}>
            Você pode publicar pedidos de transporte e receber propostas de motoristas para qualquer localidade de Minas Gerais.
          </p>
          <StatusPill label="Envios Liberados na Plataforma" tone="success" />
        </div>

        <div
          className="card"
          style={{
            borderLeft: `4px solid ${user.kycStatus === "VERIFIED" ? "var(--color-success)" : "#3B82F6"}`
          }}
        >
          <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px" }}>
            Verificação de Identidade
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", margin: "0 0 12px 0" }}>
            {user.kycStatus === "VERIFIED"
              ? "Sua identidade foi confirmada e sua conta possui selo de confiança na plataforma."
              : "Seus dados básicos estão ativos. Você pode enviar seus documentos para obter o selo de perfil verificado quando desejar."}
          </p>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <StatusPill
              label={user.kycStatus === "VERIFIED" ? "Perfil com Selo Verificado" : "Cadastro Básico Concluído"}
              tone={user.kycStatus === "VERIFIED" ? "success" : "neutral"}
            />
            {user.kycStatus !== "VERIFIED" && (
              <Link href="/verificacao-kyc" className="btn btn--secondary" style={{ padding: "4px 12px", fontSize: "13px" }}>
                Verificar Documentos
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Meus Dados vs. Perfil Público */}
      <div className="grid-two" style={{ marginBottom: "24px" }}>
        {/* Painel de Dados Cadastrais */}
        <section className="card" aria-labelledby="private-profile-heading">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 id="private-profile-heading" style={{ fontSize: "20px", margin: 0 }}>
              Meus Dados Cadastrais
            </h2>
            <button
              type="button"
              className="btn btn--outline"
              style={{ padding: "4px 10px", fontSize: "13px" }}
              onClick={() => setIsEditing(prev => !prev)}
            >
              {isEditing ? "Cancelar Edição" : "Editar Dados"}
            </button>
          </div>

          {!isEditing ? (
            <div style={{ fontSize: "14px", lineHeight: "24px" }}>
              <p><strong>Nome:</strong> {user.displayName}</p>
              <p><strong>E-mail:</strong> {user.email}</p>
              <p><strong>Telefone:</strong> {user.phoneMasked}</p>
              <p><strong>CPF:</strong> {user.cpfMasked ?? "Não informado"}</p>
              <p><strong>Município:</strong> {user.city} - {user.stateUf}</p>
              <p>
                <strong>Meu Perfil:</strong>{" "}
                {user.roles.map(r => (
                  <span
                    key={r}
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      marginRight: "6px",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--color-primary-bg)",
                      color: "var(--color-primary)",
                      fontWeight: 600,
                      fontSize: "12px"
                    }}
                  >
                    {r === "SENDER" ? "Remetente" : r === "CARRIER" ? "Transportador" : "Destinatário"}
                  </span>
                ))}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile}>
              <div className="form-group">
                <label htmlFor="edit-name" className="form-label">Nome completo ou comercial</label>
                <input
                  id="edit-name"
                  type="text"
                  className="form-input"
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-phone" className="form-label">Novo Telefone (opcional)</label>
                <input
                  id="edit-phone"
                  type="tel"
                  className="form-input"
                  placeholder="Deixe em branco para manter o atual"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-cpf" className="form-label">Novo CPF (opcional)</label>
                <input
                  id="edit-cpf"
                  type="text"
                  className="form-input"
                  placeholder="Deixe em branco para manter o atual"
                  value={editCpf}
                  onChange={e => setEditCpf(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-city" className="form-label">Município (MG)</label>
                <input
                  id="edit-city"
                  type="text"
                  className="form-input"
                  value={editCity}
                  onChange={e => setEditCity(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              <fieldset className="form-group" style={{ border: "none", padding: 0 }}>
                <legend className="form-label" style={{ marginBottom: "6px" }}>Papéis ativos</legend>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editRoles.includes("SENDER")}
                      onChange={() => handleRoleToggle("SENDER")}
                    />
                    Remetente (Enviar encomendas)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editRoles.includes("CARRIER")}
                      onChange={() => handleRoleToggle("CARRIER")}
                    />
                    Transportador (Realizar transportes)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editRoles.includes("RECIPIENT")}
                      onChange={() => handleRoleToggle("RECIPIENT")}
                    />
                    Destinatário (Receber)
                  </label>
                </div>
              </fieldset>

              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button type="submit" className="btn btn--primary" disabled={isSaving}>
                  {isSaving ? "Salvando..." : "Gravar Alterações"}
                </button>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Pré-visualização do Perfil Público (Privacidade LGPD) */}
        <section className="card" aria-labelledby="public-card-heading">
          <h2 id="public-card-heading" style={{ fontSize: "20px", marginTop: 0, marginBottom: "8px" }}>
            Como outros usuários veem você (Perfil Público)
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "13px", marginBottom: "16px" }}>
            Para garantir sua privacidade conforme a LGPD, seu e-mail, telefone particular e CPF <strong>nunca são exibidos</strong> publicamente. Apenas seu primeiro nome, cidade e reputação ficam visíveis.
          </p>

          {publicCard ? (
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-background)",
                border: "1px solid var(--color-border)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "16px" }}>{publicCard.abbreviatedDisplayName}</strong>
                <StatusPill
                  label={publicCard.isKycVerified ? "Identidade Verificada" : "Não verificado"}
                  tone={publicCard.isKycVerified ? "success" : "neutral"}
                />
              </div>

              <p style={{ margin: "4px 0", color: "var(--color-muted)", fontSize: "13px" }}>
                Localidade: {publicCard.city} - {publicCard.stateUf}
              </p>

              <p style={{ margin: "4px 0", fontSize: "13px" }}>
                Papéis na plataforma: {publicCard.publicRoles.map(r => r === "SENDER" ? "Remetente" : r === "CARRIER" ? "Transportador" : "Destinatário").join(", ")}
              </p>

              {publicCard.ratingCount > 0 ? (
                <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "var(--color-primary)", fontWeight: 600 }}>
                  Avaliação: ★ {Number(publicCard.ratingAvg).toFixed(2)} ({publicCard.ratingCount} entregas avaliadas)
                </p>
              ) : (
                <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "var(--color-muted)" }}>
                  Avaliação: Ainda sem avaliações (as estrelas serão exibidas após as primeiras entregas e interações)
                </p>
              )}
            </div>
          ) : (
            <p style={{ color: "var(--color-muted)" }}>Carregando dados do perfil...</p>
          )}
        </section>
      </div>

      {/* Segurança da Conta e Encerramento de Sessão */}
      <section className="card">
        <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px" }}>
          Segurança da Conta
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "16px" }}>
          Sua conta está conectada de forma segura com proteção de dados e autenticação criptográfica.
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => void logout()}
            style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 700 }}
          >
            🚪 Sair da Conta (Encerrar Sessão)
          </button>
        </div>
      </section>
    </main>
  );
}
