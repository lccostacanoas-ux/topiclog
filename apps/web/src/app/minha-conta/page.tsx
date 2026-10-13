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
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  const handleManualRefresh = async () => {
    setProblem(null);
    setSuccessMessage(null);
    setIsRefreshing(true);
    try {
      const ok = await refresh();
      if (ok) {
        setSuccessMessage("Sessão renovada com sucesso (Rotação de Refresh Token — DEC-02.4)!");
      } else {
        setProblem({
          title: "Sessão expirada",
          status: 401,
          detail: "A sessão não pôde ser renovada. Faça login novamente."
        });
      }
    } finally {
      setIsRefreshing(false);
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
              Topic Log • Minha Conta (PR-01)
            </span>
            <h1 style={{ fontSize: "28px", lineHeight: "36px", margin: "6px 0 0 0" }}>
              Olá, {user.displayName}
            </h1>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <StatusPill
              label={`KYC: ${user.kycStatus}`}
              tone={
                user.kycStatus === "VERIFIED"
                  ? "success"
                  : user.kycStatus === "REJECTED"
                  ? "danger"
                  : "warning"
              }
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

      {/* Destaque de Permissões e KYC Progressivo (D05) */}
      <section className="grid-two" style={{ marginBottom: "24px" }} aria-label="Status de navegação e contratação">
        <div className="card" style={{ borderLeft: "4px solid var(--color-success)" }}>
          <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px" }}>
            Navegação na Plataforma (D05)
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", margin: "0 0 12px 0" }}>
            Você pode explorar livremente o feed de encomendas e viagens em todo o estado de Minas Gerais.
          </p>
          <StatusPill label="Navegação Liberada (Sem KYC obrigatório)" tone="success" />
        </div>

        <div
          className="card"
          style={{
            borderLeft: `4px solid ${user.canContractDelivery ? "var(--color-success)" : "var(--color-warning)"}`
          }}
        >
          <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px" }}>
            Contratação de Entregas (D05)
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", margin: "0 0 12px 0" }}>
            {user.canContractDelivery
              ? "Sua conta cumpriu os 4 checks obrigatórios e está liberada para contratações bilaterais."
              : "A contratação bilateral exige verificação obrigatória de identidade de ambas as partes."}
          </p>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <StatusPill
              label={user.canContractDelivery ? "Contratação Habilitada" : "Bloqueada até Conclusão do KYC"}
              tone={user.canContractDelivery ? "success" : "warning"}
            />
            {!user.canContractDelivery && (
              <Link href="/verificacao-kyc" className="btn btn--secondary" style={{ padding: "4px 12px", fontSize: "13px" }}>
                Completar Verificação
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Dados Privados vs. Cartão Público (Minimização LGPD) */}
      <div className="grid-two" style={{ marginBottom: "24px" }}>
        {/* Painel de Perfil Privado */}
        <section className="card" aria-labelledby="private-profile-heading">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 id="private-profile-heading" style={{ fontSize: "20px", margin: 0 }}>
              Perfil Privado (ABAC)
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
              <p><strong>Telefone mascarado:</strong> {user.phoneMasked} <span style={{ color: "var(--color-muted)", fontSize: "12px" }}>(Criptografado)</span></p>
              <p><strong>CPF mascarado:</strong> {user.cpfMasked ?? "Não informado ainda"}</p>
              <p><strong>Município:</strong> {user.city} - {user.stateUf}</p>
              <p>
                <strong>Papéis cadastrados:</strong>{" "}
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
                    {r}
                  </span>
                ))}
              </p>
              <p style={{ color: "var(--color-muted)", fontSize: "12px", marginTop: "12px" }}>
                Termos aceitos: versão <code>{user.termsAcceptedVersion}</code> em {new Date(user.termsAcceptedAtUtc).toLocaleString("pt-BR")}.
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
                    Remetente (SENDER)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editRoles.includes("CARRIER")}
                      onChange={() => handleRoleToggle("CARRIER")}
                    />
                    Transportador (CARRIER)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editRoles.includes("RECIPIENT")}
                      onChange={() => handleRoleToggle("RECIPIENT")}
                    />
                    Destinatário (RECIPIENT)
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

        {/* Pré-visualização do Cartão Público Mínimo (Minimização LGPD) */}
        <section className="card" aria-labelledby="public-card-heading">
          <h2 id="public-card-heading" style={{ fontSize: "20px", marginTop: 0, marginBottom: "8px" }}>
            Cartão Público Mínimo (LGPD)
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "13px", marginBottom: "16px" }}>
            Demonstração de segurança perceptível (04-Design-System.md Seção 8): é exatamente assim que
            outros usuários veem seu perfil no marketplace. <strong>E-mail, telefone e CPF jamais aparecem.</strong>
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
                  label={publicCard.isKycVerified ? "Verificado" : "Não verificado"}
                  tone={publicCard.isKycVerified ? "success" : "neutral"}
                />
              </div>

              <p style={{ margin: "4px 0", color: "var(--color-muted)", fontSize: "13px" }}>
                Localidade: {publicCard.city} - {publicCard.stateUf}
              </p>

              <p style={{ margin: "4px 0", fontSize: "13px" }}>
                Papéis públicos: {publicCard.publicRoles.join(", ")}
              </p>

              <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "var(--color-primary)", fontWeight: 600 }}>
                Avaliação: ★ {Number(publicCard.ratingAvg).toFixed(2)} ({publicCard.ratingCount} entregas)
              </p>
            </div>
          ) : (
            <p style={{ color: "var(--color-muted)" }}>Carregando cartão público...</p>
          )}
        </section>
      </div>

      {/* Controle de Sessão e Segurança */}
      <section className="card">
        <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px" }}>
          Gerenciamento de Sessão Criptográfica (DEC-02)
        </h2>
        <p style={{ color: "var(--color-muted)", fontSize: "14px", marginBottom: "16px" }}>
          Sessão assinada via JWT HMAC-SHA256 com rotação de refresh tokens e detecção automática de reuso.
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void handleManualRefresh()}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Renovando sessão..." : "Testar Renovação (Refresh Token)"}
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => void reloadProfile()}
          >
            Sincronizar Dados com Backend
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => void logout()}
          >
            Encerrar Sessão
          </button>
        </div>
      </section>
    </main>
  );
}
